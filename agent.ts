import Anthropic from "@anthropic-ai/sdk";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { getSession, saveSession } from "./db.ts";

// Inti harness: model meminta tool, di sinilah tool itu benar-benar dijalankan,
// hasilnya dikembalikan, dan giliran berikutnya diminta — berulang sampai model
// berhenti meminta. Bedanya dengan endpoint generate-* yang sekali tembak: di
// sana alurnya ditulis di kode, di sini model yang menentukan langkahnya.

export interface AgentEvent {
  type: "text" | "tool_start" | "tool_done" | "approval_request" | "approval_resolved" | "done" | "error";
  text?: string;
  tool?: string;
  input?: unknown;
  result?: unknown;
  isError?: boolean;
  message?: string;
  // approval_request / approval_resolved
  approvalId?: string;
  command?: string;
  approved?: boolean;
}

// Menjalankan perintah menunggu jawaban pengguna. Callback ini yang menahan
// eksekusi sampai jawabannya tiba, sehingga perintah tidak pernah berjalan lebih
// dulu lalu dilaporkan setelahnya.
export type ApprovalAsker = (command: string) => Promise<boolean>;

export interface AgentConfig {
  baseUrl?: string;
  apiKey?: string;
  model?: string;
}

// Default menunjuk ke 9Router lokal: satu endpoint format Anthropic yang
// meneruskan ke langganan Claude Code, Codex, Antigravity, dan lainnya.
const DEFAULT_BASE_URL = "http://localhost:20128/v1";
const DEFAULT_MODEL = "claude-combo";

const MAX_READ_CHARS = 60_000;
const MAX_OUTPUT_CHARS = 20_000;
const COMMAND_TIMEOUT_MS = 120_000;

// Menyaring "../" dari teks path tidak cukup: symlink dan path absolut tetap
// lolos. Yang menentukan adalah hasil resolve-nya, dan untuk berkas yang sudah
// ada, jalur nyatanya setelah symlink diikuti.
async function resolveInsideRoot(root: string, relative: string): Promise<string> {
  const rootReal = await fs.realpath(root);
  const target = path.resolve(rootReal, relative);

  const contains = (base: string, p: string) => p === base || p.startsWith(base + path.sep);
  if (!contains(rootReal, target)) {
    throw new Error(`Path ${relative} berada di luar folder kerja.`);
  }

  // Berkas baru belum punya realpath; yang diperiksa folder induknya.
  try {
    const real = await fs.realpath(target);
    if (!contains(rootReal, real)) throw new Error(`Path ${relative} menunjuk keluar folder kerja lewat symlink.`);
    return real;
  } catch (err: any) {
    if (err?.code !== "ENOENT") throw err;
    const parentReal = await fs.realpath(path.dirname(target));
    if (!contains(rootReal, parentReal)) {
      throw new Error(`Folder tujuan untuk ${relative} berada di luar folder kerja.`);
    }
    return path.join(parentReal, path.basename(target));
  }
}

function runCommand(command: string, cwd: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    // Dijalankan lewat shell karena model menulis perintah utuh dengan pipe dan
    // operator. Itu juga sebabnya tool ini berizin terpisah.
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const args = process.platform === "win32" ? ["-NoProfile", "-Command", command] : ["-c", command];

    execFile(
      shell,
      args,
      { cwd, timeout: COMMAND_TIMEOUT_MS, maxBuffer: 10 * 1024 * 1024, windowsHide: true },
      (err: any, stdout, stderr) => {
        const cut = (s: string) =>
          s.length > MAX_OUTPUT_CHARS ? s.slice(0, MAX_OUTPUT_CHARS) + "\n...[dipangkas]" : s;
        resolve({
          stdout: cut(stdout || ""),
          stderr: cut(stderr || (err?.killed ? `Dihentikan setelah ${COMMAND_TIMEOUT_MS / 1000} detik.` : "")),
          exitCode: typeof err?.code === "number" ? err.code : err ? 1 : 0,
        });
      }
    );
  });
}

const WORKSPACE_TOOLS: Anthropic.Tool[] = [
  {
    name: "list_files",
    description:
      "Daftar isi satu folder di dalam folder kerja. Pakai untuk menemukan berkas sebelum membacanya, jangan menebak nama berkas. TIDAK rekursif: hanya satu tingkat, dan setiap entri ditandai file atau dir — untuk menelusuri lebih dalam, panggil lagi dengan path dir tersebut.",
    input_schema: {
      type: "object",
      properties: {
        dir: { type: "string", description: "Path relatif terhadap folder kerja. Kosongkan untuk akarnya." },
      },
      required: [],
    },
  },
  {
    name: "read_file",
    description:
      "Baca isi satu berkas teks di dalam folder kerja. Hanya untuk berkas teks — berkas biner kembali sebagai karakter rusak. Isi lebih dari 60.000 karakter dipotong dan hasilnya menyertakan truncated: true; kalau itu terjadi, jangan menulis ulang berkas tersebut dari isi yang Anda terima, karena bagian yang terpotong akan hilang.",
    input_schema: {
      type: "object",
      properties: { file: { type: "string", description: "Path relatif terhadap folder kerja." } },
      required: ["file"],
    },
  },
  {
    name: "write_file",
    description:
      "Tulis berkas di dalam folder kerja. Menimpa SELURUH isi kalau berkas sudah ada — tidak ada penyisipan atau penambalan sebagian, jadi baca dulu berkas yang mau diubah dan kirim kembali isi utuhnya. Folder induk yang belum ada dibuatkan sendiri.",
    input_schema: {
      type: "object",
      properties: {
        file: { type: "string", description: "Path relatif terhadap folder kerja." },
        content: { type: "string", description: "Isi berkas seutuhnya setelah perubahan." },
      },
      required: ["file", "content"],
    },
  },
];

// Shell-nya disebutkan di deskripsi karena menentukan sintaks yang sah. Tanpa
// itu model menulis perintah gaya bash di Windows PowerShell, dan "&&" di sana
// bukan sekadar gagal — ia error saat parsing sebelum apa pun dijalankan.
const SHELL_NOTE =
  process.platform === "win32"
    ? "Shell-nya Windows PowerShell 5.1, bukan bash. Operator '&&' dan '||' TIDAK ada dan menyebabkan error parser; pakai ';' untuk berurutan, atau '; if ($?) { ... }' untuk menjalankan hanya bila perintah sebelumnya berhasil. Tidak ada head, tail, which, atau touch — pakai Select-Object -First/-Last, Get-Command, dan New-Item."
    : "Shell-nya /bin/sh.";

const SHELL_TOOL: Anthropic.Tool = {
  name: "run_command",
  description:
    `Jalankan satu perintah shell dengan folder kerja sebagai direktori aktif. Kembalikan stdout, stderr, dan exit code. ${SHELL_NOTE} ` +
    "Perintah yang berjalan lebih dari dua menit dihentikan, dan keluaran di atas 20.000 karakter dipotong. " +
    "Perintah berjalan tanpa pengawasan: tidak ada yang bisa menjawab prompt interaktif, jadi pakai flag non-interaktif. " +
    "Jelaskan lebih dulu perintah yang menghapus atau menimpa sesuatu, dan jangan jalankan kalau pengguna belum memintanya.",
  input_schema: {
    type: "object",
    properties: { command: { type: "string", description: "Perintah lengkap, boleh memakai pipe dan operator." } },
    required: ["command"],
  },
};

const PROJECT_TOOLS: Anthropic.Tool[] = [
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
async function executeTool(
  name: string,
  input: any,
  sessionId: string,
  askApproval: ApprovalAsker
): Promise<unknown> {
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

    // enum di skema tool hanya petunjuk untuk model, bukan aturan yang ditegakkan
    // API. Papan kanban menyaring persis ketiga nilai ini, jadi nilai lain tidak
    // membuat kartunya salah kolom — kartunya lenyap dari papan sama sekali.
    const allowed = ["todo", "in_progress", "done"];
    if (!allowed.includes(input?.status)) {
      return {
        error: `Status "${input?.status}" tidak dikenal. Pakai salah satu dari: ${allowed.join(", ")}.`,
      };
    }
    task.status = input.status;
    session.updatedAt = new Date().toISOString();
    saveSession(session);
    return { ok: true, taskId: task.id, status: task.status };
  }

  // Tool berikut hanya ada kalau pengguna menunjuk folder kerja. Dicek ulang di
  // sini, bukan hanya saat menyusun daftar tool: daftar itu dibangun sekali di
  // awal giliran, sedangkan izinnya bisa dicabut di tengah jalan.
  const root = session.workspaceRoot?.trim();
  if (["list_files", "read_file", "write_file", "run_command"].includes(name)) {
    if (!root) return { error: "Folder kerja belum ditentukan, jadi tool berkas dan perintah tidak tersedia." };
    if (name === "run_command" && !session.allowShell) {
      return { error: "Menjalankan perintah belum diizinkan untuk proyek ini." };
    }
  }

  try {
    if (name === "list_files") {
      const dir = await resolveInsideRoot(root!, String(input?.dir ?? "."));
      const entries = await fs.readdir(dir, { withFileTypes: true });
      return {
        dir: path.relative(root!, dir) || ".",
        entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "dir" : "file" })),
      };
    }

    if (name === "read_file") {
      const file = await resolveInsideRoot(root!, String(input?.file ?? ""));
      const text = await fs.readFile(file, "utf8");
      return {
        file: path.relative(root!, file),
        truncated: text.length > MAX_READ_CHARS,
        content: text.slice(0, MAX_READ_CHARS),
      };
    }

    if (name === "write_file") {
      const file = await resolveInsideRoot(root!, String(input?.file ?? ""));
      await fs.mkdir(path.dirname(file), { recursive: true });
      const content = String(input?.content ?? "");
      await fs.writeFile(file, content, "utf8");
      return { ok: true, file: path.relative(root!, file), bytes: Buffer.byteLength(content, "utf8") };
    }

    if (name === "run_command") {
      const command = String(input?.command ?? "").trim();
      if (!command) return { error: "Perintah kosong." };

      // Persetujuan diminta sebelum apa pun dijalankan. Hasilnya dikembalikan
      // sebagai tool_result biasa, bukan dilempar, supaya model tahu perintahnya
      // ditolak dan bisa menawarkan jalan lain daripada giliran berhenti.
      const approved = await askApproval(command);
      if (!approved) {
        return { error: "Pengguna menolak menjalankan perintah ini.", command, ranAnything: false };
      }

      const rootReal = await fs.realpath(root!);
      const result = await runCommand(command, rootReal);
      return { command, ...result };
    }
  } catch (err: any) {
    return { error: err?.message || String(err) };
  }

  return { error: `Tool ${name} tidak dikenal.` };
}

// Tool yang tidak diizinkan tidak sekadar ditolak saat dipanggil — ia tidak
// pernah ditawarkan, sehingga model tidak menyusun rencana di sekitar kemampuan
// yang tidak ada.
function toolsFor(session: any): Anthropic.Tool[] {
  const tools = [...PROJECT_TOOLS];
  if (session?.workspaceRoot?.trim()) {
    tools.push(...WORKSPACE_TOOLS);
    if (session.allowShell) tools.push(SHELL_TOOL);
  }
  return tools;
}

function systemPromptFor(session: any): string {
  const root = session?.workspaceRoot?.trim();
  if (!root) return SYSTEM_PROMPT;

  return `${SYSTEM_PROMPT}

Folder kerja: ${root}
Semua path pada tool berkas relatif terhadap folder itu, dan tidak ada yang bisa menjangkau ke luarnya.
- Baca berkas sebelum menimpanya. write_file mengganti seluruh isi, jadi menulis tanpa membaca akan menghapus bagian yang tidak Anda sertakan.
- Telusuri dengan list_files daripada menebak nama berkas.${
    session.allowShell
      ? "\n- run_command berjalan di folder itu. Jelaskan lebih dulu perintah yang berdampak merusak, dan jangan menjalankannya kalau pengguna belum memintanya."
      : "\n- Menjalankan perintah tidak diizinkan untuk proyek ini. Jangan menyarankan seolah Anda bisa menjalankannya sendiri."
  }`;
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
  onEvent: (event: AgentEvent) => void,
  askApproval: ApprovalAsker
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

  const session = getSession(sessionId);
  const tools = toolsFor(session);
  const system = systemPromptFor(session);

  const messages: Anthropic.MessageParam[] = [...history, { role: "user", content: userMessage }];

  // Batas putaran. Tanpa ini, model yang terjebak memanggil tool yang sama
  // berulang akan memutar tanpa henti dan menghabiskan kuota diam-diam.
  for (let turn = 0; turn < 12; turn++) {
    // Parameter thinking sengaja tidak dikirim: di belakang router ini bisa ada
    // model apa pun, dan yang tidak mendukungnya menolak permintaan dengan 400.
    const stream = client.messages.stream({
      model: config.model || DEFAULT_MODEL,
      max_tokens: 8000,
      system,
      tools,
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
        result = await executeTool(block.name, block.input, sessionId, askApproval);
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
