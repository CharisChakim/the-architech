import assert from "node:assert/strict";
import test from "node:test";

import { normalizeRuntimeChatEvent } from "./runtimeChat";

test("a run the chat route ends as failed keeps that status on done", () => {
  assert.deepEqual(normalizeRuntimeChatEvent({ type: "done", runStatus: "failed", stop: "stop" }), { type: "done", runStatus: "failed" });
  assert.deepEqual(normalizeRuntimeChatEvent({ type: "done", runStatus: "completed", stop: "other" }), { type: "done", runStatus: "completed" });
});

test("a done event without a run status stays a plain done", () => {
  assert.deepEqual(normalizeRuntimeChatEvent({ type: "done" }), { type: "done" });
});
