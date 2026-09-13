import Anthropic from "@anthropic-ai/sdk";
import { getSession, saveSession } from "./db.ts";

// Inti harness: model meminta tool, di sinilah tool itu benar-benar dijalankan,
// hasilnya dikembalikan, dan giliran berikutnya diminta — berulang sampai model
// berhenti meminta. Bedanya dengan endpoint generate-* yang sekali tembak: di
// sana alurnya ditulis di kode, di sini model yang menentukan langkahnya.

export interface AgentEvent {
  type: "text" | "tool_start" | "tool_done" | "done" | "error";
  text?: string;
  tool?: string;
  input?: unknown;
  result?: unknown;
  isError?: boolean;
  message?: string;
}

export interface AgentConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

// Default menunjuk ke 9Router lokal: satu endpoint format Anthropic yang
// meneruskan ke langganan Claude Code, Codex, Antigravity, dan lainnya.
const DEFAULT_BASE_URL = "http://localhost:20128/v1";
const DEFAULT_MODEL = "claude-combo";

const TOOLS: Anthropic.Tool[] = [
  {
    name: "get_project",
    description:
      "Baca kondisi proyek saat ini: ringkasan rencana, daftar fitur beserta sub fitur dan prioritasnya, ada atau tidaknya PRD, dan jumlah task per status. Panggil ini lebih dulu sebelum mengubah apa pun, supaya perubahan didasarkan pada isi yang sebenarnya, bukan tebakan.",
    input_schema: { type: "object", properties: {}, required: [] },
  },
  {
    name: "update_features",
    description:
      "Ganti seluruh daftar fitur utama proyek. Kirim daftar lengkap hasil yang diinginkan, bukan hanya yang berubah — isian lama akan digantikan seutuhnya. Pemakaian ini menandai arsitektur, diagram, roadmap, dan estimasi sebagai tidak lagi sinkron, sehingga pengguna diminta menyelaraskan ulang.",
    input_schema: {
      type: "object",
      properties: {
        features: {
          type: "array",
          description: "Daftar fitur lengkap setelah perubahan.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Nama fitur, singkat." },
              description: { type: "string", description: "Satu sampai dua kalimat." },
              priority: { type: "string", enum: ["P0", "P1", "P2"], description: "P0 MVP, P1 penting, P2 lanjutan." },
              subFeatures: {
                type: "array",
                items: { type: "string" },
                description: "Pecahan konkret, 2-4 kata per butir.",
              },
            },
            required: ["name", "description", "priority", "subFeatures"],
          },
        },
      },
      required: ["features"],
    },
  },
  {
    name: "set_task_status",
    description:
      "Pindahkan satu task di papan kanban ke kolom lain. Pakai id task persis seperti yang dikembalikan get_project.",
    input_schema: {
      type: "object",
      properties: {
        taskId: { type: "string", description: "Id task, misal TASK-01." },
        status: { type: "string", enum: ["todo", "in_progress", "done"] },
      },
      required: ["taskId", "status"],
    },
  },
];

// Setiap tool bekerja pada sesi yang sedang dibuka dan menulis balik ke SQLite,
// jadi perubahan dari chat langsung terlihat di kanvas dan papan task.
async function executeTool(name: string, input: any, sessionId: string): Promise<unknown> {
  const session = getSession(sessionId);
  if (!session) return { error: `Sesi ${sessionId} tidak ditemukan.` };

  if (name === "get_project") {
    return {
      title: session.input?.title || session.title || "",
      currentStep: session.currentStep,
      summary: session.plan?.summary || null,
      features: (session.plan?.specs?.coreFeatures || []).map((f: any) => ({
        name: f.name,
        description: f.description,
        priority: f.priority,
        subFeatures: f.subFeatures || [],
      })),
      hasPrd: Boolean(session.prd),
      tasks: (session.tasks || []).map((t: any) => ({ id: t.id, title: t.title, status: t.status || "todo" })),
      planFeaturesEdited: Boolean(session.planFeaturesEdited),
    };
  }

  if (name === "update_features") {
    if (!session.plan) return { error: "Proyek ini belum punya rencana, jadi fiturnya belum ada untuk diubah." };
    const features = Array.isArray(input?.features) ? input.features : [];
    if (features.length === 0) return { error: "Daftar fitur kosong. Kirim daftar lengkap hasil yang diinginkan." };

    session.plan.specs.coreFeatures = features.map((f: any) => ({
      name: String(f?.name ?? "").trim(),
      description: String(f?.description ?? "").trim(),
      priority: ["P0", "P1", "P2"].includes(f?.priority) ? f.priority : "P1",
      subFeatures: (Array.isArray(f?.subFeatures) ? f.subFeatures : [])
        .map((s: any) => String(s ?? "").trim())
        .filter((s: string) => s.length > 0),
    }));
    session.planFeaturesEdited = true;
    session.updatedAt = new Date().toISOString();
    saveSession(session);

    return {
      ok: true,
      featureCount: session.plan.specs.coreFeatures.length,
      note: "Fitur tersimpan. Arsitektur, diagram, roadmap, dan estimasi sekarang ditandai belum sinkron — pengguna bisa menyelaraskannya lewat tombol di halaman review.",
    };
  }

  if (name === "set_task_status") {
    const tasks = session.tasks || [];
    const task = tasks.find((t: any) => t.id === input?.taskId);
    if (!task) return { error: `Task ${input?.taskId} tidak ada. Panggil get_project untuk melihat id yang tersedia.` };
    task.status = input.status;
    session.updatedAt = new Date().toISOString();
    saveSession(session);
    return { ok: true, taskId: task.id, status: task.status };
  }

  return { error: `Tool ${name} tidak dikenal.` };
}

const SYSTEM_PROMPT = `Anda asisten di dalam The Architech, aplikasi perencanaan proyek perangkat lunak.

Pengguna sedang membuka satu proyek. Anda punya tool untuk membaca dan mengubah isi proyek itu secara langsung.

Cara kerja:
- Panggil get_project lebih dulu sebelum mengubah apa pun. Jangan menebak isi proyek.
- update_features mengganti SELURUH daftar fitur, jadi sertakan fitur lama yang tetap dipertahankan, bukan hanya yang baru.
- Kalau permintaan pengguna ambigu dan salah tebak akan merugikan, tanyakan dulu daripada mengubah.
- Setelah selesai, katakan singkat apa yang berubah. Jangan menyalin ulang seluruh daftar kecuali diminta.

Jawab dalam bahasa yang dipakai pengguna.`;

export async function runAgent(
  sessionId: string,
  history: Anthropic.MessageParam[],
  userMessage: string,
  config: AgentConfig,
  onEvent: (event: AgentEvent) => void
): Promise<Anthropic.MessageParam[]> {
  // SDK menolak kunci kosong dengan pesan tentang "authentication method" yang
  // tidak memberi tahu apa pun. Dicegat di sini supaya yang terbaca adalah apa
  // yang sebenarnya kurang.
  const apiKey = config.apiKey || process.env.ANTHROPIC_AUTH_TOKEN || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "API key untuk endpoint chat belum diisi. Isi di Pengaturan LLM, atau set ANTHROPIC_AUTH_TOKEN di environment server."
    );
  }

  const client = new Anthropic({
    baseURL: config.baseUrl || DEFAULT_BASE_URL,
    apiKey,
  });

  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: userMessage }];

  // Batas putaran. Tanpa ini, model yang terjebak memanggil tool yang sama
  // berulang akan memutar tanpa henti dan menghabiskan kuota diam-diam.
  for (let turn = 0; turn < 12; turn++) {
    // Parameter thinking sengaja tidak dikirim: di belakang router ini bisa ada
    // model apa pun, dan yang tidak mendukungnya menolak permintaan dengan 400.
    const stream = client.messages.stream({
      model: config.model || DEFAULT_MODEL,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: TOOLS,
      messages,
    });

    stream.on("text", (delta) => onEvent({ type: "text", text: delta }));

    const response = await stream.finalMessage();
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      onEvent({ type: "done" });
      return messages;
    }

    // Semua tool_result dari satu giliran harus pulang dalam SATU pesan user.
    // Dipecah jadi beberapa pesan, model belajar berhenti memanggil paralel.
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type !== "tool_use") continue;

      onEvent({ type: "tool_start", tool: block.name, input: block.input });
      let result: any;
      try {
        result = await executeTool(block.name, block.input, sessionId);
      } catch (err: any) {
        result = { error: err?.message || String(err) };
      }
      const isError = Boolean(result?.error);
      onEvent({ type: "tool_done", tool: block.name, result, isError });

      results.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: JSON.stringify(result),
        ...(isError ? { is_error: true } : {}),
      });
    }

    messages.push({ role: "user", content: results });
  }

  onEvent({ type: "error", message: "Batas 12 putaran tool tercapai tanpa jawaban akhir." });
  return messages;
}
