import { callLlm as callLlmCore } from "../llm/call.ts";
import { parseJsonFromLlm } from "../llm/json.ts";
import type { Connection } from "../llm/types.ts";
import type { Lang } from "../messages.ts";
import { msg } from "../messages.ts";

export interface PlanInput {
  title?: string;
  description?: string;
  targetAudience?: string;
  techStackPreference?: string;
  answers?: Record<string, unknown>;
}

const outputLanguage = (lang: Lang): string =>
  lang === "id"
    ? "Gunakan Bahasa Indonesia yang profesional, jelas, dan ramah untuk SELURUH nilai teks pada JSON keluaran."
    : "Write EVERY text value in the JSON output in professional, clear, friendly English.";

const DIAGRAM_RULES = `Sangat Penting untuk Diagram Logika / Arsitektur:
- Buatkan sintaks Mermaid.js HORIZONTAL MENGGUNAKAN 'graph LR' ATAU 'flowchart LR' (kiri ke kanan, bukan vertikal).
- Pastikan sintaks Mermaid VALID tanpa karakter ilegal.
- Kelompokkan node dengan blok 'subgraph' per lapisan (misal Client, Backend, Data & Layanan Eksternal). Diagram datar tanpa subgraph membuat garis saling silang.
- MAKSIMAL 12 node. Gabungkan service sejenis menjadi satu node daripada memecahnya satu per satu.
- Beri label hanya pada edge yang benar-benar perlu dijelaskan. Edge polos lebih rapi daripada label berulang seperti "Query" di banyak garis.`;

const AI_RULES = `Aturan komponen AI / LLM:
- Sertakan layer, komponen, service, atau biaya AI/LLM HANYA jika fungsi inti aplikasi memang menuntutnya (misal chatbot, ringkasan otomatis, rekomendasi cerdas, pencarian semantik).
- Jika kebutuhan AI tidak terbukti dari deskripsi dan jawaban klarifikasi pengguna, JANGAN menambahkan "AI Engine", API key model, atau service AI apa pun. Aplikasi CRUD, dashboard, kasir, atau manajemen data biasanya TIDAK memerlukan LLM.
- Menambahkan AI yang tidak dibutuhkan adalah kesalahan serius: menaikkan biaya, kompleksitas, dan risiko proyek tanpa alasan.`;

export async function generatePlan(
  input: PlanInput,
  conn: Connection,
  model: string,
  lang: Lang,
  lockedFeatures?: unknown[],
): Promise<any> {
  const { title, description, targetAudience, techStackPreference, answers } = input;

  const answersFormatted = answers && typeof answers === "object"
    ? Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`).join("\n")
    : "Tidak ada jawaban tambahan dari follow-up.";

  const hasLock = Array.isArray(lockedFeatures) && lockedFeatures.length > 0;

  const systemInstruction = `Anda adalah System Architect & Enterprise Product Planner terkemuka.
${outputLanguage(lang)}
Tugas Anda adalah menyusun dokumen "Project Plan & Architecture Specification" yang komprehensif berdasarkan deskripsi aplikasi dan klarifikasi pengguna.

${DIAGRAM_RULES}

${AI_RULES}

Sangat Penting untuk Sub Fitur:
- Setiap fitur di "coreFeatures" WAJIB dipecah menjadi 2 sampai 6 sub fitur pada bidang "subFeatures".
- Sub fitur adalah bagian konkret yang bisa dikerjakan sebagai unit terpisah, bukan pengulangan nama fitur.
- Tulis ringkas (2-4 kata) seperti judul kartu, misal "Tampilan Candlestick", "Ganti Timeframe", "Atur Sinkron".
- Jangan menulis kalimat panjang atau penjelasan pada sub fitur.

Pengguna hanya memberi satu paragraf ide; judul, target pengguna, dan stack TIDAK ditanyakan lewat form.
- Simpulkan sendiri target pengguna dan stack yang paling sesuai.
- Usulkan nama proyek yang singkat (2-4 kata) pada bidang "suggestedTitle". Jangan memakai kalimat ide sebagai judul.

Kembalikan respon PERSIS dalam format JSON berikut tanpa teks tambahan:
{
  "suggestedTitle": "Nama Proyek Singkat",
  "summary": "Ringkasan eksekutif rencana proyek...",
  "specs": {
    "targetAudience": "Penjelasan target pengguna spesifik...",
    "keyValueProposition": "Nilai jual utama aplikasi...",
    "coreFeatures": [
      {
        "name": "Nama Fitur",
        "description": "Detail deskripsi dan fungsi fitur...",
        "priority": "P0", // "P0" (MVP Wajib), "P1" (Penting), atau "P2" (Opsional/Tahap Lanjutan)
        "subFeatures": [
          "Sub fitur konkret yang bisa dikerjakan terpisah",
          "Sub fitur kedua",
          "Sub fitur ketiga"
        ]
      }
    ],
    "techStack": [
      {
        "layer": "Frontend / Backend / Database / Deployment (tambahkan AI Engine HANYA bila proyek benar-benar butuh)",
        "technology": "Nama Teknologi (misal React + Tailwind, Node.js + Express, PostgreSQL)",
        "rationale": "Alasan pemilihan teknologi..."
      }
    ]
  },
  "architectureDraft": {
    "overview": "Deskripsi arsitektur sistem secara menyeluruh...",
    "components": [
      {
        "name": "Nama Komponen",
        "purpose": "Tujuan komponen...",
        "type": "Client UI / REST API / Background Worker / Database / Service"
      }
    ],
    "dataFlow": "Penjelasan alur data utama dari client ke server hingga persistent storage...",
    "securityAndAuth": "Strategi keamanan, enkripsi, dan otentikasi...",
    "diagramMermaid": "graph LR\\n  subgraph Client\\n    UI[User Interface]\\n  end\\n  subgraph Backend\\n    API[Application Server]\\n    Worker[Background Worker]\\n  end\\n  subgraph Data\\n    DB[(Database)]\\n    Files[(Object Storage)]\\n  end\\n  UI -->|REST| API\\n  API --> Worker\\n  API --> DB\\n  Worker --> DB\\n  API --> Files"
  },
  "roadmap": [
    {
      "phase": "Fase 1",
      "title": "MVP Setup & Core Mechanics",
      "duration": "1-2 Minggu",
      "deliverables": [
        "Inisialisasi repositori & konfigurasi",
        "Skema database awal",
        "Implementasi UI Dasar"
      ]
    }
  ],
  "estimation": {
    "totalTimeWeeks": "4-6 Minggu",
    "complexityLevel": "Sedang", // "Rendah", "Sedang", "Tinggi", "Sangat Tinggi"
    "requiredResources": [
      "1 Frontend Developer",
      "1 Backend Engineer",
      "Hosting & domain"
    ],
    "potentialRisks": [
      {
        "risk": "Deskripsi risiko teknis/skop...",
        "mitigation": "Langkah pencegahan/solusi..."
      }
    ]
  }
}`;

  const prompt = `Ide dari pengguna:
${description}
${title ? `\nNama sementara yang dipakai sistem: ${title} (ganti dengan usulan Anda sendiri di "suggestedTitle")` : ""}
${targetAudience ? `Target Pengguna: ${targetAudience}` : ""}
${techStackPreference ? `Teknologi Diharapkan: ${techStackPreference}` : ""}

Jawaban & Klarifikasi Tambahan dari Pengguna:
${answersFormatted}

Buatkan Project Plan & Arsitektur Aplikasi yang matang, efisien, dan menyertakan diagram HORIZONTAL (graph LR).
Simpulkan sendiri target pengguna dan stack bila tidak disebutkan di atas.
Setiap fitur WAJIB memiliki "subFeatures" berisi 2-6 pecahan ringkas. Jawab dalam format JSON sesuai skema.`;

  // Mode penyelarasan ulang. Meminta model menyalin ulang coreFeatures terbukti
  // gagal: selama bidang itu ada di skema contoh, model kecil mengisinya dengan
  // fitur karangannya sendiri lalu merancang arsitektur untuk fitur itu. Maka
  // di sini coreFeatures dihapus dari skema — model hanya diminta menurunkan
  // bagian lain, dan daftar fitur dipasang kembali oleh server.
  const resyncSystemInstruction = `Anda adalah System Architect & Enterprise Product Planner terkemuka.
${outputLanguage(lang)}
Daftar fitur aplikasi ini SUDAH FINAL dan ditetapkan pengguna. Anda TIDAK diminta menyusun, menilai, menambah, atau mengubah daftar fitur.
Tugas Anda HANYA menurunkan arsitektur, stack, roadmap, dan estimasi yang melayani TEPAT fitur-fitur berikut:

${JSON.stringify(lockedFeatures, null, 2)}

Dilarang merancang komponen, tahapan roadmap, teknologi, atau biaya untuk kemampuan yang tidak ada dalam daftar fitur di atas.

${DIAGRAM_RULES}

${AI_RULES}

Kembalikan respon PERSIS dalam format JSON berikut tanpa teks tambahan. Perhatikan: TIDAK ADA bidang "coreFeatures" di skema ini.
{
  "suggestedTitle": "Nama Proyek Singkat",
  "summary": "Ringkasan eksekutif rencana proyek...",
  "specs": {
    "targetAudience": "Penjelasan target pengguna spesifik...",
    "keyValueProposition": "Nilai jual utama aplikasi...",
    "techStack": [
      { "layer": "Frontend", "technology": "Nama Teknologi", "rationale": "Alasan pemilihan..." }
    ]
  },
  "architectureDraft": {
    "overview": "Deskripsi arsitektur sistem secara menyeluruh...",
    "components": [
      { "name": "Nama Komponen", "purpose": "Tujuan komponen...", "type": "Client UI / REST API / Background Worker / Database / Service" }
    ],
    "dataFlow": "Penjelasan alur data utama...",
    "securityAndAuth": "Strategi keamanan dan otentikasi...",
    "diagramMermaid": "graph LR\\n  subgraph Client\\n    UI[User Interface]\\n  end\\n  subgraph Backend\\n    API[Application Server]\\n  end\\n  subgraph Data\\n    DB[(Database)]\\n  end\\n  UI -->|REST| API\\n  API --> DB"
  },
  "roadmap": [
    { "phase": "Fase 1", "title": "Judul fase", "duration": "1-2 Minggu", "deliverables": ["..."] }
  ],
  "estimation": {
    "totalTimeWeeks": "4-6 Minggu",
    "complexityLevel": "Sedang",
    "requiredResources": ["1 Frontend Developer", "1 Backend Engineer"],
    "potentialRisks": [{ "risk": "...", "mitigation": "..." }]
  }
}`;

  const resyncPrompt = `Konteks ide awal pengguna:
${description}
${targetAudience ? `Target Pengguna: ${targetAudience}` : ""}
${techStackPreference ? `Teknologi Diharapkan: ${techStackPreference}` : ""}

Jawaban & Klarifikasi Tambahan dari Pengguna:
${answersFormatted}

Daftar fitur sudah final (ada di instruksi sistem). Susun arsitektur, techStack, roadmap, dan estimasi yang melayani tepat fitur-fitur itu.
Jangan mengeluarkan bidang "coreFeatures". Jawab dalam format JSON sesuai skema.`;

  if (!conn.baseUrl) throw new Error(msg(lang, "baseUrlRequired"));
  const rawText = hasLock
    ? await callLlmCore({
        prompt: resyncPrompt,
        system: resyncSystemInstruction,
        conn,
        model,
        lang,
        jsonMode: conn.jsonMode,
      })
    : await callLlmCore({
        prompt,
        system: systemInstruction,
        conn,
        model,
        lang,
        jsonMode: conn.jsonMode,
      });
  const data = parseJsonFromLlm(rawText, lang);

  // Daftar fitur tidak pernah datang dari model saat mode terkunci.
  if (hasLock) {
    data.specs = { ...(data.specs || {}), coreFeatures: lockedFeatures };
  }

  // Sub fitur menopang kolom ketiga kanvas struktur, jadi bentuknya dipastikan
  // di sini: selalu array string non-kosong, apa pun yang dikirim LLM.
  if (Array.isArray(data?.specs?.coreFeatures)) {
    data.specs.coreFeatures = data.specs.coreFeatures.map((f: any) => ({
      ...f,
      subFeatures: (Array.isArray(f?.subFeatures) ? f.subFeatures : [])
        .map((s: any) => (typeof s === "string" ? s.trim() : String(s?.name ?? s ?? "").trim()))
        .filter((s: string) => s.length > 0),
    }));
  }

  return data;
}
