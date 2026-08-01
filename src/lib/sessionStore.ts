import { ProjectSession, SessionSummary, LLMConfig } from "../types";

// Riwayat proyek disimpan server-side di SQLite. llmConfig tidak ikut disimpan:
// itu preferensi per-device (dan bisa memuat API key), jadi tetap di localStorage.
function stripLocalOnlyFields(session: ProjectSession) {
  const { llmConfig, ...persisted } = session;
  return persisted;
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchSessionList(): Promise<SessionSummary[]> {
  const res = await fetch("/api/sessions");
  if (!res.ok) throw new Error(await readError(res, "Gagal memuat riwayat proyek."));
  const data = await res.json();
  return data.sessions || [];
}

export async function fetchSession(id: string, llmConfig: LLMConfig): Promise<ProjectSession | null> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res, "Gagal memuat sesi proyek."));
  const stored = await res.json();
  return { ...stored, llmConfig } as ProjectSession;
}

export async function persistSession(session: ProjectSession): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(session.id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stripLocalOnlyFields(session)),
  });
  if (!res.ok) throw new Error(await readError(res, "Gagal menyimpan sesi proyek."));
}

export async function removeSession(id: string): Promise<void> {
  const res = await fetch(`/api/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Gagal menghapus sesi proyek."));
}
