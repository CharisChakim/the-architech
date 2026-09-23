import assert from "node:assert/strict";
import test from "node:test";

import type { RuntimeDiscoveryReport } from "../types";
import { defaultRuntimeSelection, normalizeRuntimeChatEvent } from "./runtimeChat";

test("a run the chat route ends as failed keeps that status on done", () => {
  assert.deepEqual(normalizeRuntimeChatEvent({ type: "done", runStatus: "failed", stop: "stop" }), { type: "done", runStatus: "failed" });
  assert.deepEqual(normalizeRuntimeChatEvent({ type: "done", runStatus: "completed", stop: "other" }), { type: "done", runStatus: "completed" });
});

test("a done event without a run status stays a plain done", () => {
  assert.deepEqual(normalizeRuntimeChatEvent({ type: "done" }), { type: "done" });
});

function report(ready: Array<"codex" | "claude" | "antigravity">): RuntimeDiscoveryReport {
  return {
    checkedAt: new Date(0).toISOString(),
    ttlMs: 900_000,
    runtimes: (["codex", "claude", "antigravity"] as const).map((runtime) => ({
      runtime,
      status: ready.includes(runtime) ? "ready" : "needs_login",
      catalog: ready.includes(runtime) ? { connectionId: `runtime:${runtime}` } : null,
    })),
  } as unknown as RuntimeDiscoveryReport;
}

const legacy = { runtime: "legacy", model: "inherit", effort: "inherit" } as const;

test("a new chat starts on the runtime the user last picked, while it still works", () => {
  const lastClaude = { runtime: "claude" as const, connectionId: "runtime:claude", model: "default", effort: "high" };
  assert.deepEqual(defaultRuntimeSelection({ last: lastClaude, legacyAvailable: true, report: report(["codex", "claude"]) }), lastClaude);
  assert.deepEqual(defaultRuntimeSelection({ last: legacy, legacyAvailable: true, report: report(["codex"]) }), legacy);
  // The last pick is no longer usable: fall back.
  assert.deepEqual(defaultRuntimeSelection({ last: lastClaude, legacyAvailable: true, report: report(["codex"]) }), legacy);
});

test("with no usable last pick, a Legacy API endpoint wins, then the first ready runtime", () => {
  assert.deepEqual(defaultRuntimeSelection({ last: null, legacyAvailable: true, report: report(["codex"]) }), legacy);
  assert.deepEqual(
    defaultRuntimeSelection({ last: legacy, legacyAvailable: false, report: report(["claude", "antigravity"]) }),
    { runtime: "claude", connectionId: "runtime:claude", model: "inherit", effort: "inherit" },
  );
  assert.deepEqual(defaultRuntimeSelection({ last: null, legacyAvailable: false, report: report([]) }), legacy);
  assert.deepEqual(defaultRuntimeSelection({ last: null, legacyAvailable: false, report: null }), legacy);
});
