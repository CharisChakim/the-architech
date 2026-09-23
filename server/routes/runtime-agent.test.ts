import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { RuntimeDetection } from "../runtimes/types.ts";
import type {
  RuntimeApprovalHandler,
  RuntimeEvent,
  RuntimeExecutor,
  RuntimeTurnRequest,
} from "../runtimes/execution/types.ts";

// db.ts reads this when it is first imported, so everything that touches the
// database is loaded dynamically, after the data directory is disposable.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "architech-runtime-agent-test-"));
process.env.ARCHITECH_DATA_DIR = dataDir;
process.on("exit", () => fs.rmSync(dataDir, { recursive: true, force: true }));

const express = (await import("express")).default;
const { saveSession } = await import("../../db.ts");
const { listRuns, listRunEvidence } = await import("../runs/store.ts");
const { createRuntimeAgentRouter } = await import("./runtime-agent.ts");

const detection: RuntimeDetection = {
  runtime: "codex",
  status: "ready",
  authStatus: "authenticated",
  binaryPath: "/fixture/codex",
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

const done: RuntimeEvent = {
  type: "done",
  status: "completed",
  threadId: "thread_fixture",
  turnId: "turn_fixture",
  error: null,
};

/**
 * Stands in for the provider. Each started turn is counted, because a second
 * turn is exactly the duplicate tool execution these tests guard against.
 */
class ProviderFixture {
  readonly turns: RuntimeTurnRequest[] = [];
  interrupts = 0;
  approvalHandler: RuntimeApprovalHandler | undefined;
  private release: () => void = () => {};
  private readonly released = new Promise<void>((resolve) => { this.release = resolve; });
  private started: () => void = () => {};
  readonly firstTurnStarted = new Promise<void>((resolve) => { this.started = resolve; });

  constructor(private readonly script: (fixture: ProviderFixture) => AsyncGenerator<RuntimeEvent>) {}

  finish(): void {
    this.release();
  }

  waitUntilReleased(): Promise<void> {
    return this.released;
  }

  executor(): RuntimeExecutor {
    const stream = (request: RuntimeTurnRequest): AsyncIterable<RuntimeEvent> => {
      this.turns.push(request);
      this.started();
      return this.script(this);
    };
    return {
      startTurn: stream,
      resumeTurn: stream,
      interrupt: async () => { this.interrupts += 1; this.finish(); },
      close: async () => {},
    };
  }
}

async function withServer(
  provider: ProviderFixture,
  body: (url: string) => Promise<void>,
): Promise<void> {
  const app = express();
  app.use(express.json());
  app.use(createRuntimeAgentRouter({
    discover: async () => detection,
    runnerDependencies: {
      createCodexExecutor: (options) => {
        provider.approvalHandler = options.approvalHandler;
        return provider.executor();
      },
    },
  }));
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    await body(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

let counter = 0;
function project(workspaceRoot = fs.mkdtempSync(path.join(dataDir, "workspace-"))): { sessionId: string; taskId: string; workspaceRoot: string } {
  counter += 1;
  const sessionId = `session-${counter}`;
  const taskId = `task-${counter}`;
  saveSession({ id: sessionId, title: sessionId, workspaceRoot, tasks: [{ id: taskId, title: "Fixture task" }] });
  return { sessionId, taskId, workspaceRoot };
}

type SseEvent = Record<string, unknown> & { type: string };

async function chat(url: string, body: Record<string, unknown>): Promise<SseEvent[]> {
  const res = await fetch(`${url}/api/runtime-agent/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ runtime: "codex", message: "Do the task.", ...body }),
  });
  const raw = await res.text();
  return raw.split("\n\n")
    .map((chunk) => chunk.split("\n").find((line) => line.startsWith("data: ")))
    .filter((line): line is string => Boolean(line))
    .map((line) => JSON.parse(line.slice(6)) as SseEvent);
}

test("a repeated request with the same idempotency key does not start a second provider turn", async () => {
  const provider = new ProviderFixture(async function* (fixture) {
    yield { type: "text", text: "working", threadId: "thread_fixture", turnId: "turn_fixture", itemId: null };
    await fixture.waitUntilReleased();
    yield done;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const request = { sessionId, taskId, idempotencyKey: "double-click-1" };
    const first = chat(url, request);
    await provider.firstTurnStarted;

    // The duplicate arrives while the first turn is still streaming, which is
    // what a double-click or a client that re-sends after a reconnect does.
    const whileRunning = chat(url, request);
    await new Promise((resolve) => setTimeout(resolve, 100));
    provider.finish();
    const [original, followed] = await Promise.all([first, whileRunning]);
    const afterFinish = await chat(url, request);

    assert.equal(provider.turns.length, 1);
    assert.equal(listRuns({ taskId }).length, 1);
    for (const events of [original, followed, afterFinish]) {
      assert.equal(events.filter((event) => event.type === "done").length, 1);
      assert.equal(events.at(-1)?.type, "done");
      assert.equal(events.at(-1)?.runStatus, "completed");
      assert.equal(events.filter((event) => event.type === "text").length, 1);
    }
    assert.equal(new Set([...original, ...followed, ...afterFinish].map((event) => event.runId)).size, 1);
  });
});

test("replaying a finished run returns every stored event, not the first page", async () => {
  const provider = new ProviderFixture(async function* () {
    for (let index = 0; index < 150; index += 1) {
      yield { type: "text", text: `${index} `, threadId: "thread_fixture", turnId: "turn_fixture", itemId: null };
    }
    yield done;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const request = { sessionId, taskId, idempotencyKey: "long-run" };
    const original = await chat(url, request);
    const replayed = await chat(url, request);

    assert.equal(provider.turns.length, 1);
    assert.equal(original.filter((event) => event.type === "text").length, 150);
    assert.equal(replayed.filter((event) => event.type === "text").length, 150);
    assert.equal(replayed.filter((event) => event.type === "done").length, 1);
  });
});

test("stopping from the chat interrupts the provider turn and ends the run as interrupted", async () => {
  const provider = new ProviderFixture(async function* (fixture) {
    yield { type: "text", text: "working", threadId: "thread_fixture", turnId: "turn_fixture", itemId: null };
    await fixture.waitUntilReleased();
    yield { ...done, status: "interrupted" } as RuntimeEvent;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    // The chat's Stop button aborts the request, as useAgentRun does.
    const stop = new AbortController();
    const res = await fetch(`${url}/api/runtime-agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "codex", message: "Do the task.", sessionId, taskId, idempotencyKey: "stop-me" }),
      signal: stop.signal,
    });
    const reader = res.body!.getReader();
    await reader.read();
    await provider.firstTurnStarted;
    stop.abort();
    await reader.read().catch(() => undefined);

    let run = listRuns({ taskId })[0];
    for (let i = 0; i < 50 && run?.status === "running"; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      run = listRuns({ taskId })[0];
    }
    assert.equal(provider.interrupts > 0, true);
    assert.equal(run?.status, "interrupted");
  });
});

test("a runtime session that is new to a chat is told what was said before it", async () => {
  let run = 0;
  const provider = new ProviderFixture(async function* () {
    run += 1;
    const threadId = `thread_${run}`;
    yield { type: "text", text: `answer ${run}`, threadId, turnId: `turn_${run}`, itemId: null };
    yield { ...done, threadId, turnId: `turn_${run}` };
  });
  const conversationId = "conversation-switch";

  await withServer(provider, async (url) => {
    // First runtime session, then a second one in the same chat (as when the
    // user switches runtime), then back to the first.
    const firstEvents = await chat(url, { conversationId, message: "Use Postgres for storage.", idempotencyKey: "switch-1" });
    const secondEvents = await chat(url, { conversationId, message: "Add a users table.", idempotencyKey: "switch-2" });
    const thirdEvents = await chat(url, { conversationId, message: "Now add indexes.", externalSessionId: "thread_1", idempotencyKey: "switch-3" });

    // The chat is told when, and how much, earlier conversation was handed over.
    const carried = (events: SseEvent[]) => events.find((event) => event.type === "context_carried");
    assert.equal(carried(firstEvents), undefined);
    assert.deepEqual([carried(secondEvents)?.included, carried(secondEvents)?.omitted, carried(secondEvents)?.resumed], [2, 0, false]);
    assert.deepEqual([carried(thirdEvents)?.included, carried(thirdEvents)?.resumed], [2, true]);

    const [first, second, third] = provider.turns.map((turn) => turn.prompt);
    assert.doesNotMatch(first!, /<conversation_context>/);
    assert.match(second!, /User: Use Postgres for storage\.\n\nAssistant: answer 1/);
    assert.match(second!, /<user_request>\nAdd a users table\.\n<\/user_request>$/);
    // Back in the first session: only what it missed, not its own turn again.
    assert.match(third!, /User: Add a users table\.\n\nAssistant: answer 2/);
    assert.doesNotMatch(third!, /Use Postgres/);
  });
});

test("a second run on a workspace that is still being written fails without reaching the provider", async () => {
  const provider = new ProviderFixture(async function* (fixture) {
    await fixture.waitUntilReleased();
    yield done;
  });
  // Two projects on one folder: separate conversations, shared workspace.
  const one = project();
  const other = project(one.workspaceRoot);

  await withServer(provider, async (url) => {
    const first = chat(url, { sessionId: one.sessionId, taskId: one.taskId, idempotencyKey: "writer-1" });
    await provider.firstTurnStarted;

    const second = await chat(url, { sessionId: other.sessionId, taskId: other.taskId, idempotencyKey: "writer-2" });
    provider.finish();
    await first;

    assert.equal(provider.turns.length, 1);
    assert.equal(second.at(-1)?.runStatus, "failed");
    assert.match(String(second.find((event) => event.type === "error")?.message), /Workspace is already being written/);
    assert.equal(listRuns({ taskId: one.taskId })[0].status, "completed");
  });
});

test("a second run in a conversation without a workspace fails without reaching the provider", async () => {
  const provider = new ProviderFixture(async function* (fixture) {
    await fixture.waitUntilReleased();
    yield done;
  });
  const conversationId = "conversation-two-tabs";

  await withServer(provider, async (url) => {
    // Two tabs open on the same chat each send their own message.
    const first = chat(url, { conversationId, idempotencyKey: "tab-1" });
    await provider.firstTurnStarted;

    const second = await chat(url, { conversationId, idempotencyKey: "tab-2" });
    provider.finish();
    await first;

    assert.equal(provider.turns.length, 1);
    assert.equal(second.at(-1)?.runStatus, "failed");
    assert.match(String(second.find((event) => event.type === "error")?.message), /already has a run in progress/);
    const statuses = listRuns({ conversationId }).map((run) => run.status).sort();
    assert.deepEqual(statuses, ["completed", "failed"]);
  });
});

test("a tool's in-progress updates show one tool, not one per update", async () => {
  // Codex sends a status-less event for every chunk of command output, and
  // Antigravity repeats a step while it is active.
  const tool = (status: string | null, data: unknown): RuntimeEvent => ({
    type: "tool",
    tool: "commandExecution",
    status,
    threadId: "thread_fixture",
    turnId: "turn_fixture",
    itemId: "cmd_1",
    data,
  });
  const provider = new ProviderFixture(async function* () {
    yield tool("inProgress", { command: "npm test" });
    yield tool(null, "76 ");
    yield tool(null, "pass\n");
    yield tool("completed", { command: "npm test", exitCode: 0 });
    yield done;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const events = await chat(url, { sessionId, taskId, idempotencyKey: "streamed-output" });

    assert.equal(events.filter((event) => event.type === "tool_start").length, 1);
    assert.equal(events.filter((event) => event.type === "tool_done").length, 1);
  });
});

test("a run the provider ends as failed tells the user why, once", async () => {
  const provider = new ProviderFixture(async function* () {
    yield { type: "text", text: "partial", threadId: "thread_fixture", turnId: "turn_fixture", itemId: null };
    // An expired login or spent quota arrives only on the provider's result.
    yield { ...done, status: "failed", error: { code: "usageLimitExceeded", message: "You've hit your usage limit." } } as RuntimeEvent;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const events = await chat(url, { sessionId, taskId, idempotencyKey: "provider-failed" });

    const errors = events.filter((event) => event.type === "error");
    assert.equal(errors.length, 1);
    assert.equal(errors[0]?.message, "You've hit your usage limit.");
    assert.equal(events.at(-1)?.type, "done");
    assert.equal(events.at(-1)?.runStatus, "failed");
  });
});

test("a fatal runtime error is not reported a second time when the run ends", async () => {
  const provider = new ProviderFixture(async function* () {
    yield { type: "error", error: { code: "PROCESS_EXITED", message: "Codex app-server process exited." }, threadId: "thread_fixture", turnId: "turn_fixture", fatal: true };
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const events = await chat(url, { sessionId, taskId, idempotencyKey: "fatal-once" });

    assert.equal(events.filter((event) => event.type === "error").length, 1);
    assert.equal(events.at(-1)?.runStatus, "failed");
  });
});

test("runtime progress is neither shown as a tool nor recorded as evidence", async () => {
  // What the runner hands over for Claude's system and rate-limit messages
  // and for Antigravity's step updates.
  const progress = (status: string): RuntimeEvent => ({
    type: "tool",
    tool: "progress",
    status,
    threadId: "thread_fixture",
    turnId: "turn_fixture",
    itemId: null,
    data: { sessionId: "thread_fixture" },
  });
  const provider = new ProviderFixture(async function* () {
    yield progress("system");
    yield { type: "text", text: "answer", threadId: "thread_fixture", turnId: "turn_fixture", itemId: null };
    yield progress("rate_limit_event");
    yield progress("completed");
    yield done;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const events = await chat(url, { sessionId, taskId, idempotencyKey: "progress-only" });

    assert.equal(events.some((event) => event.type === "tool_start" || event.type === "tool_done"), false);
    assert.equal(events.filter((event) => event.type === "text").length, 1);
    assert.equal(events.at(-1)?.runStatus, "completed");
    const [run] = listRuns({ taskId });
    assert.deepEqual(listRunEvidence(run.id).filter((evidence) => evidence.kind !== "summary"), []);
  });
});

test("a tool result the provider repeats is recorded as evidence once", async () => {
  const tool: RuntimeEvent = {
    type: "tool",
    tool: "commandExecution",
    status: "completed",
    threadId: "thread_fixture",
    turnId: "turn_fixture",
    itemId: "item_1",
    data: { command: "npm test", exitCode: 0 },
  };
  const provider = new ProviderFixture(async function* () {
    // A provider stream that reconnects can deliver a finished item again.
    yield tool;
    yield tool;
    yield done;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const events = await chat(url, { sessionId, taskId, idempotencyKey: "replayed-tool" });

    const [run] = listRuns({ taskId });
    const commands = listRunEvidence(run.id).filter((evidence) => evidence.kind === "command");
    assert.equal(commands.length, 1);
    assert.equal(events.filter((event) => event.type === "tool_done").length, 1);
  });
});

test("a second decision on the same approval is refused and does not reach the provider", async () => {
  const decisions: unknown[] = [];
  let approvalId = "";
  let approvalSeen: () => void = () => {};
  const approvalShown = new Promise<void>((resolve) => { approvalSeen = resolve; });
  const provider = new ProviderFixture(async function* (fixture) {
    const decision = fixture.approvalHandler!({
      requestId: "req_1",
      kind: "command",
      threadId: "thread_fixture",
      turnId: "turn_fixture",
      itemId: "item_1",
      command: "rm -rf build",
      cwd: null,
      reason: null,
      details: null,
    });
    decisions.push(await decision);
    yield done;
  });
  const { sessionId, taskId } = project();

  await withServer(provider, async (url) => {
    const res = await fetch(`${url}/api/runtime-agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ runtime: "codex", message: "Clean up.", sessionId, taskId }),
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let runId = "";
    const drained = (async () => {
      while (true) {
        const { done: ended, value } = await reader.read();
        if (ended) return;
        buffer += decoder.decode(value, { stream: true });
        const match = /"type":"approval_request".*?"approvalId":"([^"]+)"|"approvalId":"([^"]+)".*?"type":"approval_request"/.exec(buffer);
        const run = /"runId":"([^"]+)"/.exec(buffer);
        if (match && run && !approvalId) {
          approvalId = match[1] ?? match[2];
          runId = run[1];
          approvalSeen();
        }
      }
    })();
    await approvalShown;

    const decide = (approved: boolean) => fetch(`${url}/api/runtime-agent/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ approvalId, runId, approved }),
    });
    const [first, second] = await Promise.all([decide(true), decide(false)]);
    await drained;

    assert.deepEqual([first.status, second.status].sort(), [200, 404]);
    assert.equal(decisions.length, 1);
    assert.equal(provider.turns.length, 1);
  });
});
