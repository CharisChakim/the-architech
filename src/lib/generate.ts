import { ProjectSession, PRDData, AgentTask } from "../types";
import { Language, makeT } from "./i18n";

// Permintaan generate tinggal di satu tempat karena dipanggil dari dua sisi:
// tombol transisi di langkah sebelumnya, dan tombol generate/regenerate di
// halaman tujuannya sendiri. Keduanya harus mengirim bidang yang sama.

// Dilempar saat pengguna menekan Cancel. Pemanggil membedakannya dari kegagalan
// sungguhan supaya pembatalan tidak memunculkan pesan error.
export const isAbort = (err: any): boolean => err?.name === "AbortError";

async function postJson(url: string, body: unknown, lang: Language, fallbackKey: string, signal?: AbortSignal) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || makeT(lang)(fallbackKey));
  return data;
}

export async function generatePrd(
  session: ProjectSession,
  lang: Language,
  signal?: AbortSignal
): Promise<PRDData> {
  return (await postJson(
    "/api/generate-prd",
    {
      title: session.input.title || session.title || "AI application",
      plan: session.plan,
      language: lang,
    },
    lang,
    "Failed to generate the PRD.",
    signal
  )) as PRDData;
}

export async function generateTasks(
  session: ProjectSession,
  lang: Language,
  signal?: AbortSignal
): Promise<AgentTask[]> {
  const data = await postJson(
    "/api/generate-tasks",
    {
      title: session.input.title || session.title || "AI application",
      plan: session.plan,
      prd: session.prd,
      language: lang,
    },
    lang,
    "Failed to generate the agent tasks.",
    signal
  );

  return (data.tasks || []).map((task: AgentTask) => ({ ...task, status: task.status || "todo" }));
}
