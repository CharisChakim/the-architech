import { parseJsonFromLlm } from "../llm/json.ts";
import type { Connection } from "../llm/types.ts";
import type { Lang } from "../messages.ts";
import { msg } from "../messages.ts";
import { generateLlmText, type PipelineOptions } from "./llm.ts";

export interface FollowupInput {
  title?: string;
  description?: string;
  targetAudience?: string;
  techStackPreference?: string;
  previousAnswers?: Record<string, unknown>;
  round?: number;
}

const outputLanguage = (lang: Lang): string =>
  lang === "id"
    ? "Gunakan Bahasa Indonesia yang profesional, jelas, dan ramah untuk SELURUH nilai teks pada JSON keluaran."
    : "Write EVERY text value in the JSON output in professional, clear, friendly English.";

export async function generateFollowups(
  input: FollowupInput,
  conn: Connection,
  model: string,
  lang: Lang,
  options?: PipelineOptions,
): Promise<any> {
  const {
    title,
    description,
    targetAudience,
    techStackPreference,
    previousAnswers,
    round,
  } = input;

  const currentRound = Number(round) || 1;
  const priorQa =
    previousAnswers && typeof previousAnswers === "object" && Object.keys(previousAnswers).length > 0
      ? Object.entries(previousAnswers)
          .map(([q, a]) => `- ${q}\n  Jawaban: ${a}`)
          .join("\n")
      : "";

  const systemInstruction = `Anda adalah Lead Software Architect & Product Manager Senior.
Tugas Anda adalah mengklarifikasi ide/deskripsi aplikasi pengguna sampai Anda benar-benar yakin bisa menyusun arsitektur dan rencana proyek tanpa menebak.
${outputLanguage(lang)}

ATURAN JUMLAH PERTANYAAN:
- TIDAK ADA batas jumlah pertanyaan. Ajukan sebanyak yang benar-benar Anda perlukan, tidak lebih.
- Proses ini bertahap (multi-ronde). Anda akan dipanggil ulang beserta jawaban pengguna sebelumnya.
- Jika setelah membaca jawaban yang ada MASIH ADA keraguan material (hal yang akan membuat Anda menebak saat menyusun arsitektur, skema data, atau prioritas fitur), ajukan pertanyaan lanjutan pada ronde ini.
- Jika informasi sudah CUKUP untuk menyusun rencana yang matang, kembalikan "questions": [] dan "needsMoreInfo": false.
- JANGAN mengulang pertanyaan yang sudah dijawab, dan jangan bertanya hal yang jawabannya sudah tersirat di deskripsi.
- Jangan bertanya hanya untuk memenuhi kuota. Satu pertanyaan tajam lebih baik daripada lima pertanyaan basa-basi.
${
  currentRound === 1
    ? `
WAJIB PADA RONDE 1 INI:
- Sertakan satu pertanyaan berkategori "technical" yang mengkonfirmasi apakah aplikasi ini benar-benar memerlukan komponen AI/LLM, KECUALI deskripsi pengguna sudah menyebut AI secara eksplisit sebagai fungsi inti.
- Pertanyaan itu WAJIB punya pilihan "Tidak perlu AI, cukup logika biasa" sebagai salah satu options.
- Jangan berasumsi proyek butuh AI hanya karena perencanaan ini dibantu AI. Banyak aplikasi lebih baik tanpa LLM.`
    : ""
}

WAJIB SERTAKAN 3 hingga 4 pilihan jawaban terstruktur (options) untuk setiap pertanyaan agar pengguna tinggal memilih dengan 1 klik atau mengisi jawaban kustom.

Kembalikan respon PERSIS dalam format JSON berikut tanpa teks tambahan di luar JSON:
{
  "needsMoreInfo": true,
  "readinessNote": "Penjelasan singkat: apa yang masih kurang, atau alasan mengapa informasi sudah cukup.",
  "questions": [
    {
      "id": "r${currentRound}q1",
      "category": "scope",
      "question": "Pertanyaan terarah...",
      "explanation": "Alasan mengapa pertanyaan ini penting untuk pengembangan...",
      "suggestedAnswer": "Jawaban yang direkomendasikan",
      "options": [
        "Pilihan A: Sederhana & Cepat",
        "Pilihan B: Komprehensif dengan Auth & Database",
        "Pilihan C: Enterprise dengan Analytics & Multi-tenant"
      ]
    }
  ]
}

Gunakan prefix "r${currentRound}q" pada setiap id agar id tetap unik antar ronde.`;

  const prompt = `Informasi Proyek:
Judul Proyek: ${title || "Aplikasi Baru"}
Deskripsi Proyek:
${description}
Target Pengguna (Jika Ada): ${targetAudience || "Belum ditentukan"}
Ekspektasi Stack Teknologi (Jika Ada): ${techStackPreference || "Bebas / Rekomendasi AI"}

Ini adalah RONDE KLARIFIKASI KE-${currentRound}.
${
  priorQa
    ? `Pertanyaan yang SUDAH dijawab pengguna pada ronde sebelumnya:\n${priorQa}\n\nNilai apakah jawaban di atas sudah cukup. Jika masih ada keraguan material, ajukan pertanyaan lanjutan yang BELUM pernah ditanyakan. Jika sudah cukup, kembalikan questions kosong dengan needsMoreInfo: false.`
    : `Belum ada jawaban sebelumnya. Ajukan pertanyaan klarifikasi awal sebanyak yang Anda perlukan.`
}

Jawab dalam format JSON yang telah ditentukan. Sertakan bidang "options" dengan minimal 3 pilihan ringkas untuk setiap pertanyaan.`;

  if (!conn.baseUrl) throw new Error(msg(lang, "baseUrlRequired"));
  const rawText = await generateLlmText({
    prompt,
    system: systemInstruction,
    conn,
    model,
    lang,
    ...options,
  });
  const data = parseJsonFromLlm(rawText, lang);

  const questions = (data.questions || []).map((q: any) => ({
    ...q,
    round: currentRound,
  }));

  return {
    questions,
    // Kalau LLM tidak menyebut needsMoreInfo, turunkan dari ada/tidaknya pertanyaan.
    needsMoreInfo: typeof data.needsMoreInfo === "boolean" ? data.needsMoreInfo : questions.length > 0,
    readinessNote: data.readinessNote || "",
    round: currentRound,
  };
}
