import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";
import { listSessions, getSession, saveSession, deleteSession } from "./db.ts";

dotenv.config();

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = 3000;

// Initialize Gemini Client. Key dari UI didahulukan; environment jadi cadangan.
const getGeminiClient = (userApiKey?: string) => {
  const apiKey = userApiKey?.trim() || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Warning: no Gemini API key from the request and GEMINI_API_KEY is unset.");
  }
  return new GoogleGenAI({
    apiKey: apiKey || "",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
};

// Bahasa antarmuka. Klien mengirimnya lewat body (endpoint POST) atau query
// (?lang=, untuk GET/DELETE riwayat). Yang tidak dikenali jatuh ke Inggris,
// bahasa bawaan aplikasi.
type Lang = "en" | "id";

const langOf = (req: any): Lang => ((req.body?.language ?? req.query?.lang) === "id" ? "id" : "en");

// Hanya pesan yang bisa muncul di layar pengguna yang diterjemahkan. Log server
// tetap satu bahasa supaya mudah dicari.
const MESSAGES = {
  emptyResponse: { en: "The LLM returned an empty response.", id: "Respons LLM kosong." },
  jsonFailedLogged: {
    en: "Could not parse the JSON from the LLM: {detail}. The raw output is in the server log.",
    id: "Gagal memproses JSON dari LLM: {detail}. Output mentah ada di log server.",
  },
  jsonFailedRaw: {
    en: "Could not parse the JSON from the LLM: {detail}. Raw output: {raw}",
    id: "Gagal memproses JSON dari LLM: {detail}. Output mentah: {raw}",
  },
  baseUrlRequired: {
    en: "A base URL is required for a custom LLM / Ollama endpoint.",
    id: "Base URL endpoint LLM kustom / Ollama wajib diisi.",
  },
  customEndpointError: {
    en: "The custom LLM endpoint returned an error ({status}): {detail}",
    id: "Endpoint custom LLM mengembalikan error ({status}): {detail}",
  },
  customUnreachable: {
    en: "Could not reach the custom LLM / Ollama at {url}: {detail}. Check that the service is running and reachable.",
    id: "Gagal menghubungi Custom LLM / Ollama ({url}): {detail}. Pastikan service aktif dan terjangkau.",
  },
  geminiError: { en: "Error from the Gemini API: {detail}", id: "Error dari Gemini API: {detail}" },
  historyLoadFailed: { en: "Failed to load project history.", id: "Gagal memuat riwayat proyek." },
  sessionNotFound: { en: "Project session not found.", id: "Sesi proyek tidak ditemukan." },
  sessionLoadFailed: { en: "Failed to open the project session.", id: "Gagal memuat sesi proyek." },
  sessionIdMismatch: {
    en: "The session ID in the URL does not match the one in the body.",
    id: "ID sesi pada URL dan body tidak cocok.",
  },
  sessionSaveFailed: { en: "Failed to save the project session.", id: "Gagal menyimpan sesi proyek." },
  sessionDeleteFailed: { en: "Failed to delete the project session.", id: "Gagal menghapus sesi proyek." },
  followUpFailed: { en: "Failed to generate the follow-up questions.", id: "Gagal membuat pertanyaan follow-up." },
  planFailed: { en: "Failed to generate the project plan.", id: "Gagal membuat Project Plan." },
  prdFailed: { en: "Failed to generate the PRD.", id: "Gagal membuat PRD." },
  tasksFailed: { en: "Failed to generate the AI agent tasks.", id: "Gagal membuat AI Agent Tasks." },
} as const;

const msg = (lang: Lang, key: keyof typeof MESSAGES, vars: Record<string, any> = {}): string =>
  MESSAGES[key][lang].replace(/\{(\w+)\}/g, (whole, name) => (name in vars ? String(vars[name]) : whole));

// Prompt-nya sendiri tetap ditulis dalam Bahasa Indonesia — itu instruksi untuk
// model, bukan teks yang dilihat pengguna, dan sudah disetel apa adanya. Yang
// dibuat dinamis hanya bahasa keluarannya.
const outputLanguage = (lang: Lang): string =>
  lang === "id"
    ? "Gunakan Bahasa Indonesia yang profesional, jelas, dan ramah untuk SELURUH nilai teks pada JSON keluaran."
    : "Write EVERY text value in the JSON output in professional, clear, friendly English.";

// Helper function to extract and parse JSON safely
function parseJsonFromLlm(text: string, lang: Lang = "en"): any {
  if (!text) throw new Error(msg(lang, "emptyResponse"));
  let cleaned = text.trim();
  
  // Remove markdown code fence if present
  if (cleaned.startsWith("```")) {
    const firstLineEnd = cleaned.indexOf("\n");
    if (firstLineEnd !== -1) {
      cleaned = cleaned.substring(firstLineEnd + 1);
    }
    if (cleaned.endsWith("```")) {
      cleaned = cleaned.substring(0, cleaned.length - 3);
    }
  }
  
  cleaned = cleaned.trim();
  
  try {
    return JSON.parse(cleaned);
  } catch (err: any) {
    // Ambil dari '{' atau '[' pertama sampai penutup terakhir, lalu buang koma
    // menggantung — model yang lebih lemah sering menyisakannya sebelum } atau ].
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1).replace(/,(\s*[}\]])/g, "$1");
      try {
        return JSON.parse(extracted);
      } catch (retryErr: any) {
        // Output penuh ke log server: pesan ke pengguna harus tetap ringkas,
        // tapi tanpa teks aslinya kegagalan ini tidak bisa didiagnosis.
        console.error("--- Output LLM yang gagal diparse ---\n" + cleaned + "\n--- akhir output ---");
        throw new Error(msg(lang, "jsonFailedLogged", { detail: retryErr.message }));
      }
    }
    throw new Error(msg(lang, "jsonFailedRaw", { detail: err.message, raw: cleaned.substring(0, 400) }));
  }
}

// Base URL endpoint OpenAI-compatible ditulis orang dengan tiga cara yang
// sama-sama wajar: root polos, sudah termasuk "/v1" (bentuk baku OpenAI), atau
// path lengkap. Tanpa normalisasi, bentuk kedua menjadi "/v1/v1/chat/completions".
function openAiChatUrl(baseUrl: string): string {
  const root = baseUrl.trim().replace(/\/+$/, "");
  if (/\/chat\/completions$/.test(root)) return root;
  if (/\/v\d+$/.test(root)) return `${root}/chat/completions`;
  return `${root}/v1/chat/completions`;
}

// Flexible LLM caller handling Gemini or Ollama / Custom API
async function callLlm(prompt: string, systemInstruction: string, llmConfig?: any, lang: Lang = "en"): Promise<string> {
  const provider = llmConfig?.provider || "gemini";
  
  if (provider === "ollama" || provider === "custom") {
    const baseUrl = llmConfig?.baseUrl || (provider === "ollama" ? "http://localhost:11434" : "");
    const model = llmConfig?.modelName || (provider === "ollama" ? "llama3" : "gpt-3.5-turbo");
    
    if (!baseUrl) {
      throw new Error(msg(lang, "baseUrlRequired"));
    }
    
    try {
      // Try Ollama native generate endpoint if provider is ollama
      if (provider === "ollama") {
        const ollamaRes = await fetch(`${baseUrl.replace(/\/$/, "")}/api/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: model,
            prompt: `${systemInstruction}\n\nUSER PROMPT:\n${prompt}`,
            stream: false,
          }),
        });
        
        if (ollamaRes.ok) {
          const data = await ollamaRes.json();
          return data.response || data.text || "";
        }
      }
      
      // Fallback or OpenAI compatibility route for Ollama/Custom (/v1/chat/completions)
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (llmConfig?.apiKey) {
        headers["Authorization"] = `Bearer ${llmConfig.apiKey}`;
      }
      
      const customRes = await fetch(openAiChatUrl(baseUrl), {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: model,
          // Eksplisit non-streaming: sebagian gateway OpenAI-compatible mengirim
          // SSE bila bidang ini tidak ada, dan respons itu bukan JSON valid.
          stream: false,
          messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: prompt },
          ],
          temperature: 0.2,
        }),
      });
      
      if (!customRes.ok) {
        const errText = await customRes.text();
        throw new Error(msg(lang, "customEndpointError", { status: customRes.status, detail: errText }));
      }
      
      const customData = await customRes.json();
      return customData.choices?.[0]?.message?.content || "";
    } catch (err: any) {
      throw new Error(msg(lang, "customUnreachable", { url: baseUrl, detail: err.message }));
    }
  }
  
  // Default to Gemini API
  const ai = getGeminiClient(llmConfig?.apiKey);
  const modelName = llmConfig?.modelName || "gemini-3.6-flash";
  
  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: "application/json",
      },
    });
    
    return response.text || "";
  } catch (err: any) {
    throw new Error(msg(lang, "geminiError", { detail: err.message }));
  }
}

// API Routes

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Riwayat Proyek (SQLite) — daftar, buka, simpan, hapus
app.get("/api/sessions", (req, res) => {
  try {
    res.json({ sessions: listSessions() });
  } catch (err: any) {
    console.error("Error GET /api/sessions:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "historyLoadFailed") });
  }
});

app.get("/api/sessions/:id", (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: msg(langOf(req), "sessionNotFound") });
      return;
    }
    res.json(session);
  } catch (err: any) {
    console.error("Error GET /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "sessionLoadFailed") });
  }
});

app.put("/api/sessions/:id", (req, res) => {
  try {
    const session = req.body;
    if (!session || session.id !== req.params.id) {
      res.status(400).json({ error: msg(langOf(req), "sessionIdMismatch") });
      return;
    }
    saveSession(session);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error PUT /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "sessionSaveFailed") });
  }
});

app.delete("/api/sessions/:id", (req, res) => {
  try {
    deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error DELETE /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "sessionDeleteFailed") });
  }
});

// Test LLM Connection
app.post("/api/test-llm", async (req, res) => {
  try {
    const { llmConfig } = req.body;
    const lang = langOf(req);
    const testPrompt = "Kirim pesan JSON singkat {\"status\": \"connected\", \"message\": \"Koneksi LLM Berhasil\"}";
    const sys = "Respon dalam format JSON valid.";
    const result = await callLlm(testPrompt, sys, llmConfig, lang);
    const parsed = parseJsonFromLlm(result, lang);
    res.json({ success: true, response: parsed });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Fitur 1: Follow-up Questions (Mengklarifikasi Ide & Spesifikasi Proyek)
// Bisa dipanggil berulang: jika masih ada keraguan material, LLM mengajukan
// ronde pertanyaan berikutnya. Tidak ada batas jumlah pertanyaan.
app.post("/api/followup-questions", async (req, res) => {
  try {
    const lang = langOf(req);
    const {
      title,
      description,
      targetAudience,
      techStackPreference,
      previousAnswers,
      round,
      llmConfig,
    } = req.body;

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

    const rawText = await callLlm(prompt, systemInstruction, llmConfig, lang);
    const data = parseJsonFromLlm(rawText, lang);

    const questions = (data.questions || []).map((q: any) => ({
      ...q,
      round: currentRound,
    }));

    res.json({
      questions,
      // Kalau LLM tidak menyebut needsMoreInfo, turunkan dari ada/tidaknya pertanyaan.
      needsMoreInfo: typeof data.needsMoreInfo === "boolean" ? data.needsMoreInfo : questions.length > 0,
      readinessNote: data.readinessNote || "",
      round: currentRound,
    });
  } catch (err: any) {
    console.error("Error /api/followup-questions:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "followUpFailed") });
  }
});

// Dipakai penyusunan awal maupun penyelarasan ulang, jadi hidup di luar handler.
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

// Fitur 1: Generate Plan (Arsitektur, Roadmap, Estimasi, Diagram Horizontal)
app.post("/api/generate-plan", async (req, res) => {
  try {
    const { title, description, targetAudience, techStackPreference, answers, lockedFeatures, llmConfig } = req.body;
    const lang = langOf(req);
    
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

    const rawText = hasLock
      ? await callLlm(resyncPrompt, resyncSystemInstruction, llmConfig, lang)
      : await callLlm(prompt, systemInstruction, llmConfig, lang);
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

    res.json(data);
  } catch (err: any) {
    console.error("Error /api/generate-plan:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "planFailed") });
  }
});

// Fitur 2: Generate PRD Sesuai Standar 7 Poin & Diagram Horizontal
app.post("/api/generate-prd", async (req, res) => {
  try {
    const { title, plan, llmConfig } = req.body;
    const lang = langOf(req);
    
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
Plan Summary: ${plan?.summary || ""}
Fitur Utama: ${JSON.stringify(plan?.specs?.coreFeatures || [])}
Stack Teknologi: ${JSON.stringify(plan?.specs?.techStack || [])}
Arsitektur: ${JSON.stringify(plan?.architectureDraft || {})}

Susunkan dokumen PRD yang Wajib memuat 7 poin standar secara lengkap beserta diagram horizontal (graph LR) dalam format JSON yang diminta.
Setelah menyusun 7 poin wajib, nilai apakah proyek ini memerlukan poin tambahan (8, 9, dst). Tambahkan lewat "additionalSections" hanya jika benar-benar perlu, dan pastikan ikut tertulis di "fullMarkdownText".`;

    const rawText = await callLlm(prompt, systemInstruction, llmConfig, lang);
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

    res.json(data);
  } catch (err: any) {
    console.error("Error /api/generate-prd:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "prdFailed") });
  }
});

// Fitur 3: Generate Agent Tasks
app.post("/api/generate-tasks", async (req, res) => {
  try {
    const { title, plan, prd, llmConfig } = req.body;
    const lang = langOf(req);
    
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

    const rawText = await callLlm(prompt, systemInstruction, llmConfig, lang);
    const data = parseJsonFromLlm(rawText, lang);
    
    const tasks = (data.tasks || []).map((t: any) => ({
      ...t,
      status: t.status || "todo",
    }));

    // Build bundled markdown string for AGENTS.md
    let bundledMarkdown = `# AI AGENT EXECUTION TASKS FOR: ${(title || "PROJECT").toUpperCase()}\n\n`;
    bundledMarkdown += `> Generated by The Architech on ${new Date().toLocaleDateString()}\n`;
    bundledMarkdown += `> Target Environment: AI Coding Agent (Cursor, Antigravity Agent, Gemini, Claude)\n\n`;
    bundledMarkdown += `## OVERVIEW & EXECUTION RULES FOR AI AGENT\n`;
    bundledMarkdown += `- Eksekusi tugas secara berurutan sesuai dependensi.\n`;
    bundledMarkdown += `- Verifikasi setiap langkah sebelum melanjutkan ke task berikutnya.\n\n`;
    bundledMarkdown += `---------------------------------------------------\n\n`;

    tasks.forEach((t: any) => {
      bundledMarkdown += `### [${t.id}] ${t.title}\n`;
      bundledMarkdown += `- **Fase**: ${t.phase || 'General'}\n`;
      bundledMarkdown += `- **Prioritas**: ${t.priority}\n`;
      bundledMarkdown += `- **File Target**: \`${(t.targetFiles || []).join("`, `")}\` \n`;
      bundledMarkdown += `- **Dependensi**: ${(t.dependencies || []).length > 0 ? t.dependencies.join(", ") : "Tidak Ada"}\n\n`;
      bundledMarkdown += `#### 📋 Instruksi Prompt AI Agent:\n\`\`\`\n${t.promptInstructions}\n\`\`\`\n\n`;
      bundledMarkdown += `#### ✅ Langkah Verifikasi:\n${t.verificationSteps}\n\n`;
      bundledMarkdown += `---------------------------------------------------\n\n`;
    });

    res.json({ tasks, bundledMarkdown });
  } catch (err: any) {
    console.error("Error /api/generate-tasks:", err);
    res.status(500).json({ error: err.message || msg(langOf(req), "tasksFailed") });
  }
});

// Start Express + Vite integration
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`The Architech server listening on http://localhost:${PORT}`);
  });
}

startServer();
