import { ProjectSession, SessionSummary, LLMConfig } from "../types";
import { loadLanguage, makeT } from "./i18n";

// Riwayat proyek disimpan server-side di SQLite. llmConfig tidak ikut disimpan:
// itu preferensi per-device (dan bisa memuat API key), jadi tetap di localStorage.
export function stripLocalOnlyFields(session: ProjectSession) {
  const { llmConfig, ...persisted } = session;
  return persisted;
}

// Bahasa dibaca dari localStorage, bukan diterima sebagai argumen: sumbernya
// sama dengan yang dipakai provider, dan menyalurkan `t` lewat setiap pemanggil
// hanya menambah derau di App.
const lang = () => loadLanguage();

// Server memilih bahasa pesan errornya dari parameter ini.
const withLang = (url: string) => `${url}${url.includes("?") ? "&" : "?"}lang=${lang()}`;

async function readError(res: Response, fallbackKey: string): Promise<string> {
  const fallback = makeT(lang())(fallbackKey);
  try {
    const data = await res.json();
    return data.error || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchSessionList(): Promise<SessionSummary[]> {
  const res = await fetch(withLang("/api/sessions"));
  if (!res.ok) throw new Error(await readError(res, "Failed to load project history."));
  const data = await res.json();
  return data.sessions || [];
}

export async function fetchSession(id: string, llmConfig: LLMConfig): Promise<ProjectSession | null> {
  const res = await fetch(withLang(`/api/sessions/${encodeURIComponent(id)}`));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(await readError(res, "Failed to open the project session."));
  const stored = await res.json();
  return { ...stored, llmConfig } as ProjectSession;
}

export async function persistSession(session: ProjectSession): Promise<void> {
  const res = await fetch(withLang(`/api/sessions/${encodeURIComponent(session.id)}`), {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(stripLocalOnlyFields(session)),
  });
  if (!res.ok) throw new Error(await readError(res, "Failed to save the project session."));
}

export async function removeSession(id: string): Promise<void> {
  const res = await fetch(withLang(`/api/sessions/${encodeURIComponent(id)}`), { method: "DELETE" });
  if (!res.ok) throw new Error(await readError(res, "Failed to delete the project session."));
}
