import { parseJsonFromLlm } from "../llm/json.ts";
import type { Connection } from "../llm/types.ts";
import type { Lang } from "../messages.ts";
import { generateLlmText, type PipelineOptions } from "./llm.ts";

const outputLanguage = (lang: Lang): string =>
  lang === "id"
    ? "Gunakan Bahasa Indonesia yang profesional, jelas, dan ramah untuk SELURUH nilai teks pada JSON keluaran."
    : "Write EVERY text value in the JSON output in professional, clear, friendly English.";

export async function generatePrd(
  title: string,
  plan: any,
  conn: Connection,
  model: string,
  lang: Lang,
  options?: PipelineOptions,
  description = "",
): Promise<any> {
  const systemInstruction = `Anda adalah Technical Product Manager & Software Architect berpengalaman.
${outputLanguage(lang)}
Tugas Anda adalah menghasilkan Product Requirement Document (PRD) yang detail, terstruktur, dan Wajib mencakup 7 POIN UTAMA berikut:

PRD - Project Requirements Document
1. Overview
2. Requirements (Functional Requirements & Non-Functional Requirements)
3. Core Features (Wajib dibagi per fase: Fase 1, Fase 2, Fase 3, dan Fase Seterusnya jika ada)
4. User Flow
5. Architecture (Termasuk penjelasan arsitektur)
6. Database Schema
7. Tech Stack

POIN TAMBAHAN (OPSIONAL, DI LUAR 7 POIN WAJIB):
- Tujuh poin di atas adalah lantai minimum, bukan plafon.
- Jika setelah menganalisis proyek ini Anda menilai ada aspek penting yang tidak tertampung di 7 poin tersebut, TAMBAHKAN sebagai poin 8, 9, dan seterusnya melalui bidang "additionalSections".
- Contoh poin tambahan yang sering relevan: Integrasi Pihak Ketiga, Strategi Migrasi Data, Observability & Monitoring, Kepatuhan & Regulasi, Rencana Pengujian, Strategi Deployment & Rollback, Model Perizinan/Peran Pengguna.
- Hanya tambahkan poin yang benar-benar dibutuhkan proyek ini. Jangan menambah poin agar dokumen terlihat lengkap. Jika 7 poin sudah memadai, kembalikan "additionalSections": [].
- Setiap poin tambahan WAJIB ikut tertulis di "fullMarkdownText" dengan nomor urut yang sama.

Aturan khusus untuk Diagram Logika Mermaid.js:
- Gunakan HORIZONTAL DIAGRAM dengan sintaks 'graph LR' atau 'flowchart LR' (kiri ke kanan).
- Pastikan sintaks Mermaid VALID tanpa karakter ilegal.

Kembalikan respon PERSIS dalam format JSON berikut:
{
  "projectTitle": "Judul Proyek",
  "overview": "Penjelasan umum mengenai latar belakang, visi, dan tujuan utama proyek...",
  "requirements": {
    "functional": [
      {
        "id": "FR-01",
        "category": "Authentication",
        "description": "Pengguna dapat login menggunakan OAuth atau email",
        "acceptanceCriteria": ["Validasi email aktif", "Redirect ke Dashboard"]
      }
    ],
    "nonFunctional": [
      {
        "category": "Performa",
        "specification": "Waktu respon API < 300ms untuk 95% request"
      }
    ]
  },
  "coreFeatures": {
    "phase1": ["Fitur MVP 1", "Fitur MVP 2"],
    "phase2": ["Fitur Lanjutan 1", "Fitur Lanjutan 2"],
    "phase3": ["Fitur Integrasi & Analytics"],
    "futurePhases": ["Mobile App", "Multi-language Support"]
  },
  "userFlow": "Langkah-langkah interaksi pengguna mulai dari Landing Page -> Auth -> Dashboard -> Utama -> Output...",
  "architecture": "Penjelasan struktur arsitektur client-server, API proxy, dan manajemen state...",
  "databaseSchema": [
    {
      "entity": "Users",
      "fields": [
        { "name": "id", "type": "UUID", "description": "Primary key" },
        { "name": "email", "type": "VARCHAR(255)", "description": "Email unik pengguna" }
      ]
    }
  ],
  "techStack": [
    {
      "layer": "Frontend",
      "technology": "React + Vite + Tailwind CSS",
      "rationale": "UI cepat, modern, dan responsif"
    }
  ],
  "additionalSections": [
    {
      "number": 8,
      "title": "Integrasi Pihak Ketiga",
      "content": "Isi poin tambahan dalam teks/markdown. Kosongkan array ini jika 7 poin sudah memadai."
    }
  ],
  "logicFlowMermaid": "graph LR\\n  A[Pengguna] -->|1. Buka App| B[Landing Page]\\n  B -->|2. Input Ide| C[Plan Generator]\\n  C -->|3. Konfirmasi| D[PRD & Diagram Review]\\n  D -->|4. Build| E[Task AI Agent]",
  "logicFlowExplanation": "Penjelasan alur diagram horizontal dari kiri ke kanan...",
  "fullMarkdownText": "# PRD - Project Requirements Document\\n\\n## 1. Overview\\n...\\n\\n## 2. Requirements\\n...\\n\\n## 3. Core Features\\n- **Fase 1**:\\n  - ...\\n- **Fase 2**:\\n  - ...\\n- **Fase 3**:\\n  - ...\\n\\n## 4. User Flow\\n...\\n\\n## 5. Architecture\\n...\\n\\n## 6. Database Schema\\n...\\n\\n## 7. Tech Stack\\n...\\n\\n## 8. (Poin tambahan bila ada)\\n..."
}`;

  const prompt = `Data Project Plan yang telah disetujui:
Judul: ${title}
Deskripsi / product brief: ${description || "Belum tersedia"}
Plan Summary: ${plan?.summary || ""}
Fitur Utama: ${JSON.stringify(plan?.specs?.coreFeatures || [])}
Stack Teknologi: ${JSON.stringify(plan?.specs?.techStack || [])}
Arsitektur: ${JSON.stringify(plan?.architectureDraft || {})}

Susunkan dokumen PRD yang Wajib memuat 7 poin standar secara lengkap beserta diagram horizontal (graph LR) dalam format JSON yang diminta.
Setelah menyusun 7 poin wajib, nilai apakah proyek ini memerlukan poin tambahan (8, 9, dst). Tambahkan lewat "additionalSections" hanya jika benar-benar perlu, dan pastikan ikut tertulis di "fullMarkdownText".`;

  const rawText = await generateLlmText({
    prompt,
    system: systemInstruction,
    conn,
    model,
    lang,
    ...options,
  });
  const data = parseJsonFromLlm(rawText, lang);

  // Ensure fallback properties for legacy component support if needed
  data.executiveSummary = data.executiveSummary || data.overview;
  data.functionalRequirements = data.functionalRequirements || data.requirements?.functional || [];
  data.nonFunctionalRequirements = data.nonFunctionalRequirements || data.requirements?.nonFunctional || [];
  data.dataSchema = data.dataSchema || data.databaseSchema || [];

  // Poin tambahan: buang yang kosong dan beri nomor urut lanjutan dari 7.
  data.additionalSections = (Array.isArray(data.additionalSections) ? data.additionalSections : [])
    .filter((s: any) => s && (s.title || s.content))
    .map((s: any, idx: number) => ({
      number: Number(s.number) > 7 ? Number(s.number) : 8 + idx,
      title: s.title || `Poin Tambahan ${8 + idx}`,
      content: typeof s.content === "string" ? s.content : String(s.content ?? ""),
    }));

  return data;
}
