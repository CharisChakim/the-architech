import assert from "node:assert/strict";
import test from "node:test";

import { entriesFromStoredMessages } from "./useAgentRun";

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
