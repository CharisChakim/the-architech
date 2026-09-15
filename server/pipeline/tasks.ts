import { parseJsonFromLlm } from "../llm/json.ts";
import type { Connection } from "../llm/types.ts";
import type { Lang } from "../messages.ts";
import { generateLlmText, type PipelineOptions } from "./llm.ts";

const outputLanguage = (lang: Lang): string =>
  lang === "id"
    ? "Gunakan Bahasa Indonesia yang profesional, jelas, dan ramah untuk SELURUH nilai teks pada JSON keluaran."
    : "Write EVERY text value in the JSON output in professional, clear, friendly English.";

export async function generateTasks(
  title: string,
  plan: any,
  prd: any,
  conn: Connection,
  model: string,
  lang: Lang,
  options?: PipelineOptions,
): Promise<any[]> {
  const systemInstruction = `Anda adalah Principal AI Engineer & Prompt Architect.
${outputLanguage(lang)}
Tugas Anda adalah memecah PRD (7 poin) dan Arsitektur Proyek menjadi daftar tugas pengkodean yang modular, terpola atomik, dan SIAP DIEKSEKUSI OLEH AI CODING AGENT (seperti Cursor, Antigravity Agent, Claude Code, Gemini Code Assist).

Tugas-tugas ini harus bersifat self-contained dengan instruksi teknis yang jelas, file target spesifik, dependensi, dan langkah verifikasi.
Setiap task harus memiliki status awal "todo".

Kembalikan respon PERSIS dalam format JSON berikut:
{
  "tasks": [
    {
      "id": "TASK-01",
      "phase": "Fase 1: Setup & Database",
      "title": "Inisialisasi Proyek & Skema Data",
      "priority": "High",
      "targetFiles": ["src/types.ts", "package.json"],
      "dependencies": [],
      "promptInstructions": "Buat file src/types.ts yang mendefinisikan interface...",
      "verificationSteps": "Jalankan npm run build dan pastikan bebas dari error TypeScript.",
      "status": "todo"
    }
  ]
}`;

  const prompt = `Detail Proyek:
Judul: ${title}
Overview PRD: ${prd?.overview || prd?.executiveSummary || ""}
Fase Fitur Utama: ${JSON.stringify(prd?.coreFeatures || {})}
User Flow: ${prd?.userFlow || ""}
Arsitektur & Tech Stack: ${JSON.stringify(prd?.techStack || plan?.specs?.techStack || [])}
Skema Database: ${JSON.stringify(prd?.databaseSchema || prd?.dataSchema || [])}

Silakan buatkan pecahan Task AI Agent yang komprehensif (minimal 5-10 task atomik berurutan).
Setiap task harus menyertakan promptInstructions lengkap yang siap di-copy/paste atau dibaca oleh AI Agent untuk coding tanpa ambigu.`;

  const rawText = await generateLlmText({
    prompt,
    system: systemInstruction,
    conn,
    model,
    lang,
    ...options,
  });
  const data = parseJsonFromLlm(rawText, lang);

  const tasks = (data.tasks || []).map((t: any) => ({
    ...t,
    status: t.status || "todo",
  }));

  return tasks;
}
