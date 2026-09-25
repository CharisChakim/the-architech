import { getSession } from "../../db.ts";
import type { ToolDef } from "../llm/types.ts";
import { resolveInsideRoot } from "./sandbox.ts";
import { fsTools } from "./tools/fs.ts";
import { pipelineTools } from "./tools/pipeline.ts";
import { projectTools } from "./tools/project.ts";
import { shellTools } from "./tools/shell.ts";
import { mcpToolsFor, type McpStatus } from "../mcp/registry.ts";

export interface AgentLimits {
  maxTurns: number;
  maxTokens: number;
  maxReadChars: number;
  maxOutputChars: number;
  commandTimeoutMs: number;
}

export const DEFAULT_LIMITS: AgentLimits = {
  maxTurns: 12,
  maxTokens: 8000,
  maxReadChars: 60_000,
  maxOutputChars: 20_000,
  commandTimeoutMs: 120_000,
};

export interface FollowUpQuestion {
  id: string;
  category: string;
  question: string;
  explanation: string;
  suggestedAnswer: string;
  options?: string[];
  round?: number;
}

export type ElicitRequest =
  | { kind: "approval"; command: string; cwd?: string; action?: "edit" | "command" }
  | { kind: "questions"; questions: FollowUpQuestion[]; round: number };

export type Elicit = (req: ElicitRequest) => Promise<unknown>;

export interface ToolContext {
  sessionId: string | null;
  session: any | null;
  root?: string;
  limits: AgentLimits;
  elicit: Elicit;
  signal: AbortSignal;
}

export interface ToolSpec {
  def: ToolDef;
  available(session: any): boolean;
  run(input: any, ctx: ToolContext): Promise<unknown>;
}

const BUILTIN_TOOLS: ToolSpec[] = [...projectTools, ...fsTools, ...shellTools, ...pipelineTools];
const PROJECT_SCOPED_TOOLS = new Set<ToolSpec>([...projectTools, ...pipelineTools]);

function hasProjectSession(session: any): boolean {
  // A transient standalone context deliberately has no id. Persisted project
  // sessions loaded from SQLite always carry their id in the payload.
  return typeof session?.id === "string" && session.id.trim().length > 0;
}

function availableForContext(spec: ToolSpec, session: any | null): boolean {
  if (!session || (PROJECT_SCOPED_TOOLS.has(spec) && !hasProjectSession(session))) return false;
  try {
    return spec.available(session);
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function unavailableResult(name: string, session: any): { error: string } {
  if (PROJECT_SCOPED_TOOLS_BY_NAME.has(name) && !hasProjectSession(session)) {
    return { error: "Tool proyek belum tersedia. Tautkan percakapan ke proyek terlebih dahulu." };
  }
  if (["list_files", "read_file", "write_file", "run_command"].includes(name)) {
    if (!session?.workspaceRoot?.trim()) {
      return { error: "Folder kerja belum ditentukan, jadi tool berkas dan perintah tidak tersedia." };
    }
    if (name === "run_command" && !session.allowShell) {
      return { error: "Menjalankan perintah belum diizinkan untuk proyek ini." };
    }
  }
  return { error: `Tool ${name} tidak tersedia untuk sesi ini.` };
}

const PROJECT_SCOPED_TOOLS_BY_NAME = new Set(
  [...projectTools, ...pipelineTools].map((spec) => spec.def.name),
);

export function toolsFor(session: any, extra: ToolSpec[] = []): ToolSpec[] {
  return [...BUILTIN_TOOLS, ...extra].filter((spec) => {
    return availableForContext(spec, session);
  });
}

export async function toolsForTurn(
  session: any,
  signal: AbortSignal,
  onMcpStatus?: (status: McpStatus) => void,
): Promise<ToolSpec[]> {
  const builtins = toolsFor(session);
  const reserved = new Set(builtins.map((spec) => spec.def.name));
  const mcp = await mcpToolsFor(signal, reserved, onMcpStatus);
  return [...builtins, ...mcp];
}

export async function dispatch(
  name: string,
  input: unknown,
  ctx: ToolContext,
  specs: ToolSpec[],
): Promise<unknown> {
  if (ctx.signal.aborted) return { error: "Permintaan dibatalkan." };

  const spec = specs.find((candidate) => candidate.def.name === name);
  if (!spec) return { error: `Tool ${name} tidak dikenal.` };

  try {
    // Daftar tool dibuat di awal giliran, tetapi izin sesi dapat berubah sebelum
    // tool berikutnya dipanggil; karena itu sesi dan gating dibaca ulang di sini.
    const session = ctx.sessionId ? getSession(ctx.sessionId) : ctx.session;
    if (!session) {
      return { error: ctx.sessionId ? `Sesi ${ctx.sessionId} tidak ditemukan.` : "Konteks percakapan tidak tersedia." };
    }
    if (!availableForContext(spec, session)) return unavailableResult(name, session);

    let root: string | undefined;
    const configuredRoot = session.workspaceRoot?.trim();
    if (configuredRoot) {
      // Root hanya menjadi konteks tool berkas; path kerja yang sudah tidak
      // valid tidak boleh ikut mematikan tool proyek yang selalu tersedia.
      try {
        root = await resolveInsideRoot(configuredRoot, ".");
      } catch {
        root = undefined;
      }
    }

    const freshContext: ToolContext = { ...ctx, session, root };
    return await spec.run(input, freshContext);
  } catch (error) {
    // Kegagalan satu tool adalah data untuk model, bukan alasan menghilangkan
    // seluruh giliran atau membuat endpoint agent menjadi 500.
    return { error: errorMessage(error) };
  }
}
