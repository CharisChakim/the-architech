import { DatabaseSync } from "node:sqlite";
import fs from "fs";
import path from "path";

const DB_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DB_DIR, "architech.db");

fs.mkdirSync(DB_DIR, { recursive: true });

const db = new DatabaseSync(DB_PATH);

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
}

const listStmt = db.prepare(
  `SELECT id, title, updated_at, current_step FROM sessions ORDER BY updated_at DESC`
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
