import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

// Paket desktop menjalankan server dari direktori instalasi yang sering
// read-only, jadi lokasi data bisa ditunjuk lewat environment. Tanpa itu
// perilakunya sama seperti sebelumnya: ./data relatif terhadap cwd.
export const DB_DIR = process.env.ARCHITECH_DATA_DIR ?? path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "architech.db");

fs.mkdirSync(DB_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);

// Queryable columns drive the history list; payload holds the whole session as
// JSON because plan/prd/tasks come from an LLM and their shape is loose.
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    title        TEXT NOT NULL DEFAULT '',
    updated_at   TEXT NOT NULL,
    current_step INTEGER NOT NULL DEFAULT 1,
    payload      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions (updated_at DESC);
`);

export interface SessionSummaryRow {
  id: string;
  title: string;
  updatedAt: string;
  currentStep: number;
  workspaceRoot: string;
  hasPlan: boolean;
  taskCount: number;
}

// The sidebar groups chats by their workspace folder and only unfolds the ones
// that carry a plan, so the list query reads those few fields out of the payload
// rather than making every row load its whole session.
const listStmt = db.prepare(
  `SELECT id, title, updated_at, current_step,
          json_extract(payload, '$.workspaceRoot') AS workspace_root,
          (json_type(payload, '$.plan') IS NOT NULL) AS has_plan,
          CASE WHEN json_type(payload, '$.tasks') = 'array'
               THEN json_array_length(payload, '$.tasks')
               ELSE 0 END AS task_count
     FROM sessions
    ORDER BY updated_at DESC`
);
const getStmt = db.prepare(`SELECT payload FROM sessions WHERE id = ?`);
const upsertStmt = db.prepare(
  `INSERT INTO sessions (id, title, updated_at, current_step, payload)
   VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     title        = excluded.title,
     updated_at   = excluded.updated_at,
     current_step = excluded.current_step,
     payload      = excluded.payload`
);
const deleteStmt = db.prepare(`DELETE FROM sessions WHERE id = ?`);

export function listSessions(): SessionSummaryRow[] {
  return listStmt.all().map((row) => ({
    id: row.id as string,
    title: row.title as string,
    updatedAt: row.updated_at as string,
    currentStep: Number(row.current_step),
    workspaceRoot: typeof row.workspace_root === "string" ? row.workspace_root : "",
    hasPlan: Number(row.has_plan) === 1,
    taskCount: Number(row.task_count),
  }));
}

export function getSession(id: string): any | null {
  const row = getStmt.get(id);
  if (!row) return null;
  return JSON.parse(row.payload as string);
}

export function saveSession(session: any): void {
  const title = session.input?.title || session.title || "";
  const updatedAt = session.updatedAt || new Date().toISOString();
  const currentStep = Number(session.currentStep) || 1;
  upsertStmt.run(session.id, title, updatedAt, currentStep, JSON.stringify(session));
}

export function deleteSession(id: string): void {
  deleteStmt.run(id);
}
