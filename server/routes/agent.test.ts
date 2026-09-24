import assert from "node:assert/strict";
import fs from "node:fs";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";

// db.ts reads this when it is first imported, so everything that touches the
// database is loaded dynamically, after the data directory is disposable.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "architech-agent-route-test-"));
process.env.ARCHITECH_DATA_DIR = dataDir;
process.on("exit", () => fs.rmSync(dataDir, { recursive: true, force: true }));

const express = (await import("express")).default;
const { saveSession } = await import("../../db.ts");
const { createConversation, getConversation } = await import("../agent/conversations.ts");
const { router } = await import("./agent.ts");

test("a Legacy API chat keeps its conversation when it becomes a project", async () => {
  // The chat ran before its session was saved, so its conversation stands alone.
  const conversation = createConversation({});
  saveSession({ id: "session-legacy-project", title: "todo", workspaceRoot: "", tasks: [] });

  const app = express();
  app.use(express.json());
  app.use(router);
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // An endpoint on a closed local port: the request gets past connection
      // resolution to the conversation, and the model call fails locally.
      body: JSON.stringify({
        sessionId: "session-legacy-project",
        conversationId: conversation.id,
        message: "Now add auth.",
        agentConfig: { baseUrl: "http://127.0.0.1:1", model: "fixture" },
      }),
    });
    const body = await res.text();
    assert.doesNotMatch(body, /does not belong/);
    assert.equal(getConversation(conversation.id)?.projectId, "session-legacy-project");
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
