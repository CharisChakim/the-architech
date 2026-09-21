import { getSession, saveSession } from "../../../db.ts";
import { resolveRoleOrAgent } from "../../connections/store.ts";
import { generateFollowups } from "../../pipeline/followups.ts";
import { generatePlan } from "../../pipeline/plan.ts";
import { generatePrd } from "../../pipeline/prd.ts";
import { generateTasks } from "../../pipeline/tasks.ts";
import type { Lang } from "../../messages.ts";
import type { ToolContext, ToolSpec } from "../registry.ts";

function sessionOrError(ctx: ToolContext): { session: any } | { error: string } {
  const session = getSession(ctx.sessionId);
  return session
    ? { session }
    : { error: `Sesi ${ctx.sessionId} tidak ditemukan.` };
}

function languageFor(session: any): Lang {
  const language = session?.language || session?.lang || session?.input?.language;
  return language === "id" ? "id" : "en";
}

function saveArtifact(session: any): void {
  session.updatedAt = new Date().toISOString();
  saveSession(session);
}

function titleFor(session: any): string {
  return String(session?.input?.title || session?.title || session?.plan?.suggestedTitle || "Aplikasi Baru");
}

function roleConnection(role: "plan" | "prd" | "tasks"): { conn: any; model: string } | { error: string } {
  const resolved = resolveRoleOrAgent(role);
  return resolved || { error: `Belum ada koneksi LLM aktif untuk tahap ${role}.` };
}

function shortPlanResult(plan: any): Record<string, unknown> {
  return {
    ok: true,
    summary: plan?.summary || "Plan berhasil dibuat.",
    suggestedTitle: plan?.suggestedTitle || null,
    featureCount: Array.isArray(plan?.specs?.coreFeatures) ? plan.specs.coreFeatures.length : 0,
  };
}

function shortPrdResult(prd: any): Record<string, unknown> {
  return {
    ok: true,
    summary: prd?.overview || prd?.executiveSummary || "PRD berhasil dibuat.",
    projectTitle: prd?.projectTitle || null,
    additionalSections: Array.isArray(prd?.additionalSections) ? prd.additionalSections.length : 0,
  };
}

function shortTasksResult(tasks: any[]): Record<string, unknown> {
  return {
    ok: true,
    summary: `${tasks.length} task berhasil dibuat.`,
    taskCount: tasks.length,
    taskIds: tasks.map((task) => task?.id).filter((id): id is string => typeof id === "string"),
  };
}

function answerMap(value: unknown): Record<string, string> {
  const candidate = value && typeof value === "object" && !Array.isArray(value) && "answers" in value
    ? (value as { answers?: unknown }).answers
    : value;

  if (Array.isArray(candidate)) {
    return Object.fromEntries(
      candidate
        .filter((entry) => entry && typeof entry === "object")
        .map((entry: any) => [entry.id, entry.answer ?? entry.value])
        .filter(([id, answer]) => typeof id === "string" && answer !== undefined && answer !== null)
        .map(([id, answer]) => [id, String(answer)]),
    );
  }

  if (!candidate || typeof candidate !== "object") return {};
  return Object.fromEntries(
    Object.entries(candidate)
      .filter(([, answer]) => answer !== undefined && answer !== null)
      .map(([id, answer]) => [id, String(answer)]),
  );
}

const getPlan: ToolSpec = {
  def: {
    name: "get_plan",
    description:
      "Baca Project Plan lengkap: ringkasan, target pengguna, fitur dan sub fitur, prioritas, tech stack, arsitektur, alur data, diagram Mermaid, roadmap, dan estimasi. Gunakan sebelum mengerjakan task agar implementasi mengikuti rencana yang sudah disetujui.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  available: () => true,
  async run(_input: unknown, ctx: ToolContext): Promise<unknown> {
    const found = sessionOrError(ctx);
    if ("error" in found) return found;
    const plan = found.session.plan;
    if (!plan) return { status: "missing", message: "Plan belum dibuat." };

    return {
      summary: plan.summary || "",
      specs: plan.specs || {},
      architectureDraft: plan.architectureDraft || {},
      roadmap: Array.isArray(plan.roadmap) ? plan.roadmap : [],
      estimation: plan.estimation || {},
    };
  },
};

const getPrd: ToolSpec = {
  def: {
    name: "get_prd",
    description:
      "Baca PRD lengkap beserta tujuh poin wajib: overview, requirements, core features per fase, user flow, architecture, database schema, tech stack, dan poin tambahan bila ada. Nilai requirements, database schema, dan tech stack dipertahankan apa adanya, termasuk jika sudah berupa teks hasil suntingan pengguna.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  available: () => true,
  async run(_input: unknown, ctx: ToolContext): Promise<unknown> {
    const found = sessionOrError(ctx);
    if ("error" in found) return found;
    const prd = found.session.prd;
    if (!prd) return { status: "missing", message: "PRD belum dibuat." };

    return {
      projectTitle: prd.projectTitle || titleFor(found.session),
      overview: prd.overview || prd.executiveSummary || "",
      requirements: prd.requirements ?? {
        functional: prd.functionalRequirements || [],
        nonFunctional: prd.nonFunctionalRequirements || [],
      },
      coreFeatures: prd.coreFeatures || {},
      userFlow: prd.userFlow || "",
      architecture: prd.architecture || "",
      databaseSchema: prd.databaseSchema ?? prd.dataSchema ?? [],
      techStack: prd.techStack ?? [],
      additionalSections: Array.isArray(prd.additionalSections) ? prd.additionalSections : [],
    };
  },
};

const getTasks: ToolSpec = {
  def: {
    name: "get_tasks",
    description:
      "Baca seluruh papan task coding. Setiap task memuat id, fase, judul, prioritas, file target, dependensi, instruksi prompt, langkah verifikasi, dan status terkini.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  available: () => true,
  async run(_input: unknown, ctx: ToolContext): Promise<unknown> {
    const found = sessionOrError(ctx);
    if ("error" in found) return found;
    if (!Array.isArray(found.session.tasks)) return { status: "missing", message: "Tasks belum dibuat." };

    return {
      tasks: found.session.tasks.map((task: any) => ({
        id: task.id,
        phase: task.phase,
        title: task.title,
        priority: task.priority,
        targetFiles: task.targetFiles || [],
        dependencies: task.dependencies || [],
        promptInstructions: task.promptInstructions || "",
        verificationSteps: task.verificationSteps || "",
        status: task.status || "todo",
      })),
    };
  },
};

const generatePlanTool: ToolSpec = {
  def: {
    name: "generate_plan",
    description:
      "Buat atau perbarui Project Plan dari input proyek dan jawaban follow-up yang tersimpan. Gunakan role model plan, simpan hasil ke sesi, lalu kembalikan ringkasan singkat.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  available: () => true,
  async run(_input: unknown, ctx: ToolContext): Promise<unknown> {
    const found = sessionOrError(ctx);
    if ("error" in found) return found;
    const session = found.session;
    if (!session.input?.description?.trim()) return { error: "Deskripsi proyek belum diisi." };

    const resolved = roleConnection("plan");
    if ("error" in resolved) return resolved;
    const lockedFeatures = session.planFeaturesEdited && Array.isArray(session.plan?.specs?.coreFeatures)
      ? session.plan.specs.coreFeatures
      : undefined;
    const input = {
      ...session.input,
      answers: session.input.answers ?? session.input.answersToFollowUp ?? {},
    };
    const plan = await generatePlan(
      input,
      resolved.conn,
      resolved.model,
      languageFor(session),
      lockedFeatures,
    );
    session.plan = plan;
    session.planFeaturesEdited = false;
    saveArtifact(session);
    return shortPlanResult(plan);
  },
};

const generatePrdTool: ToolSpec = {
  def: {
    name: "generate_prd",
    description:
      "Buat PRD dari Project Plan yang tersimpan menggunakan model role prd. Simpan hasil ke sesi dan kembalikan ringkasan singkat. Panggil get_plan lebih dulu bila perlu.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  available: () => true,
  async run(_input: unknown, ctx: ToolContext): Promise<unknown> {
    const found = sessionOrError(ctx);
    if ("error" in found) return found;
    const session = found.session;
    if (!session.plan) return { error: "Plan belum dibuat. Buat plan sebelum membuat PRD." };

    const resolved = roleConnection("prd");
    if ("error" in resolved) return resolved;
    const prd = await generatePrd(
      titleFor(session),
      session.plan,
      resolved.conn,
      resolved.model,
      languageFor(session),
    );
    session.prd = prd;
    saveArtifact(session);
    return shortPrdResult(prd);
  },
};

const generateTasksTool: ToolSpec = {
  def: {
    name: "generate_tasks",
    description:
      "Buat task coding atomik dari Project Plan dan PRD yang tersimpan menggunakan model role tasks. Simpan papan task ke sesi dan kembalikan ringkasan singkat.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  available: () => true,
  async run(_input: unknown, ctx: ToolContext): Promise<unknown> {
    const found = sessionOrError(ctx);
    if ("error" in found) return found;
    const session = found.session;
    if (!session.prd) return { error: "PRD belum dibuat. Buat PRD sebelum membuat tasks." };

    const resolved = roleConnection("tasks");
    if ("error" in resolved) return resolved;
    const generated: any = await generateTasks(
      titleFor(session),
      session.plan || {},
      session.prd,
      resolved.conn,
      resolved.model,
      languageFor(session),
    );
    const tasks = Array.isArray(generated) ? generated : generated?.tasks;
    if (!Array.isArray(tasks)) return { error: "Pipeline tasks tidak mengembalikan daftar task yang valid." };

    session.tasks = tasks.map((task: any) => ({ ...task, status: task.status || "todo" }));
    saveArtifact(session);
    return shortTasksResult(session.tasks);
  },
};

const askFollowups: ToolSpec = {
  def: {
    name: "ask_followups",
    description:
      "Ajukan pertanyaan klarifikasi terarah tentang deskripsi proyek. Pertanyaan ditampilkan kepada pengguna melalui kartu interaktif; simpan jawaban pengguna ke input proyek sebelum melanjutkan ke generate_plan.",
    parameters: {
      type: "object",
      properties: {
        round: { type: "integer", description: "Ronde klarifikasi berikutnya, mulai dari 1." },
      },
      required: [],
    },
  },
  available: (session) => Boolean(session?.input?.description?.trim()),
  async run(input: any, ctx: ToolContext): Promise<unknown> {
    const found = sessionOrError(ctx);
    if ("error" in found) return found;
    const session = found.session;
    const description = session.input?.description?.trim();
    if (!description) return { error: "Deskripsi proyek belum diisi." };

    const resolved = roleConnection("plan");
    if ("error" in resolved) return resolved;
    const currentRound = Math.max(
      1,
      Number(input?.round) || Number(session.clarificationRound || 0) + 1,
    );
    const previousAnswers = session.input.answersToFollowUp || {};
    const generated = await generateFollowups(
      {
        ...session.input,
        description,
        answers: previousAnswers,
        previousAnswers,
        round: currentRound,
      },
      resolved.conn,
      resolved.model,
      languageFor(session),
    );
    const questions = (Array.isArray(generated?.questions) ? generated.questions : []).map((question: any) => ({
      ...question,
      round: question.round ?? currentRound,
    }));

    session.followUps = questions;
    session.clarificationRound = currentRound;
    session.clarificationComplete = generated?.needsMoreInfo === false || questions.length === 0;
    session.readinessNote = generated?.readinessNote || "";

    if (questions.length === 0) {
      saveArtifact(session);
      return {
        ok: true,
        needsMoreInfo: false,
        summary: generated?.readinessNote || "Informasi proyek sudah cukup untuk membuat plan.",
        answers: previousAnswers,
      };
    }

    const response = await ctx.elicit({ kind: "questions", questions, round: currentRound });
    const answers = answerMap(response);
    if (Object.keys(answers).length === 0) {
      return {
        ok: false,
        needsMoreInfo: true,
        summary: "Pertanyaan follow-up belum mendapat jawaban.",
        questions,
      };
    }

    session.input.answersToFollowUp = { ...previousAnswers, ...answers };
    saveArtifact(session);
    return {
      ok: true,
      needsMoreInfo: generated?.needsMoreInfo !== false,
      summary: `${Object.keys(answers).length} jawaban follow-up tersimpan.`,
      answers,
      questions,
    };
  },
};

export const pipelineTools: ToolSpec[] = [
  getPlan,
  getPrd,
  getTasks,
  generatePlanTool,
  generatePrdTool,
  generateTasksTool,
  askFollowups,
];
