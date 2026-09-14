import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { listSessions, getSession, saveSession, deleteSession } from "./db.ts";
import { Lang, langOf, msg } from "./server/messages.ts";
import { parseJsonFromLlm } from "./server/llm/json.ts";
import { callLlm as callLlmCore } from "./server/llm/call.ts";
import { resolveFor, type Role } from "./server/connections/store.ts";
import connectionsRouter from "./server/connections/routes.ts";
import agentRouter from "./server/routes/agent.ts";
import { generateFollowups } from "./server/pipeline/followups.ts";
import { generatePlan } from "./server/pipeline/plan.ts";
import { generatePrd } from "./server/pipeline/prd.ts";
import { generateTasks } from "./server/pipeline/tasks.ts";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));
app.use(connectionsRouter);
app.use(agentRouter);

const PORT = 3000;

// Route lama tetap memakai signature ini supaya klien dan keempat generator tidak
// perlu berubah saat transport provider dipindahkan ke layer netral.
async function callLlm(
  prompt: string,
  systemInstruction: string,
  llmConfig?: any,
  lang: Lang = "en",
  role: Role = "plan",
  requestBody: any = {},
): Promise<string> {
  const { conn, model } = resolveFor(role, { ...requestBody, llmConfig }, lang);
  if (!conn.baseUrl) throw new Error(msg(lang, "baseUrlRequired"));
  return callLlmCore({ prompt, system: systemInstruction, conn, model, lang, jsonMode: conn.jsonMode });
}

// API Routes

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Riwayat Proyek (SQLite) — daftar, buka, simpan, hapus
app.get("/api/sessions", (req, res) => {
  try {
    res.json({ sessions: listSessions() });
  } catch (err: any) {
    console.error("Error GET /api/sessions:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "historyLoadFailed") });
  }
});

app.get("/api/sessions/:id", (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: msg(langOf(req), "sessionNotFound") });
      return;
    }
    res.json(session);
  } catch (err: any) {
    console.error("Error GET /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "sessionLoadFailed") });
  }
});

app.put("/api/sessions/:id", (req, res) => {
  try {
    const session = req.body;
    if (!session || session.id !== req.params.id) {
      res.status(400).json({ error: msg(langOf(req), "sessionIdMismatch") });
      return;
    }
    saveSession(session);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error PUT /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "sessionSaveFailed") });
  }
});

app.delete("/api/sessions/:id", (req, res) => {
  try {
    deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error DELETE /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "sessionDeleteFailed") });
  }
});

// Test LLM Connection
app.post("/api/test-llm", async (req, res) => {
  try {
    const { llmConfig } = req.body;
    const lang = langOf(req);
    const testPrompt = "Kirim pesan JSON singkat {\"status\": \"connected\", \"message\": \"Koneksi LLM Berhasil\"}";
    const sys = "Respon dalam format JSON valid.";
    const result = await callLlm(testPrompt, sys, llmConfig, lang);
    const parsed = parseJsonFromLlm(result, lang);
    res.json({ success: true, response: parsed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fitur 1: Follow-up Questions (Mengklarifikasi Ide & Spesifikasi Proyek)
app.post("/api/followup-questions", async (req, res) => {
  try {
    const lang = langOf(req);
    const { conn, model } = resolveFor("plan", req.body, lang);
    const data = await generateFollowups(req.body, conn, model, lang);
    res.json(data);
  } catch (err: any) {
    console.error("Error /api/followup-questions:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "followUpFailed") });
  }
});

// Fitur 1: Generate Plan (Arsitektur, Roadmap, Estimasi, Diagram Horizontal)
app.post("/api/generate-plan", async (req, res) => {
  try {
    const lang = langOf(req);
    const { conn, model } = resolveFor("plan", req.body, lang);
    const data = await generatePlan(req.body, conn, model, lang, req.body?.lockedFeatures);
    res.json(data);
  } catch (err: any) {
    console.error("Error /api/generate-plan:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "planFailed") });
  }
});

// Fitur 2: Generate PRD Sesuai Standar 7 Poin & Diagram Horizontal
app.post("/api/generate-prd", async (req, res) => {
  try {
    const { title, plan } = req.body;
    const lang = langOf(req);
    const { conn, model } = resolveFor("prd", req.body, lang);
    const data = await generatePrd(title, plan, conn, model, lang);
    res.json(data);
  } catch (err: any) {
    console.error("Error /api/generate-prd:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "prdFailed") });
  }
});

app.post("/api/generate-tasks", async (req, res) => {
  try {
    const { title, plan, prd } = req.body;
    const lang = langOf(req);
    const { conn, model } = resolveFor("tasks", req.body, lang);
    const tasks = await generateTasks(title, plan, prd, conn, model, lang);
    res.json({ tasks });
  } catch (err: any) {
    console.error("Error /api/generate-tasks:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "tasksFailed") });
  }
});

// Start Express + Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Architech server listening on http://localhost:${PORT}`);
  });
}

startServer();
