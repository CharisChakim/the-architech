import assert from "node:assert/strict";
import test from "node:test";

import { entriesFromStoredMessages, wasMessageDelivered } from "./useAgentRun";

const text = (role: "user" | "assistant", value: string) => ({ role, content: [{ type: "text", text: value }] });

test("stored notes come back after the message they followed", () => {
  const messages = [text("user", "one"), text("assistant", "answer one"), text("user", "two"), text("assistant", "answer two")];
  const notes = [
    { afterMessage: 2, note: { type: "context_carried", runtime: "claude", included: 2, omitted: 0, resumed: false } },
    { afterMessage: 3, note: { type: "chat_files", status: "moved", from: "/data/chat", to: "/work/app" } },
    { afterMessage: 2, note: { type: "unknown" } },
  ];

  const kinds = entriesFromStoredMessages(messages, { current: 0 }, notes).map((entry) => entry.kind);

  assert.deepEqual(kinds, ["user", "assistant", "user", "context_carried", "assistant", "chat_files"]);
});

test("a note before any message, or on a chat with none, is still shown", () => {
  const note = { afterMessage: -1, note: { type: "chat_files", status: "conflict", from: "/data/chat", to: "/work/app", conflicts: ["a.md"] } };

  assert.deepEqual(entriesFromStoredMessages([], { current: 0 }, [note]).map((entry) => entry.kind), ["chat_files"]);
  assert.deepEqual(entriesFromStoredMessages([text("user", "one")], { current: 0 }, [note]).map((entry) => entry.kind), ["chat_files", "user"]);
});

test("legacy chat counts the message delivered once its first turn starts, whatever happens after", () => {
  // The message is stored before the "turn" event, so a later failure (a
  // denied tool, max turns, a thrown error) does not undo delivery.
  assert.equal(wasMessageDelivered(false, true, false), true);
  assert.equal(wasMessageDelivered(false, true, true), true);
  // A refusal before "turn" (session not found) never stored the message.
  assert.equal(wasMessageDelivered(false, false, false), false);
});

test("runtime chat counts the message delivered once the run finishes, success or failure", () => {
  // The message is stored before the run starts, which always ends in
  // "done" — including a turn that failed, such as a declined tool.
  assert.equal(wasMessageDelivered(true, false, true), true);
  // An unready runtime is refused before the run starts, so it never sends
  // "done"; the message never reached the server.
  assert.equal(wasMessageDelivered(true, false, false), false);
});
