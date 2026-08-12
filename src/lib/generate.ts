import { ProjectSession, PRDData } from "../types";
import { Language, makeT } from "./i18n";

// Dipakai dua tempat: tombol "Continue to the PRD" di Step 1, dan tombol
// generate / regenerate di Step 2. Keduanya harus mengirim bidang yang sama,
// jadi permintaannya tinggal di satu tempat.
export async function generatePrd(session: ProjectSession, lang: Language): Promise<PRDData> {
  const res = await fetch("/api/generate-prd", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: session.input.title || session.title || "AI application",
      plan: session.plan,
      llmConfig: session.llmConfig,
      language: lang,
    }),
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || makeT(lang)("Failed to generate the PRD."));
  return data as PRDData;
}
