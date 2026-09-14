import type { ToolContext, ToolSpec } from "../registry.ts";
import { getSession, saveSession } from "../../../db.ts";

// Tool proyek selalu tersedia karena agent perlu dapat membaca dan mengubah
// proyek yang sedang dibuka, terlepas dari izin folder kerja atau shell.
export const projectTools: ToolSpec[] = [
  {
    def: {
      name: "get_project",
      description:
        "Baca kondisi proyek saat ini: ringkasan rencana, daftar fitur beserta sub fitur dan prioritasnya, ada atau tidaknya PRD, dan jumlah task per status. Panggil ini lebih dulu sebelum mengubah apa pun, supaya perubahan didasarkan pada isi yang sebenarnya, bukan tebakan.",
      parameters: { type: "object", properties: {}, required: [] },
    },
    available: () => true,
    async run(_input: unknown, ctx: ToolContext): Promise<unknown> {
      const session = getSession(ctx.sessionId);
      if (!session) return { error: `Sesi ${ctx.sessionId} tidak ditemukan.` };

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
    },
  },
  {
    def: {
      name: "update_features",
      description:
        "Ganti seluruh daftar fitur utama proyek. Kirim daftar lengkap hasil yang diinginkan, bukan hanya yang berubah — isian lama akan digantikan seutuhnya. Pemakaian ini menandai arsitektur, diagram, roadmap, dan estimasi sebagai tidak lagi sinkron, sehingga pengguna diminta menyelaraskan ulang.",
      parameters: {
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
    available: () => true,
    async run(input: any, ctx: ToolContext): Promise<unknown> {
      const session = getSession(ctx.sessionId);
      if (!session) return { error: `Sesi ${ctx.sessionId} tidak ditemukan.` };
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
    },
  },
  {
    def: {
      name: "set_task_status",
      description:
        "Pindahkan satu task di papan kanban ke kolom lain. Pakai id task persis seperti yang dikembalikan get_project.",
      parameters: {
        type: "object",
        properties: {
          taskId: { type: "string", description: "Id task, misal TASK-01." },
          status: { type: "string", enum: ["todo", "in_progress", "done"] },
        },
        required: ["taskId", "status"],
      },
    },
    available: () => true,
    async run(input: any, ctx: ToolContext): Promise<unknown> {
      const session = getSession(ctx.sessionId);
      if (!session) return { error: `Sesi ${ctx.sessionId} tidak ditemukan.` };
      const tasks = session.tasks || [];
      const task = tasks.find((t: any) => t.id === input?.taskId);
      if (!task) return { error: `Task ${input?.taskId} tidak ada. Panggil get_project untuk melihat id yang tersedia.` };

      // Enum di skema tool hanya petunjuk untuk model, bukan aturan yang ditegakkan
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
    },
  },
];
