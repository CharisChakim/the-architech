import { strict as assert } from "node:assert";
import { PassThrough } from "node:stream";
import test from "node:test";

import type { RuntimeDetection } from "../runtimes/types.ts";
import type { RuntimeEvent, RuntimeExecutor } from "../runtimes/execution/types.ts";
import type { ClaudeSdkQuery } from "../runtimes/execution/claude.ts";
import { startAntigravityExecution } from "../runtimes/execution/antigravity.ts";
import { createRuntimeRunner, createRuntimeRunnerAsync, type ClaudeSdkModule } from "./index.ts";

// Contract tests for broken provider streams: cut off, repeated, malformed,
// and unknown events, as the runner hands them to the chat route.

function detectionFor(runtime: "claude" | "antigravity"): RuntimeDetection {
  return {
    runtime,
    status: "ready",
    authStatus: "authenticated",
    binaryPath: `/fixture/${runtime}`,
    version: "fixture",
    checkedAt: new Date(0).toISOString(),
    capabilities: {
      structuredOutput: "unknown",
      toolUse: "supported",
      approval: "supported",
      resume: "supported",
      interrupt: "supported",
      usage: "unknown",
      streaming: "supported",
    },
    catalog: null,
    diagnostic: null,
  };
}

const unusedCodex = (): RuntimeExecutor => { throw new Error("Codex is not part of these tests."); };

async function collect(events: AsyncIterable<RuntimeEvent>, withinMs = 2_000): Promise<RuntimeEvent[]> {
  const received: RuntimeEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`stream still open after ${withinMs}ms: ${JSON.stringify(received)}`)), withinMs);
  });
  try {
    return await Promise.race([
      (async () => {
        for await (const event of events) received.push(event);
        return received;
      })(),
      deadline,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const fatal = (event: RuntimeEvent | undefined) => event?.type === "error" && event.fatal;
const code = (event: RuntimeEvent | undefined) => event?.type === "error" ? event.error.code : event?.type === "done" ? event.error?.code : undefined;

// --- Claude ------------------------------------------------------------------

const SESSION = "claude_session_fixture";
const delta = (text: string) => ({
  type: "stream_event",
  session_id: SESSION,
  event: { type: "content_block_delta", delta: { type: "text_delta", text } },
});
const success = { type: "result", subtype: "success", session_id: SESSION, result: "ok" };

async function claudeTurn(script: () => AsyncGenerator<unknown>, signal = new AbortController().signal): Promise<RuntimeEvent[]> {
  const sdk: ClaudeSdkModule = {
    query: () => {
      const query: ClaudeSdkQuery = {
        [Symbol.asyncIterator]: script,
        interrupt: async () => {},
        close: async () => {},
      };
      return query;
    },
  };
  const runner = await createRuntimeRunnerAsync({
    runtime: "claude",
    prompt: "fixture",
    detection: detectionFor("claude"),
    signal,
    dependencies: { createCodexExecutor: unusedCodex, loadClaudeSdk: () => sdk },
  });
  return collect(runner.events);
}

test("claude: a stream that ends before its result is a fatal error, not a silent end", async () => {
  const events = await claudeTurn(async function* () {
    yield delta("partial");
  });

  assert.equal(events[0]?.type, "text");
  assert.equal(events.some((event) => event.type === "done"), false);
  assert.equal(fatal(events.at(-1)), true);
  assert.equal(code(events.at(-1)), "CLAUDE_RESULT_MISSING");
});

test("claude: a stream that ends because the run was stopped is not reported as missing a result", async () => {
  const stop = new AbortController();
  const events = await claudeTurn(async function* () {
    yield delta("partial");
    stop.abort();
  }, stop.signal);

  assert.equal(events.some((event) => code(event) === "CLAUDE_RESULT_MISSING"), false);
});

test("claude: an SDK that throws mid-stream keeps what arrived and ends with a fatal error", async () => {
  const events = await claudeTurn(async function* () {
    yield delta("before");
    throw new Error("socket hang up");
  });

  assert.equal(events[0]?.type, "text");
  assert.equal(fatal(events.at(-1)), true);
  assert.equal(code(events.at(-1)), "SDK_ERROR");
});

test("claude: malformed messages are non-fatal and the turn still completes", async () => {
  const events = await claudeTurn(async function* () {
    yield null;
    yield { no: "type" };
    yield { type: "stream_event", session_id: SESSION };
    yield delta("after");
    yield success;
  });

  const errors = events.filter((event) => event.type === "error");
  assert.equal(errors.length, 3);
  assert.equal(errors.every((event) => !fatal(event) && code(event) === "MALFORMED_EVENT"), true);
  assert.equal(events.find((event) => event.type === "done")?.type === "done"
    && (events.find((event) => event.type === "done") as { status: string }).status, "completed");
});

test("claude: unknown message types are ignored", async () => {
  const events = await claudeTurn(async function* () {
    yield { type: "ping" };
    yield { type: "something_the_sdk_adds_later", payload: { any: true } };
    yield delta("kept");
    yield success;
  });

  assert.deepEqual(events.map((event) => event.type), ["text", "done"]);
});

test("claude: a repeated result produces one done", async () => {
  const events = await claudeTurn(async function* () {
    yield delta("once");
    yield success;
    yield success;
  });

  assert.equal(events.filter((event) => event.type === "done").length, 1);
  assert.equal(events.filter((event) => event.type === "text").length, 1);
});

// --- Antigravity ---------------------------------------------------------------

class AgyChild {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly signals: (NodeJS.Signals | undefined)[] = [];
  readonly stdin = { write: () => true, end: () => undefined };
  private closeListener: ((code: number | null, signal: NodeJS.Signals | null) => void) | undefined;

  once(event: "error" | "close", listener: (...args: any[]) => void): this {
    if (event === "close") this.closeListener = listener;
    return this;
  }

  kill(signal?: NodeJS.Signals): boolean {
    this.signals.push(signal);
    this.exit(null, signal ?? "SIGTERM");
    return true;
  }

  line(value: unknown): void {
    this.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value)}\n`);
  }

  exit(code: number | null, signal: NodeJS.Signals | null = null): void {
    const listener = this.closeListener;
    this.closeListener = undefined;
    // Like a real child, close follows the end of its output streams.
    setImmediate(() => listener?.(code, signal));
  }
}

const init = { event: "init", conversation_id: "agy_c1", init: { cwd: "/workspace", model: "fixture" } };
const agyResult = { event: "result", result: { conversation_id: "agy_c1", status: "SUCCESS", response: "ok" } };

async function agyTurn(script: (child: AgyChild) => void): Promise<{ events: RuntimeEvent[]; child: AgyChild }> {
  const child = new AgyChild();
  const runner = createRuntimeRunner({
    runtime: "antigravity",
    prompt: "fixture",
    detection: detectionFor("antigravity"),
    signal: new AbortController().signal,
    dependencies: {
      createCodexExecutor: unusedCodex,
      createAntigravityExecution: (options) => startAntigravityExecution({ ...options, spawn: () => child }),
    },
  });
  const events = collect(runner.events);
  script(child);
  const received = await events;
  await runner.executor.close();
  return { events: received, child };
}

const doneOf = (events: RuntimeEvent[]) => events.find((event) => event.type === "done") as Extract<RuntimeEvent, { type: "done" }> | undefined;

test("antigravity: a CLI that exits mid-run without a result fails the run", async () => {
  const { events } = await agyTurn((child) => {
    child.line(init);
    child.exit(1);
  });

  assert.equal(doneOf(events)?.status, "failed");
  assert.equal(doneOf(events)?.error?.code, "AGY_PROCESS_EXITED");
});

test("antigravity: a CLI that exits cleanly without a result is not treated as done", async () => {
  const { events } = await agyTurn((child) => {
    child.line(init);
    child.exit(0);
  });

  assert.equal(doneOf(events)?.status, "failed");
  assert.equal(doneOf(events)?.error?.code, "AGY_RESULT_MISSING");
});

test("antigravity: a last line cut off by the exit fails the run instead of being guessed at", async () => {
  const { events } = await agyTurn((child) => {
    child.line(init);
    child.stdout.write(JSON.stringify(agyResult).slice(0, 25));
    child.exit(0);
  });

  assert.equal(doneOf(events)?.status, "failed");
  assert.equal(doneOf(events)?.error?.code, "AGY_PROTOCOL_ERROR");
});

test("antigravity: a malformed line stops the CLI and fails the run", async () => {
  // Unlike the Codex and Claude streams, AGY fails closed on a line it cannot
  // read: its stream-json output has no framing to resynchronise on.
  const { events, child } = await agyTurn((agy) => {
    agy.line(init);
    agy.line("{not json");
  });

  assert.equal(fatal(events.find((event) => event.type === "error")), true);
  assert.equal(doneOf(events)?.status, "failed");
  assert.equal(doneOf(events)?.error?.code, "AGY_PROTOCOL_ERROR");
  assert.equal(child.signals[0], "SIGTERM");
  assert.doesNotMatch(JSON.stringify(events), /not json/);
});

test("antigravity: an unknown event does not stop the run", async () => {
  const { events } = await agyTurn((child) => {
    child.line(init);
    child.line({ event: "something_new", something_new: { any: true } });
    child.line(agyResult);
  });

  assert.equal(events.some((event) => event.type === "error"), false);
  assert.equal(doneOf(events)?.status, "completed");
});

test("antigravity: a repeated result produces one done", async () => {
  const { events } = await agyTurn((child) => {
    child.line(init);
    child.line(agyResult);
    child.line(agyResult);
  });

  assert.equal(events.filter((event) => event.type === "done").length, 1);
  assert.equal(doneOf(events)?.status, "completed");
});
