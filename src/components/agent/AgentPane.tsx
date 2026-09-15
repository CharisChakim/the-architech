import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronDown, Circle, Clock3, Folder, PlugZap } from "lucide-react";
import type { ProjectSession, RuntimeDiscoveryReport, RuntimePreference } from "../../types";
import type { RuntimeChatSelection } from "../../lib/runtimeChat";
import type { Entry } from "../../lib/agentEvents";
import { projectNameFromWorkspaceRoot } from "../../lib/workspace";
import { useT } from "../../lib/i18n";
import { Markdown } from "../lazy";
import { ApprovalCard } from "./ApprovalCard";
import { Composer, type ComposerMode } from "./Composer";
import { QuestionsCard } from "./QuestionsCard";
import { ToolCallCard } from "./ToolCallCard";
import { RuntimeControls } from "./RuntimeControls";

export type PipelineStep = 1 | 2 | 3;

export interface AgentPaneProps {
  sessionId: string;
  workspaceRoot: string;
  allowShell: boolean;
  onChangeWorkspace: (patch: Pick<ProjectSession, "workspaceRoot" | "allowShell">) => void;
  onWorkspaceSelected: (workspaceRoot: string) => void | Promise<void>;
  entries: Entry[];
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void | Promise<void | boolean>;
  onRetry: () => void | Promise<void>;
  onDecideApproval: (elicitId: string, ok: boolean) => void | Promise<void>;
  onRespondQuestions: (elicitId: string, answers: Record<string, string>) => void | Promise<void>;
  onStop: () => void;
  onNavigatePipeline?: (step: PipelineStep) => void;
  hasPlan: boolean;
  onPreparePlan?: (idea: string) => void | Promise<void>;
  runtimeSelection: RuntimeChatSelection;
  runtimeReport: RuntimeDiscoveryReport | null;
  runtimePreferences: RuntimePreference[];
  runtimeLoading?: boolean;
  onRuntimeSelectionChange: (selection: RuntimeChatSelection) => void;
  onOpenConnections?: () => void;
}

const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

const folderName = (root: string, emptyLabel: string): string =>
  projectNameFromWorkspaceRoot(root) || emptyLabel;

export const AgentPane: React.FC<AgentPaneProps> = ({
  sessionId,
  workspaceRoot,
  allowShell,
  onChangeWorkspace,
  onWorkspaceSelected,
  entries,
  busy,
  error,
  onSend,
  onRetry,
  onDecideApproval,
  onRespondQuestions,
  onStop,
  onNavigatePipeline,
  hasPlan,
  onPreparePlan,
  runtimeSelection,
  runtimeReport,
  runtimePreferences,
  runtimeLoading,
  onRuntimeSelectionChange,
  onOpenConnections,
}) => {
  const { t } = useT();
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderPickerBusy, setFolderPickerBusy] = useState(false);
  const [folderPickerUnavailable, setFolderPickerUnavailable] = useState(false);
  const [folderPickerError, setFolderPickerError] = useState<string | null>(null);
  const [preparingIntake, setPreparingIntake] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [composerMode, setComposerMode] = useState<ComposerMode>("agent");
  const transcript = useRef<HTMLDivElement>(null);
  const folderPopover = useRef<HTMLDivElement>(null);
  const folderButton = useRef<HTMLButtonElement>(null);
  const workspaceInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [entries, busy]);

  useEffect(() => {
    if (!folderOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (folderOpen && !folderPopover.current?.contains(event.target as Node)) setFolderOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (folderOpen) {
        event.preventDefault();
        setFolderOpen(false);
        folderButton.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [folderOpen]);

  useEffect(() => {
    setComposerMode("agent");
    setIntakeError(null);
  }, [sessionId]);

  useEffect(() => {
    if (folderOpen) workspaceInput.current?.focus();
  }, [folderOpen]);

  const chooseFolder = async (): Promise<void> => {
    if (folderPickerBusy) return;
    setFolderPickerBusy(true);
    setFolderPickerError(null);
    try {
      const response = await fetch("/api/agent/folder-picker", {
        method: "POST",
        headers: { Accept: "application/json" },
      });
      const payload = await response.json().catch(() => null) as { path?: unknown; error?: unknown } | null;
      if (response.status === 204) return;
      if (response.status === 501 || response.status === 404) {
        setFolderPickerUnavailable(true);
        setFolderOpen(true);
        return;
      }
      if (!response.ok) {
        setFolderPickerError(typeof payload?.error === "string" ? payload.error : t("Could not choose a folder."));
        setFolderOpen(true);
        return;
      }
      const selectedPath = typeof payload?.path === "string" ? payload.path.trim() : "";
      if (!selectedPath) throw new Error(t("Could not choose a folder."));
      setFolderPickerUnavailable(false);
      await onWorkspaceSelected(selectedPath);
      setFolderOpen(false);
    } catch (error) {
      setFolderPickerUnavailable(true);
      setFolderPickerError(error instanceof Error ? error.message : t("Could not choose a folder."));
      setFolderOpen(true);
    } finally {
      setFolderPickerBusy(false);
    }
  };

  const toggleFolderControl = (): void => {
    if (!folderOpen && !workspaceRoot.trim()) {
      void chooseFolder();
      return;
    }
    setFolderOpen((open) => !open);
  };

  const sendFromComposer = async (text: string): Promise<void | boolean> => {
    const idea = text.trim();
    if (!idea || busy || preparingIntake) return;

    setIntakeError(null);
    setPreparingIntake(true);
    try {
      if (composerMode === "plan" || composerMode === "prd") await onPreparePlan?.(idea);
      if (composerMode === "prd") {
        onNavigatePipeline?.(2);
        return true;
      }
      const prompt = composerMode === "plan"
        ? `${t("Plan this project first. Call ask_followups before generating the plan.")}\n\n${idea}`
        : idea;
      return await onSend(prompt);
    } catch {
      setIntakeError(t("Could not save the project idea."));
      return false;
    } finally {
      setPreparingIntake(false);
    }
  };

  const handleModeChange = (mode: ComposerMode): void => {
    setComposerMode(mode);
    if (mode === "prd") onNavigatePipeline?.(2);
  };

  const renderEntry = (entry: Entry): React.ReactNode => {
    switch (entry.kind) {
      case "user":
        return <div key={entry.id} className="ml-6 rounded-xl bg-subtle px-3 py-2 text-ink whitespace-pre-wrap">{entry.text}</div>;
      case "assistant":
        return (
          <div key={entry.id} className="text-ink leading-relaxed">
            <Markdown>{entry.text}</Markdown>
            {entry.streaming && <span className="ml-1 inline-block h-3 w-1 animate-pulse rounded bg-accent" />}
          </div>
        );
      case "tool":
        return <ToolCallCard key={entry.id} entry={entry} onNavigatePipeline={onNavigatePipeline} />;
      case "approval":
        return <ApprovalCard key={entry.id} entry={entry} onRespond={onDecideApproval} />;
      case "questions":
        return <QuestionsCard key={entry.id} entry={entry} onRespond={onRespondQuestions} />;
      case "mcp_status":
        return (
          <div key={entry.id} className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn-ink">
            <PlugZap className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 flex-1">MCP {entry.server}: {entry.message} · {t("{count} tools", { count: entry.tools })}</span>
          </div>
        );
      case "turn_end":
        return (
          <div key={entry.id} className="flex items-center gap-2 px-1 text-[11px] text-faint">
            <Check className="h-3.5 w-3.5 text-ok" />
            <span>{t("Turn complete")}</span><span>·</span>
            <span>{t("{count} tools", { count: entry.toolCount })}</span><span>·</span>
            <Clock3 className="h-3 w-3" /><span>{formatDuration(entry.ms)}</span>
          </div>
        );
      case "error":
        return (
          <div key={entry.id} className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger-ink">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 whitespace-pre-wrap">{entry.message}</span>
              {entry.retryable && <button type="button" onClick={() => void onRetry()} disabled={busy} className="shrink-0 font-medium hover:underline disabled:opacity-50">{t("Try again")}</button>}
            </div>
          </div>
        );
    }
  };

  const folderControl = (
    <div className="relative" ref={folderPopover}>
      {folderOpen && (
        <div id="agent-workspace-popover" role="dialog" aria-label={t("Working folder")} className="absolute bottom-full left-0 z-30 mb-2 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-3 shadow-lg">
          <button type="button" onClick={() => void chooseFolder()} disabled={folderPickerBusy} className="btn-outline flex w-full items-center justify-center gap-1.5 text-xs">
            <Folder className={`h-3.5 w-3.5 ${folderPickerBusy ? "animate-pulse" : ""}`} aria-hidden />
            {folderPickerBusy ? t("Opening folder picker...") : t("Choose folder")}
          </button>
          {folderPickerUnavailable && (
            <>
              <label className="field-label mt-3" htmlFor="agent-workspace-root">{t("Working folder")}</label>
              <input
                ref={workspaceInput}
                id="agent-workspace-root"
                type="text"
                value={workspaceRoot}
                onChange={(event) => { setFolderPickerError(null); onChangeWorkspace({ workspaceRoot: event.target.value }); }}
                onBlur={(event) => { if (event.currentTarget.value.trim()) void onWorkspaceSelected(event.currentTarget.value); }}
                placeholder={t("Empty — no file access")}
                spellCheck={false}
                className="field font-mono text-xs"
              />
              <p className="mt-2 text-[11px] leading-relaxed text-faint">{t("Native folder picker unavailable. Enter an absolute path manually. Browser folder handles do not expose a server-usable path.")}</p>
            </>
          )}
          {folderPickerError && <p className="mt-2 text-xs text-danger-ink" role="alert">{folderPickerError}</p>}
          <label className={`mt-3 flex items-start gap-2 text-xs ${workspaceRoot.trim() ? "text-muted" : "text-faint"}`}>
            <input type="checkbox" checked={allowShell} disabled={!workspaceRoot.trim()} onChange={(event) => onChangeWorkspace({ allowShell: event.target.checked })} className="mt-0.5 shrink-0" />
            <span>{t("Allow shell commands")}{allowShell && <span className="mt-0.5 block text-warn-ink">{t("The model can run any command in that folder.")}</span>}</span>
          </label>
        </div>
      )}
      <button
        ref={folderButton}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={folderOpen}
        aria-controls="agent-workspace-popover"
        onClick={toggleFolderControl}
        disabled={folderPickerBusy || busy}
        title={workspaceRoot || t("Choose folder")}
        className="inline-flex h-8 min-w-0 max-w-48 items-center gap-1.5 rounded-lg border border-line bg-canvas px-2 text-[11px] text-muted hover:border-strong hover:text-ink disabled:cursor-wait disabled:opacity-70"
      >
        <Folder className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden />
        <span className="truncate">{folderName(workspaceRoot, t("Choose folder"))}</span>
        {allowShell && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" title={t("Shell enabled")} aria-label={t("Shell enabled")} />}
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      </button>
    </div>
  );

  const runtimeControl = (
    <RuntimeControls
      sessionId={sessionId}
      selection={runtimeSelection}
      report={runtimeReport}
      preferences={runtimePreferences}
      loading={runtimeLoading}
      onChange={onRuntimeSelectionChange}
      onOpenConnections={onOpenConnections}
      disabled={busy || preparingIntake}
    />
  );

  const composer = (variant: "default" | "hero") => (
    <Composer
      sessionId={sessionId}
      send={sendFromComposer}
      busy={busy}
      disabled={preparingIntake}
      stop={onStop}
      retry={error ? onRetry : undefined}
      mode={composerMode}
      onModeChange={handleModeChange}
      controls={folderControl}
      secondaryControls={runtimeControl}
      variant={variant}
      placeholder={composerMode === "plan"
        ? t("Describe what you want the agent to plan...")
        : composerMode === "prd"
          ? t("Describe the product to build its PRD...")
          : t("Ask the agent to build or change something...")}
    />
  );

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-surface" aria-label={t("Agent")}>
      <div ref={transcript} role="log" aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {entries.length === 0 && !hasPlan && (
          <div className="mx-auto flex h-full min-h-64 max-w-xl flex-col justify-center px-2 py-8">
            <Bot className="mb-3 h-8 w-8 text-accent" />
            <h2 className="text-lg font-semibold text-ink">{t("What should we build?")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t("Start with a project idea, or tell the agent what to change.")}</p>
            {intakeError && <p className="mt-2 text-xs text-danger-ink" role="alert">{intakeError}</p>}
            {composer("hero")}
          </div>
        )}
        {entries.length === 0 && hasPlan && (
          <div className="flex h-full min-h-48 flex-col items-center justify-center px-4 text-center">
            <Bot className="mb-3 h-7 w-7 text-accent" />
            <p className="text-sm font-medium text-ink">{t("What should we build?")}</p>
            <p className="mt-1 max-w-xs text-xs leading-relaxed text-faint">{t("Ask for a change to this project — the agent can read it and edit the project directly.")}</p>
          </div>
        )}
        <div className="space-y-3">{entries.map(renderEntry)}</div>
        {busy && <div className="mt-3 flex items-center gap-2 px-1 text-xs text-muted" aria-live="polite"><Circle className="h-2.5 w-2.5 animate-pulse fill-accent text-accent" />{t("Working...")}</div>}
        {error && !entries.some((entry) => entry.kind === "error" && entry.message === error) && (
          <div className="mt-3 rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-xs text-danger-ink">
            <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /><span className="min-w-0 flex-1 whitespace-pre-wrap">{error}</span><button type="button" onClick={() => void onRetry()} disabled={busy || !entries.some((entry) => entry.kind === "user")} className="shrink-0 font-medium hover:underline disabled:opacity-50">{t("Try again")}</button></div>
          </div>
        )}
      </div>

      {(entries.length > 0 || hasPlan) && <div className="shrink-0">{composer("default")}</div>}
    </aside>
  );
};

export default AgentPane;
