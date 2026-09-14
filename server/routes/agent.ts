import { randomUUID } from "node:crypto";
import express, { type Request, type Response } from "express";

import { getSession } from "../../db.ts";
import { resolveRole, getConnection } from "../connections/store.ts";
import { LLM_TIMEOUT_MS } from "../llm/call.ts";
import type { Connection } from "../llm/types.ts";
import { ensureConversation, importLegacyHistory, loadMessages } from "../agent/conversations.ts";
import { runAgent } from "../agent/loop.ts";

const router = express.Router();

const DEFAULT_BASE_URL = "http://localhost:20128/v1";
const DEFAULT_MODEL = "claude-combo";
const ELICIT_TIMEOUT_MS = 300_000;

type ElicitRequest =
  | { kind: "approval"; command: string; cwd?: string }
  | { kind: "questions"; questions: unknown[]; round: number };

type ElicitEntry = {
  convId: string;
  settle: (value: unknown) => void;
};

// Nonce ini tidak dimaksudkan sebagai batas keamanan pada aplikasi localhost
// single-user; ia hanya mencegah tab lama menjawab prompt percakapan lain.
const pendingElicitations = new Map<string, ElicitEntry>();

class RequestError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sendJsonError(res: Response, error: unknown, fallbackStatus = 500): void {
  const requestError = error instanceof RequestError ? error : undefined;
  if (!res.headersSent) res.status(requestError?.statusCode ?? fallbackStatus).json({ error: errorMessage(error) });
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) throw new RequestError(`${field} is required.`);
  return value.trim();
}

function legacyConnection(config: unknown): { conn: Connection; model: string } {
  if (!isRecord(config)) throw new RequestError("An agent connection or legacy agentConfig is required.");

  const baseUrl = typeof config.baseUrl === "string" && config.baseUrl.trim()
    ? config.baseUrl.trim()
    : DEFAULT_BASE_URL;
  const key = typeof config.apiKey === "string" ? config.apiKey.trim() : "";
  const envKey = process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  const headers = isRecord(config.headers)
    ? Object.fromEntries(Object.entries(config.headers).filter(([, value]) => typeof value === "string"))
    : {};
  const requestedModel = config.model ?? config.modelName;

  return {
    conn: {
      id: "legacy",
      name: "Legacy",
      // Konfigurasi lama memang berbicara dengan router berformat Anthropic,
      // jadi provider lama tidak boleh ditafsirkan ulang sebagai OpenAI/Gemini.
      format: "anthropic",
      baseUrl,
      ...(key || envKey ? { apiKey: key || envKey } : {}),
      headers,
      models: [],
      jsonMode: false,
    },
    model: typeof requestedModel === "string" && requestedModel.trim()
      ? requestedModel.trim()
      : DEFAULT_MODEL,
  };
}

function resolveAgentConnection(body: Record<string, any>): { conn: Connection; model: string } {
  const connectionId = typeof body.connectionId === "string" ? body.connectionId.trim() : "";
  const model = typeof body.model === "string" ? body.model.trim() : "";

  if (connectionId && model) {
    const connection = getConnection(connectionId);
    if (!connection) throw new RequestError(`Connection not found: ${connectionId}.`, 404);
    if (!connection.enabled) throw new RequestError(`Connection is disabled: ${connectionId}.`);
    return { conn: connection, model };
  }

  const binding = resolveRole("agent");
  if (binding) return binding;

  if (body.agentConfig !== undefined && body.agentConfig !== null) {
    return legacyConnection(body.agentConfig);
  }

  throw new RequestError(
    "Could not resolve the agent LLM connection. Provide connectionId and model, configure the agent role, or send agentConfig.",
  );
}

function sseHeaders(res: Response): void {
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
}

function makeSender(res: Response, ac: AbortController): (event: unknown) => boolean {
  return (event: unknown): boolean => {
    if (res.writableEnded || ac.signal.aborted) return false;
    try {
      // JSON.stringify meng-escape newline di dalam nilai, sehingga satu event
      // tetap satu frame SSE dan tidak dapat memecah parser klien.
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      return true;
    } catch (error) {
      if (!ac.signal.aborted) ac.abort(error instanceof Error ? error : new Error(String(error)));
      return false;
    }
  };
}

function makeElicit(
  convId: string,
  ac: AbortController,
  send: (event: unknown) => boolean,
  ownedIds: Set<string>,
): (request: ElicitRequest) => Promise<unknown> {
  return (request: ElicitRequest): Promise<unknown> => {
    const elicitId = randomUUID();
    ownedIds.add(elicitId);

    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | undefined;

      const finish = (value: unknown): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        ac.signal.removeEventListener("abort", onAbort);
        pendingElicitations.delete(elicitId);
        ownedIds.delete(elicitId);

        if (request.kind === "approval") {
          send({
            type: "approval_resolved",
            approvalId: elicitId,
            elicitId,
            approved: Boolean(value),
          });
        }
        resolve(value);
      };

      const onAbort = (): void => finish(false);
      pendingElicitations.set(elicitId, { convId, settle: finish });
      ac.signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => finish(false), ELICIT_TIMEOUT_MS);

      const event = request.kind === "approval"
        ? {
            type: "approval_request",
            approvalId: elicitId,
            elicitId,
            command: request.command,
            ...(request.cwd ? { cwd: request.cwd } : {}),
          }
        : {
            type: "questions",
            elicitId,
            questions: request.questions,
            round: request.round,
          };

      if (!send(event)) finish(false);
    });
  };
}

function conversationIdFor(body: Record<string, any>): string {
  if (body.conversationId === undefined || body.conversationId === null || body.conversationId === "") {
    return `conv_${body.sessionId}_default`;
  }
  return requiredString(body.conversationId, "conversationId");
}

async function chat(req: Request, res: Response): Promise<void> {
  const body = isRecord(req.body) ? req.body : {};
  let sessionId: string;
  let message: string;
  let resolved: { conn: Connection; model: string };
  let convId: string;

  try {
    sessionId = requiredString(body.sessionId, "sessionId");
    message = requiredString(body.message, "message");
    if (!getSession(sessionId)) throw new RequestError(`Session not found: ${sessionId}.`, 404);
    resolved = resolveAgentConnection(body);
    convId = conversationIdFor(body);

    // Setelah percakapan memiliki pesan, SQLite menjadi sumber kebenaran agar
    // klien lama tidak dapat menimpa transcript hanya karena reload.
    ensureConversation(sessionId, convId);
    if (loadMessages(convId).length === 0 && Array.isArray(body.history) && body.history.length > 0) {
      importLegacyHistory(convId, body.history);
    }
  } catch (error) {
    sendJsonError(res, error);
    return;
  }

  const ac = new AbortController();
  const providerSignal = AbortSignal.any([ac.signal, AbortSignal.timeout(LLM_TIMEOUT_MS)]);
  const send = makeSender(res, ac);
  const ownedIds = new Set<string>();
  const abortForRequestDisconnect = (): void => {
    // Pada Node versi baru, IncomingMessage.close juga terjadi setelah body POST
    // selesai dibaca. req.complete membedakan kondisi normal itu dari putus di
    // tengah request; res.close menangani putus setelah request sudah lengkap.
    if (!req.complete && !ac.signal.aborted) ac.abort(new Error("client disconnected"));
  };
  const abortForResponseDisconnect = (): void => {
    if (!res.writableEnded && !res.writableFinished && !ac.signal.aborted) {
      ac.abort(new Error("client disconnected"));
    }
  };
  const heartbeat = setInterval(() => {
    if (res.writableEnded || ac.signal.aborted) return;
    try {
      res.write(": ping\n\n");
    } catch (error) {
      if (!ac.signal.aborted) ac.abort(error instanceof Error ? error : new Error(String(error)));
    }
  }, 15_000);
  heartbeat.unref?.();

  req.on("aborted", abortForRequestDisconnect);
  req.on("close", abortForRequestDisconnect);
  res.on("close", abortForResponseDisconnect);
  sseHeaders(res);
  send({ type: "conversation", conversationId: convId });

  try {
    await runAgent({
      sessionId,
      conversationId: convId,
      userMessage: message,
      conn: resolved.conn,
      model: resolved.model,
      limits: (getSession(sessionId)?.agentLimits || {}) as any,
      onEvent: (event: unknown) => send(event),
      elicit: makeElicit(convId, ac, send, ownedIds),
      signal: providerSignal,
    });
  } catch (error) {
    if (!ac.signal.aborted) send({ type: "error", message: errorMessage(error) });
  } finally {
    // Loop yang gagal atau dibatalkan tidak boleh meninggalkan promise elicitation
    // yang masih menahan timer dan referensi ke response yang sudah mati.
    for (const id of [...ownedIds]) pendingElicitations.get(id)?.settle(false);
    clearInterval(heartbeat);
    req.off("aborted", abortForRequestDisconnect);
    req.off("close", abortForRequestDisconnect);
    res.off("close", abortForResponseDisconnect);
    if (!res.writableEnded) res.end();
  }
}

router.post("/api/agent/chat", chat);

router.post("/api/agent/respond", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  let elicitId: string;
  let conversationId: string;
  try {
    elicitId = requiredString(body.elicitId, "elicitId");
    conversationId = requiredString(body.conversationId, "conversationId");
  } catch (error) {
    sendJsonError(res, error);
    return;
  }
  if (!("response" in body)) {
    res.status(400).json({ error: "response is required." });
    return;
  }

  const pending = pendingElicitations.get(elicitId);
  if (!pending) {
    res.status(404).json({ error: "That elicitation request is no longer valid." });
    return;
  }
  if (pending.convId !== conversationId) {
    // Ini pemeriksaan korelasi untuk tab basi, bukan otorisasi: nonce yang sulit
    // ditebak adalah pelindung sebenarnya pada aplikasi single-user localhost.
    res.status(409).json({ error: "That elicitation belongs to another conversation." });
    return;
  }

  pending.settle(body.response);
  res.json({ ok: true });
});

router.post("/api/agent/approve", (req, res) => {
  const body = isRecord(req.body) ? req.body : {};
  let approvalId: string;
  try {
    approvalId = requiredString(body.approvalId, "approvalId");
  } catch (error) {
    sendJsonError(res, error);
    return;
  }
  if (typeof body.approved !== "boolean") {
    res.status(400).json({ error: "approved must be a boolean." });
    return;
  }

  const pending = pendingElicitations.get(approvalId);
  if (!pending) {
    res.status(404).json({ error: "That approval request is no longer valid." });
    return;
  }
  // Alias ini sengaja tidak meminta conversationId agar ChatPanel lama tetap
  // dapat menyelesaikan approval selama satu rilis kompatibilitas.
  pending.settle(body.approved);
  res.json({ ok: true });
});

export { router, pendingElicitations };
export default router;
