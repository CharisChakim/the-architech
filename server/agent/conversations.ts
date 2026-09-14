import { db } from "../../db.ts";
import type { ContentBlock, Message } from "../llm/types.ts";

// Tabel dibuat saat modul dimuat supaya endpoint agent tidak bergantung pada
// urutan bootstrap atau migrasi terpisah; tabel sessions sengaja tidak disentuh.
db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id         TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_conversations_session
    ON conversations (session_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    conv_id    TEXT NOT NULL,
    role       TEXT NOT NULL,
    content    TEXT NOT NULL,
    meta       TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages (conv_id, id);
`);

interface ConversationRow {
  id: string;
  session_id: string;
}

interface MessageRow {
  role: string;
  content: string;
}

const getConversationStmt = db.prepare(
  `SELECT id, session_id FROM conversations WHERE id = ?`
);
const insertConversationStmt = db.prepare(
  `INSERT INTO conversations (id, session_id, title, created_at, updated_at)
   VALUES (?, ?, '', ?, ?)`
);
const listMessagesStmt = db.prepare(
  `SELECT role, content FROM messages WHERE conv_id = ? ORDER BY id ASC`
);
const insertMessageStmt = db.prepare(
  `INSERT INTO messages (conv_id, role, content, meta, created_at)
   VALUES (?, ?, ?, ?, ?)`
);
const touchConversationStmt = db.prepare(
  `UPDATE conversations SET updated_at = ? WHERE id = ?`
);

function requiredId(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${field} is required`);
  return value.trim();
}

function conversationIdFor(sessionId: string, conversationId?: string): string {
  if (conversationId === undefined || conversationId.trim() === "") {
    return `conv_${sessionId}_default`;
  }
  return requiredId(conversationId, "conversationId");
}

function requireConversation(convId: string): ConversationRow {
  const id = requiredId(convId, "conversationId");
  const row = getConversationStmt.get(id) as unknown as ConversationRow | undefined;
  if (!row) throw new Error(`Conversation ${id} not found`);
  return row;
}

function isRole(value: unknown): value is Message["role"] {
  return value === "user" || value === "assistant";
}

function isToolCall(block: ContentBlock): block is Extract<ContentBlock, { type: "tool_call" }> {
  return block.type === "tool_call";
}

function isToolResult(block: ContentBlock): block is Extract<ContentBlock, { type: "tool_result" }> {
  return block.type === "tool_result";
}

function cloneMessage(message: Message): Message {
  return { role: message.role, content: [...message.content] };
}

function toolResultContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined) return "";
  const serialized = JSON.stringify(value);
  return serialized === undefined ? String(value) : serialized;
}

function legacyBlock(block: any): ContentBlock | null {
  if (!block || typeof block !== "object") return null;

  if (block.type === "text" && typeof block.text === "string") {
    return { type: "text", text: block.text };
  }

  if (
    block.type === "tool_use" &&
    typeof block.id === "string" &&
    block.id &&
    typeof block.name === "string" &&
    block.name
  ) {
    return { type: "tool_call", id: block.id, name: block.name, input: block.input ?? {} };
  }

  if (block.type === "tool_result" && typeof block.tool_use_id === "string" && block.tool_use_id) {
    return {
      type: "tool_result",
      toolCallId: block.tool_use_id,
      content: toolResultContent(block.content),
      ...(block.is_error !== undefined ? { isError: Boolean(block.is_error) } : {}),
    };
  }

  return null;
}

function legacyMessage(entry: any): Message | null {
  if (!entry || !isRole(entry.role)) return null;

  const content: ContentBlock[] = [];
  if (typeof entry.content === "string") {
    content.push({ type: "text", text: entry.content });
  } else if (Array.isArray(entry.content)) {
    for (const block of entry.content) {
      const converted = legacyBlock(block);
      if (converted) content.push(converted);
    }
  } else {
    return null;
  }

  return { role: entry.role, content };
}

export function ensureConversation(sessionId: string, conversationId?: string): string {
  const owner = requiredId(sessionId, "sessionId");
  const id = conversationIdFor(owner, conversationId);
  const existing = getConversationStmt.get(id) as unknown as ConversationRow | undefined;

  if (existing) {
    // ID percakapan boleh dikirim ulang oleh tab, tetapi tidak boleh dipakai
    // untuk membaca sesi lain; ini mencegah tab basi mencampur transcript.
    if (existing.session_id !== owner) {
      throw new Error(`Conversation ${id} does not belong to session ${owner}`);
    }
    return id;
  }

  const now = new Date().toISOString();
  insertConversationStmt.run(id, owner, now, now);
  return id;
}

export function loadMessages(convId: string): Message[] {
  const id = requiredId(convId, "conversationId");
  const rows = listMessagesStmt.all(id) as unknown as MessageRow[];

  return rows.flatMap((row) => {
    if (!isRole(row.role)) return [];

    try {
      const content = JSON.parse(row.content);
      return Array.isArray(content) ? [{ role: row.role, content } as Message] : [];
    } catch {
      // Satu baris rusak tidak boleh membuat percakapan lain atau pesan valid
      // sesudahnya ikut tidak dapat dipakai oleh provider.
      return [];
    }
  });
}

export function appendMessage(convId: string, message: Message, meta: object = {}): void {
  const conversation = requireConversation(convId);
  if (!isRole(message?.role)) throw new Error("message role must be user or assistant");
  if (!Array.isArray(message.content)) throw new Error("message content must be an array");

  const serializedMeta = JSON.stringify(meta ?? {});
  const serializedContent = JSON.stringify(message.content);
  const now = new Date().toISOString();
  insertMessageStmt.run(
    conversation.id,
    message.role,
    serializedContent,
    serializedMeta === undefined ? "{}" : serializedMeta,
    now
  );
  touchConversationStmt.run(now, conversation.id);
}

export function importLegacyHistory(convId: string, anthropicHistory: any[]): void {
  requireConversation(convId);
  if (!Array.isArray(anthropicHistory)) return;

  for (const entry of anthropicHistory) {
    const message = legacyMessage(entry);
    if (message) appendMessage(convId, message);
  }
}

function missingToolCalls(assistant: Message, next: Message | undefined) {
  const calls = assistant.content.filter(isToolCall);
  if (!calls.length) return [];

  const available = new Map<string, number>();
  if (next?.role === "user") {
    for (const result of next.content.filter(isToolResult)) {
      available.set(result.toolCallId, (available.get(result.toolCallId) ?? 0) + 1);
    }
  }

  const missing: Extract<ContentBlock, { type: "tool_result" }>[] = [];
  for (const call of calls) {
    const count = available.get(call.id) ?? 0;
    if (count > 0) {
      available.set(call.id, count - 1);
    } else {
      missing.push({
        type: "tool_result",
        toolCallId: call.id,
        content: '{"error":"Giliran terputus."}',
        isError: true,
      });
    }
  }
  return missing;
}

export function sanitize(messages: Message[]): Message[] {
  const forNextUser = new Map<number, Extract<ContentBlock, { type: "tool_result" }>[] >();
  const afterMessage = new Map<number, Extract<ContentBlock, { type: "tool_result" }>[] >();

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;

    const next = messages[index + 1];
    const missing = missingToolCalls(message, next);
    if (!missing.length) continue;

    if (next?.role === "user") {
      forNextUser.set(index + 1, missing);
    } else {
      afterMessage.set(index, missing);
    }
  }

  const sanitized: Message[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = cloneMessage(messages[index]);
    const missing = forNextUser.get(index);

    if (missing && message.role === "user") {
      const results = message.content.filter(isToolResult);
      const otherBlocks = message.content.filter((block) => !isToolResult(block));
      // Hasil diletakkan di depan agar pesan tetap memenuhi kontrak provider;
      // blok teks user tetap dipertahankan untuk prompt berikutnya.
      sanitized.push({ ...message, content: [...results, ...missing, ...otherBlocks] });
    } else {
      sanitized.push(message);
    }

    const inserted = afterMessage.get(index);
    if (inserted) {
      // Tanpa pesan user sesudahnya, blok hasil perlu punya pesan pembungkus
      // sendiri agar assistant tool call selalu dijawab secara struktural.
      sanitized.push({ role: "user", content: inserted });
    }
  }

  return sanitized;
}
