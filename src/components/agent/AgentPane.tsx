import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, Check, ChevronDown, Circle, Clock3, Folder } from "lucide-react";
import type { ProjectSession } from "../../types";
import type { Entry } from "../../lib/agentEvents";
import { useT } from "../../lib/i18n";
import { Markdown } from "../lazy";
import { ApprovalCard } from "./ApprovalCard";
import { Composer } from "./Composer";
import { ToolCallCard } from "./ToolCallCard";

export type PipelineStep = 1 | 2 | 3;

export interface AgentPaneProps {
  workspaceRoot: string;
  allowShell: boolean;
  onChangeWorkspace: (patch: Pick<ProjectSession, "workspaceRoot" | "allowShell">) => void;
  entries: Entry[];
  busy: boolean;
  error: string | null;
  onSend: (text: string) => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onDecideApproval: (elicitId: string, ok: boolean) => void | Promise<void>;
  onStop: () => void;
  onNavigatePipeline?: (step: PipelineStep) => void;
}

const formatDuration = (ms: number): string => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

const folderName = (root: string, emptyLabel: string): string => {
  const value = root.trim();
  return value ? value.replace(/^\/home\/[^/]+/, "~") : emptyLabel;
};

export const AgentPane: React.FC<AgentPaneProps> = ({
  workspaceRoot,
  allowShell,
  onChangeWorkspace,
  entries,
  busy,
  error,
  onSend,
  onRetry,
  onDecideApproval,
  onStop,
  onNavigatePipeline,
}) => {
  const { t } = useT();
  const [folderOpen, setFolderOpen] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);
  const folderPopover = useRef<HTMLDivElement>(null);

  useEffect(() => {
    transcript.current?.scrollTo({ top: transcript.current.scrollHeight });
  }, [entries, busy]);

  useEffect(() => {
    if (!folderOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!folderPopover.current?.contains(event.target as Node)) setFolderOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [folderOpen]);

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
      <div ref={transcript} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {entries.length === 0 && (
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
          <div className="absolute bottom-full left-3 right-3 z-20 mb-2 rounded-xl border border-line bg-surface p-3 shadow-lg">
            <label className="field-label" htmlFor="agent-workspace-root">{t("Working folder")}</label>
            <input id="agent-workspace-root" type="text" value={workspaceRoot} onChange={(event) => onChangeWorkspace({ workspaceRoot: event.target.value })} placeholder={t("Empty — no file access")} spellCheck={false} className="field font-mono text-xs" />
            <label className={`mt-3 flex items-start gap-2 text-xs ${workspaceRoot.trim() ? "text-muted" : "text-faint"}`}>
              <input type="checkbox" checked={allowShell} disabled={!workspaceRoot.trim()} onChange={(event) => onChangeWorkspace({ allowShell: event.target.checked })} className="mt-0.5 shrink-0" />
              <span>{t("Allow shell commands")}{allowShell && <span className="mt-0.5 block text-warn-ink">{t("The model can run any command in that folder.")}</span>}</span>
            </label>
          </div>
        )}
        <div className="border-t border-line px-3 pt-3">
          <button type="button" aria-expanded={folderOpen} onClick={() => setFolderOpen((open) => !open)} className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-line bg-canvas px-2.5 py-1 text-[11px] text-muted hover:border-accent hover:text-ink">
            <Folder className="h-3.5 w-3.5 shrink-0 text-accent" /><span className="truncate font-mono">{folderName(workspaceRoot, t("Choose folder"))}</span>{allowShell && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-ok" title={t("Shell enabled")} />}<ChevronDown className="h-3 w-3 shrink-0" />
          </button>
        </div>
        <Composer send={onSend} busy={busy} stop={onStop} retry={error ? onRetry : undefined} />
      </div>
    </aside>
  );
};

export default AgentPane;
