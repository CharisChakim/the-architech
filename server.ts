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

// Initialize Gemini Client
const getGeminiClient = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("Warning: GEMINI_API_KEY is missing in environment variables.");
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

// Helper function to extract and parse JSON safely
function parseJsonFromLlm(text: string): any {
  if (!text) throw new Error("Respons LLM kosong.");
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
    // Try finding first { or [ and last } or ]
    const firstBrace = cleaned.search(/[\{\[]/);
    const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = cleaned.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    }
    throw new Error(`Gagal memproses JSON dari LLM: ${err.message}. Raw output: ${cleaned.substring(0, 300)}...`);
  }
}

// Flexible LLM caller handling Gemini or Ollama / Custom API
async function callLlm(prompt: string, systemInstruction: string, llmConfig?: any): Promise<string> {
  const provider = llmConfig?.provider || "gemini";
  
  if (provider === "ollama" || provider === "custom") {
    const baseUrl = llmConfig?.baseUrl || (provider === "ollama" ? "http://localhost:11434" : "");
    const model = llmConfig?.modelName || (provider === "ollama" ? "llama3" : "gpt-3.5-turbo");
    
    if (!baseUrl) {
      throw new Error("Base URL endpoint LLM kustom / Ollama wajib diisi.");
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
      
      const customRes = await fetch(`${baseUrl.replace(/\/$/, "")}/v1/chat/completions`, {
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
        throw new Error(`Endpoint custom LLM mengembalikan error (${customRes.status}): ${errText}`);
      }
      
      const customData = await customRes.json();
      return customData.choices?.[0]?.message?.content || "";
    } catch (err: any) {
      throw new Error(`Gagal menghubungi Custom LLM / Ollama (${baseUrl}): ${err.message}. Pastikan service aktif dan terjangkau.`);
    }
  }
  
  // Default to Gemini API
  const ai = getGeminiClient();
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
    throw new Error(`Error dari Gemini API: ${err.message}`);
  }
}

// API Routes

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Riwayat Proyek (SQLite) — daftar, buka, simpan, hapus
app.get("/api/sessions", (_req, res) => {
  try {
    res.json({ sessions: listSessions() });
  } catch (err: any) {
    console.error("Error GET /api/sessions:", err);
    res.status(500).json({ error: err.message || "Gagal memuat riwayat proyek." });
  }
});

app.get("/api/sessions/:id", (req, res) => {
  try {
    const session = getSession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Sesi proyek tidak ditemukan." });
      return;
    }
    res.json(session);
  } catch (err: any) {
    console.error("Error GET /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || "Gagal memuat sesi proyek." });
  }
});

app.put("/api/sessions/:id", (req, res) => {
  try {
    const session = req.body;
    if (!session || session.id !== req.params.id) {
      res.status(400).json({ error: "ID sesi pada URL dan body tidak cocok." });
      return;
    }
    saveSession(session);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error PUT /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || "Gagal menyimpan sesi proyek." });
  }
});

app.delete("/api/sessions/:id", (req, res) => {
  try {
    deleteSession(req.params.id);
    res.json({ success: true });
  } catch (err: any) {
    console.error("Error DELETE /api/sessions/:id:", err);
    res.status(500).json({ error: err.message || "Gagal menghapus sesi proyek." });
  }
});

// Test LLM Connection
app.post("/api/test-llm", async (req, res) => {
  try {
    const { llmConfig } = req.body;
    const testPrompt = "Kirim pesan JSON singkat {\"status\": \"connected\", \"message\": \"Koneksi LLM Berhasil\"}";
    const sys = "Respon dalam format JSON valid.";
    const result = await callLlm(testPrompt, sys, llmConfig);
    const parsed = parseJsonFromLlm(result);
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
Gunakan Bahasa Indonesia yang profesional, jelas, dan ramah.

ATURAN JUMLAH PERTANYAAN:
- TIDAK ADA batas jumlah pertanyaan. Ajukan sebanyak yang benar-benar Anda perlukan, tidak lebih.
- Proses ini bertahap (multi-ronde). Anda akan dipanggil ulang beserta jawaban pengguna sebelumnya.
- Jika setelah membaca jawaban yang ada MASIH ADA keraguan material (hal yang akan membuat Anda menebak saat menyusun arsitektur, skema data, atau prioritas fitur), ajukan pertanyaan lanjutan pada ronde ini.
- Jika informasi sudah CUKUP untuk menyusun rencana yang matang, kembalikan "questions": [] dan "needsMoreInfo": false.
- JANGAN mengulang pertanyaan yang sudah dijawab, dan jangan bertanya hal yang jawabannya sudah tersirat di deskripsi.
- Jangan bertanya hanya untuk memenuhi kuota. Satu pertanyaan tajam lebih baik daripada lima pertanyaan basa-basi.

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

    const rawText = await callLlm(prompt, systemInstruction, llmConfig);
    const data = parseJsonFromLlm(rawText);

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
    res.status(500).json({ error: err.message || "Gagal membuat pertanyaan follow-up." });
  }
});

// Fitur 1: Generate Plan (Arsitektur, Roadmap, Estimasi, Diagram Horizontal)
app.post("/api/generate-plan", async (req, res) => {
  try {
    const { title, description, targetAudience, techStackPreference, answers, llmConfig } = req.body;
    
    const answersFormatted = answers && typeof answers === "object"
      ? Object.entries(answers).map(([q, a]) => `- ${q}: ${a}`).join("\n")
      : "Tidak ada jawaban tambahan dari follow-up.";

    const systemInstruction = `Anda adalah System Architect & Enterprise Product Planner terkemuka.
Tugas Anda adalah menyusun dokumen "Project Plan & Architecture Specification" yang komprehensif berdasarkan deskripsi aplikasi dan klarifikasi pengguna.

Sangat Penting untuk Diagram Logika / Arsitektur:
- Buatkan sintaks Mermaid.js HORIZONTAL MENGGUNAKAN 'graph LR' ATAU 'flowchart LR' (kiri ke kanan, bukan vertikal).
- Pastikan sintaks Mermaid VALID tanpa karakter ilegal.

Sangat Penting untuk Sub Fitur:
- Setiap fitur di "coreFeatures" WAJIB dipecah menjadi 2 sampai 6 sub fitur pada bidang "subFeatures".
- Sub fitur adalah bagian konkret yang bisa dikerjakan sebagai unit terpisah, bukan pengulangan nama fitur.
- Tulis ringkas (2-4 kata) seperti judul kartu, misal "Tampilan Candlestick", "Ganti Timeframe", "Atur Sinkron".
- Jangan menulis kalimat panjang atau penjelasan pada sub fitur.

Kembalikan respon PERSIS dalam format JSON berikut tanpa teks tambahan:
{
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
        "layer": "Frontend / Backend / Database / Deployment / AI Engine",
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
    "diagramMermaid": "graph LR\\n  Client[User Interface] -->|REST / API| Server[Express Backend]\\n  Server -->|Query| DB[(Database)]\\n  Server -->|SDK| AI[Gemini Engine]"
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
      "Gemini AI API Key"
    ],
    "potentialRisks": [
      {
        "risk": "Deskripsi risiko teknis/skop...",
        "mitigation": "Langkah pencegahan/solusi..."
      }
    ]
  }
}`;

    const prompt = `Informasi Proyek:
Judul: ${title}
Deskripsi Detail:
${description}
Target Pengguna: ${targetAudience || "Sesuai analisis AI"}
Teknologi Diharapkan: ${techStackPreference || "Rekomendasi Terbaik AI"}

Jawaban & Klarifikasi Tambahan dari Pengguna:
${answersFormatted}

Buatkan Project Plan & Arsitektur Aplikasi yang matang, efisien, dan menyertakan diagram HORIZONTAL (graph LR).
Setiap fitur WAJIB memiliki "subFeatures" berisi 2-6 pecahan ringkas. Jawab dalam format JSON sesuai skema.`;

    const rawText = await callLlm(prompt, systemInstruction, llmConfig);
    const data = parseJsonFromLlm(rawText);

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
    res.status(500).json({ error: err.message || "Gagal membuat Project Plan." });
  }
});

// Fitur 2: Generate PRD Sesuai Standar 7 Poin & Diagram Horizontal
app.post("/api/generate-prd", async (req, res) => {
  try {
    const { title, plan, llmConfig } = req.body;
    
    const systemInstruction = `Anda adalah Technical Product Manager & Software Architect berpengalaman.
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

    const rawText = await callLlm(prompt, systemInstruction, llmConfig);
    const data = parseJsonFromLlm(rawText);

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
    res.status(500).json({ error: err.message || "Gagal membuat PRD." });
  }
});

// Fitur 3: Generate Agent Tasks
app.post("/api/generate-tasks", async (req, res) => {
  try {
    const { title, plan, prd, llmConfig } = req.body;
    
    const systemInstruction = `Anda adalah Principal AI Engineer & Prompt Architect.
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

    const rawText = await callLlm(prompt, systemInstruction, llmConfig);
    const data = parseJsonFromLlm(rawText);
    
    const tasks = (data.tasks || []).map((t: any) => ({
      ...t,
      status: t.status || "todo",
    }));

    // Build bundled markdown string for AGENTS.md
    let bundledMarkdown = `# AI AGENT EXECUTION TASKS FOR: ${(title || "PROJECT").toUpperCase()}\n\n`;
    bundledMarkdown += `> Generated by AI Plan Architect on ${new Date().toLocaleDateString()}\n`;
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
    res.status(500).json({ error: err.message || "Gagal membuat AI Agent Tasks." });
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
    console.log(`AI Plan Architect server listening on http://localhost:${PORT}`);
  });
}

startServer();
