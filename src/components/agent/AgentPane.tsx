import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronDown, Circle, Clock3, Folder, PlugZap } from "lucide-react";
import type { ProjectSession, RuntimeDiscoveryReport, RuntimePreference } from "../../types";
import type { RuntimeChatSelection } from "../../lib/runtimeChat";
import { SAMPLE_PROJECTS, sampleText, type SampleProject } from "../../lib/sampleData";
import type { Entry } from "../../lib/agentEvents";
import { useDraft } from "../../lib/draftStore";
import { useT } from "../../lib/i18n";
import { Markdown } from "../lazy";
import { ApprovalCard } from "./ApprovalCard";
import { Composer } from "./Composer";
import { QuestionsCard } from "./QuestionsCard";
import { ToolCallCard } from "./ToolCallCard";
import { RuntimeControls } from "./RuntimeControls";

export type PipelineStep = 1 | 2 | 3;

export interface AgentPaneProps {
  sessionId: string;
  workspaceRoot: string;
  allowShell: boolean;
  onChangeWorkspace: (patch: Pick<ProjectSession, "workspaceRoot" | "allowShell">) => void;
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
  onSelectSample: (sample: SampleProject) => void;
  onPreparePlan?: (idea: string) => void | Promise<void>;
  runtimeSelection: RuntimeChatSelection;
  runtimeReport: RuntimeDiscoveryReport | null;
  runtimePreferences: RuntimePreference[];
  runtimeLoading?: boolean;
  onRuntimeSelectionChange: (selection: RuntimeChatSelection) => void;
  onOpenConnections?: () => void;
}

const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

const folderName = (root: string, emptyLabel: string): string => {
  const value = root.trim();
  return value ? value.replace(/^\/home\/[^/]+/, "~") : emptyLabel;
};

export const AgentPane: React.FC<AgentPaneProps> = ({
  sessionId,
  workspaceRoot,
  allowShell,
  onChangeWorkspace,
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
  onSelectSample,
  onPreparePlan,
  runtimeSelection,
  runtimeReport,
  runtimePreferences,
  runtimeLoading,
  onRuntimeSelectionChange,
  onOpenConnections,
}) => {
  const { t, lang } = useT();
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderPickerBusy, setFolderPickerBusy] = useState(false);
  const [folderPickerUnavailable, setFolderPickerUnavailable] = useState(false);
  const [folderPickerError, setFolderPickerError] = useState<string | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [intakeDraft, setIntakeDraft, clearIntakeDraft] = useDraft(
    { sessionId, name: "agent-intake" },
    "",
  );
  const [preparingIntake, setPreparingIntake] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const transcript = useRef<HTMLDivElement>(null);
  const folderPopover = useRef<HTMLDivElement>(null);
  const folderButton = useRef<HTMLButtonElement>(null);
  const workspaceInput = useRef<HTMLInputElement>(null);
  const templateButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [entries, busy]);

  useEffect(() => {
    if (!folderOpen && !templateOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (folderOpen && !folderPopover.current?.contains(event.target as Node)) setFolderOpen(false);
      const target = event.target as Element | null;
      if (templateOpen && !templateButton.current?.contains(target) && !target?.closest("#sample-project-menu")) setTemplateOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (templateOpen) {
        event.preventDefault();
        setTemplateOpen(false);
        templateButton.current?.focus();
      } else if (folderOpen) {
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
  }, [folderOpen, templateOpen]);

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
      onChangeWorkspace({ workspaceRoot: selectedPath });
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

  const submitIntake = async (planFirst: boolean): Promise<void> => {
    const idea = intakeDraft.trim();
    if (!idea || busy || preparingIntake) return;

    setIntakeError(null);
    setPreparingIntake(true);
    try {
      if (planFirst) await onPreparePlan?.(idea);
      const prompt = planFirst
        ? `${t("Plan this project first. Call ask_followups before generating the plan.")}\n\n${idea}`
        : idea;
      const result = await onSend(prompt);
      if (result !== false) clearIntakeDraft("");
    } catch {
      setIntakeError(t("Could not save the project idea."));
    } finally {
      setPreparingIntake(false);
    }
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

  return (
    <aside className="flex h-full min-h-0 min-w-0 flex-col bg-surface" aria-label={t("Agent")}>
      <div ref={transcript} role="log" aria-live="polite" aria-relevant="additions text" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {entries.length === 0 && !hasPlan && (
          <div className="mx-auto flex h-full min-h-64 max-w-xl flex-col justify-center px-2 py-8">
            <Bot className="mb-3 h-8 w-8 text-accent" />
            <h2 className="text-lg font-semibold text-ink">{t("What should we build?")}</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">{t("Start with a project idea, or tell the agent what to change.")}</p>
            <textarea
              rows={6}
              value={intakeDraft}
              onChange={(event) => setIntakeDraft(event.target.value)}
              placeholder={t("Describe the product, problem, or feature you have in mind...")}
              aria-label={t("Describe the product, problem, or feature you have in mind...")}
              className="field mt-5 min-h-36 resize-y leading-relaxed"
            />
            {intakeError && <p className="mt-2 text-xs text-danger-ink" role="alert">{intakeError}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!intakeDraft.trim() || busy || preparingIntake}
                onClick={() => void submitIntake(true)}
                className="btn-primary"
              >
                {t("Plan this first")}
              </button>
              <button
                type="button"
                disabled={!intakeDraft.trim() || busy || preparingIntake}
                onClick={() => void submitIntake(false)}
                className="btn-outline"
              >
                {t("Code directly")}
              </button>
              <div className="relative">
                <button
                  ref={templateButton}
                  type="button"
                  disabled={busy || preparingIntake}
                  aria-haspopup="menu"
                  aria-expanded={templateOpen}
                  aria-controls="sample-project-menu"
                  onClick={() => setTemplateOpen((open) => !open)}
                  className="btn-outline"
                >
                  {t("Open a template")}
                </button>
                {templateOpen && <div id="sample-project-menu" role="menu" aria-label={t("Sample project templates")} className="absolute bottom-full left-0 z-10 mb-2 w-[min(16rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-2 shadow-lg">
                  {SAMPLE_PROJECTS.map((sample) => (
                    <button
                      key={sample.id}
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        clearIntakeDraft("");
                        setTemplateOpen(false);
                        onSelectSample(sample);
                      }}
                      className="block w-full rounded-lg px-3 py-2 text-left text-xs text-ink hover:bg-subtle"
                    >
                      {sampleText(sample, lang).name}
                    </button>
                  ))}
                </div>}
              </div>
            </div>
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

      <div className="relative shrink-0" ref={folderPopover}>
        {folderOpen && (
          <div id="agent-workspace-popover" role="dialog" aria-label={t("Working folder")} className="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-xl border border-line bg-surface p-3 shadow-lg">
            <button type="button" onClick={() => void chooseFolder()} disabled={folderPickerBusy} className="btn-outline flex w-full items-center justify-center gap-1.5 text-xs">
              <Folder className={`h-3.5 w-3.5 ${folderPickerBusy ? "animate-pulse" : ""}`} aria-hidden />
              {folderPickerBusy ? t("Opening folder picker...") : t("Choose folder")}
            </button>
            {folderPickerUnavailable && (
              <>
                <label className="field-label mt-3" htmlFor="agent-workspace-root">{t("Working folder")}</label>
                <input ref={workspaceInput} id="agent-workspace-root" type="text" value={workspaceRoot} onChange={(event) => { setFolderPickerError(null); onChangeWorkspace({ workspaceRoot: event.target.value }); }} placeholder={t("Empty — no file access")} spellCheck={false} className="field font-mono text-xs" />
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
        <div className="workspace-runtime-row flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-3 py-2">
          <button ref={folderButton} type="button" aria-haspopup="dialog" aria-expanded={folderOpen} aria-controls="agent-workspace-popover" onClick={toggleFolderControl} disabled={folderPickerBusy} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-ink disabled:cursor-wait disabled:opacity-70">
            <Folder className="h-3.5 w-3.5 shrink-0 text-accent" aria-hidden /><span className="truncate font-mono">{folderName(workspaceRoot, t("Choose folder"))}</span>{allowShell && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" title={t("Shell enabled")} aria-label={t("Shell enabled")} />}<ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
          </button>
          <RuntimeControls
            sessionId={sessionId}
            selection={runtimeSelection}
            report={runtimeReport}
            preferences={runtimePreferences}
            loading={runtimeLoading}
            onChange={onRuntimeSelectionChange}
            onOpenConnections={onOpenConnections}
            disabled={busy}
          />
        </div>
        {(entries.length > 0 || hasPlan) && (
          <Composer sessionId={sessionId} send={onSend} busy={busy} stop={onStop} retry={error ? onRetry : undefined} />
        )}
      </div>
    </aside>
  );
};

export default AgentPane;
