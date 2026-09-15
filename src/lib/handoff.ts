import type { AgentTask, ProjectSession, PRDData } from "../types";

/** Handoff artifacts describe work for another tool; they are not completion evidence. */
export const HANDOFF_SCHEMA_VERSION = "v2-4" as const;
export const HANDOFF_STATE = "handed_off" as const;
export const HANDOFF_STATE_LABEL = "Diserahkan" as const;

export interface HandoffTask {
  id: string;
  title: string;
  phase: string;
  priority: AgentTask["priority"];
  state: typeof HANDOFF_STATE;
  stateLabel: typeof HANDOFF_STATE_LABEL;
  handedOffAt: string | null;
  scope: {
    targetFiles: string[];
    promptInstructions: string;
  };
  dependencies: string[];
  acceptanceCriteria: string;
  verificationSteps: string;
}

export interface HandoffPackage {
  schemaVersion: typeof HANDOFF_SCHEMA_VERSION;
  exportedAt: string;
  state: typeof HANDOFF_STATE;
  stateLabel: typeof HANDOFF_STATE_LABEL;
  project: {
    id: string;
    title: string;
    description: string;
  };
  prd: {
    version: string | number | null;
    id: string | null;
    contentHash: string | null;
    projectTitle: string;
    markdown: string;
  } | null;
  task: HandoffTask | null;
  tasks: HandoffTask[];
  workspace: {
    root: string | null;
    shellCommandsAllowed: boolean;
    instructions: string[];
  };
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/-----BEGIN [^-\r\n]*PRIVATE KEY-----[\s\S]*?-----END [^-\r\n]*PRIVATE KEY-----/gi, "[REDACTED PRIVATE KEY]")
    .replace(/((?:authorization|proxy-authorization)\s*:\s*(?:bearer|basic)\s+)[^\s,;]+/gi, "$1[REDACTED]")
    .replace(/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, "[REDACTED AWS KEY]")
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, "[REDACTED JWT]")
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/]+:)[^@\s/]+(@)/gi, "$1[REDACTED]$2")
    .replace(/\b(sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{20,})\b/g, "[REDACTED]")
    .replace(/(api[_-]?key|access[_-]?token|refresh[_-]?token|auth(?:orization)?|client[_-]?secret|password|secret)\s*[:=]\s*["']?[^\r\n"',;]+/gi, "$1: [REDACTED]");
}

function safeText(value: unknown): string {
  return typeof value === "string" ? redactSensitiveText(value) : "";
}

function safeTargetFiles(files: readonly string[] | undefined): string[] {
  return (files || []).filter((file) => {
    const base = file.trim().split(/[\\/]/).pop()?.toLowerCase() || "";
    return Boolean(file.trim()) && !base.startsWith(".env") && !/(credential|password|secret|token)/i.test(base);
  });
}

function prdVersion(prd: PRDData | undefined): string | number | null {
  if (!prd) return null;
  const candidate = (prd as PRDData & { version?: unknown; revision?: unknown; prdVersion?: unknown });
  const value = candidate.version ?? candidate.revision ?? candidate.prdVersion;
  return typeof value === "string" || typeof value === "number" ? value : null;
}

function toHandoffTask(task: AgentTask): HandoffTask {
  const verification = safeText(task.verificationSteps);
  return {
    id: safeText(task.id),
    title: safeText(task.title),
    phase: safeText(task.phase || "Development"),
    priority: task.priority,
    state: HANDOFF_STATE,
    stateLabel: HANDOFF_STATE_LABEL,
    handedOffAt: safeText(task.handedOffAt) || null,
    scope: {
      targetFiles: safeTargetFiles(task.targetFiles),
      promptInstructions: safeText(task.promptInstructions),
    },
    dependencies: (task.dependencies || []).map(safeText).filter(Boolean),
    acceptanceCriteria: safeText(task.acceptanceCriteria) || verification,
    verificationSteps: verification,
  };
}

/**
 * Build a portable package without copying llmConfig, connection settings, or
 * any local-only session fields. Passing a task narrows the package to that task.
 */
export function buildHandoffPackage(session: ProjectSession, task?: AgentTask | null): HandoffPackage {
  const projectTitle = safeText(session.input.title || session.title || "Project");
  const tasks = (task ? [task] : session.tasks || []).map(toHandoffTask);
  const currentVersion = session.prdVersions?.find((version) => version.status === "active") || session.prdVersions?.[session.prdVersions.length - 1];
  const prd = session.prd
    ? {
        version: prdVersion(session.prd) ?? currentVersion?.number ?? null,
        id: safeText(session.prd.artifactVersionId || currentVersion?.id) || null,
        contentHash: safeText(session.prd.artifactContentHash || currentVersion?.contentHash) || null,
        projectTitle: safeText(session.prd.projectTitle || projectTitle),
        markdown: safeText(session.prd.fullMarkdownText || currentVersion?.content),
      }
    : currentVersion
      ? {
          version: currentVersion.number,
          id: safeText(currentVersion.id) || null,
          contentHash: safeText(currentVersion.contentHash) || null,
          projectTitle,
          markdown: safeText(currentVersion.content),
        }
      : null;

  return {
    schemaVersion: HANDOFF_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    state: HANDOFF_STATE,
    stateLabel: HANDOFF_STATE_LABEL,
    project: {
      id: safeText(session.id),
      title: projectTitle,
      description: safeText(session.input.description),
    },
    prd,
    task: task ? tasks[0] || null : null,
    tasks,
    workspace: {
      root: safeText(session.workspaceRoot) || null,
      shellCommandsAllowed: Boolean(session.allowShell && session.workspaceRoot),
      instructions: [
        "Work only inside the selected workspace root and the target files listed for the task.",
        "Read target files before editing and preserve unrelated user changes.",
        "Run the verification steps before reporting the handoff as complete.",
        "Credentials and files outside the selected scope are intentionally excluded from this package.",
      ],
    },
  };
}

export function buildHandoffJson(session: ProjectSession, task?: AgentTask | null): string {
  return JSON.stringify(buildHandoffPackage(session, task), null, 2);
}

export function buildHandoffMarkdown(session: ProjectSession, task?: AgentTask | null): string {
  const handoff = buildHandoffPackage(session, task);
  const lines = [
    `# Handoff: ${handoff.project.title}`,
    "",
    `- **State**: ${handoff.state} (${handoff.stateLabel})`,
    `- **Package schema**: ${handoff.schemaVersion}`,
    `- **Exported at**: ${handoff.exportedAt}`,
    `- **Workspace**: ${handoff.workspace.root || "Not selected"}`,
    "",
    "## Project scope",
    handoff.project.description || "No project description was provided.",
    "",
    "## PRD",
    handoff.prd
      ? `Version: ${handoff.prd.version ?? "unversioned"}\n\n${handoff.prd.markdown || "No PRD text was saved."}`
      : "No PRD is available.",
    "",
    "## Workspace instructions",
    ...handoff.workspace.instructions.map((instruction) => `- ${instruction}`),
    "",
  ];

  if (!handoff.tasks.length) {
    lines.push("## Tasks", "No task was selected or saved.", "");
  } else {
    lines.push("## Tasks", "");
    for (const task of handoff.tasks) {
      lines.push(
        `### [${task.id}] ${task.title}`,
        `- **State**: ${task.state} (${task.stateLabel})`,
        ...(task.handedOffAt ? [`- **Handed off at**: ${task.handedOffAt}`] : []),
        `- **Phase**: ${task.phase}`,
        `- **Priority**: ${task.priority}`,
        `- **Target files**: ${task.scope.targetFiles.length ? task.scope.targetFiles.map((file) => `\`${file}\``).join(", ") : "None"}`,
        `- **Dependencies**: ${task.dependencies.length ? task.dependencies.join(", ") : "None"}`,
        "",
        "#### Instructions",
        task.scope.promptInstructions || "No task instructions were provided.",
        "",
        "#### Acceptance and verification",
        task.acceptanceCriteria || "No verification steps were provided.",
        "",
      );
    }
  }

  return lines.join("\n");
}

function filenameSlug(session: ProjectSession): string {
  return (session.input.title || session.title || "project").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "project";
}

export function handoffJsonFilename(session: ProjectSession, task?: AgentTask | null): string {
  return `HANDOFF_${filenameSlug(session)}${task ? `_${task.id.toLowerCase()}` : ""}.json`;
}

export function handoffMarkdownFilename(session: ProjectSession, task?: AgentTask | null): string {
  return `HANDOFF_${filenameSlug(session)}${task ? `_${task.id.toLowerCase()}` : ""}.md`;
}
