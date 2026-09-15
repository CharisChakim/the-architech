import React from "react";
import { ProjectSession } from "../types";
import { Menu, Download, MessageCircle, FolderKanban, MessageSquare } from "lucide-react";
import { useT } from "../lib/i18n";
import { useConnections } from "../lib/connections";
import { ModelSwitcher } from "./connection/ModelSwitcher";

export type LayoutMode = "agent" | "split" | "board";
export type ConnectionStatus = "connected" | "checking" | "error" | "unknown";

export interface TopbarProps {
  session: ProjectSession;
  onOpenMenu: () => void;
  onOpenExport: () => void;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  layoutMode?: LayoutMode;
  onLayoutModeChange?: (mode: LayoutMode) => void;
  isNarrow?: boolean;
  connectionLabel?: string;
  modelLabel?: string;
  connectionStatus?: ConnectionStatus;
  onOpenConnections?: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  session,
  onOpenMenu,
  onOpenExport,
  chatOpen,
  onToggleChat,
  layoutMode = "agent",
  onLayoutModeChange,
  isNarrow = false,
  connectionLabel,
  modelLabel,
  connectionStatus = "unknown",
  onOpenConnections,
}) => {
  const { t } = useT();
  const { connections, roles, bindRole } = useConnections();
  const activeTitle = session.input.title || session.title;
  const hasArtifacts = Boolean(session.plan || session.prd || session.tasks);
  const layoutModes: { id: LayoutMode; label: string }[] = [
    { id: "agent", label: t("Chat") },
    ...(!isNarrow ? [{ id: "split" as const, label: t("Split") }] : []),
    { id: "board", label: t("Project") },
  ];
  const hasConnectionStatus = Boolean(connectionLabel || modelLabel);
  const statusDotClass =
    connectionStatus === "connected"
      ? "bg-ok"
      : connectionStatus === "checking"
        ? "bg-warn"
        : connectionStatus === "error"
          ? "bg-danger"
          : "bg-faint";

  const connectionStatusLabel =
    connectionStatus === "connected"
      ? "connected"
      : connectionStatus === "checking"
        ? "checking"
        : connectionStatus === "error"
          ? "error"
          : "unknown";

  const connectionContent = hasConnectionStatus ? (
    <>
      <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotClass}`} aria-hidden />
      <span className="truncate">
        {connectionLabel}
        {connectionLabel && modelLabel && <span className="text-faint"> · </span>}
        {modelLabel}
      </span>
    </>
  ) : null;

  return (
    <header className="shell-topbar sticky top-0 z-30 shrink-0 border-b border-line bg-canvas/90 backdrop-blur">
      <div className="flex min-h-16 items-center gap-3 px-4 md:px-6 lg:px-7">
        <button
          onClick={onOpenMenu}
          className="-ml-2 rounded-lg p-2 text-muted hover:bg-subtle hover:text-ink md:hidden"
          aria-label={t("Open menu")}
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            {layoutMode === "agent" ? <MessageCircle className="h-4 w-4 shrink-0 text-accent" aria-hidden /> : <FolderKanban className="h-4 w-4 shrink-0 text-accent" aria-hidden />}
            <h1 className="truncate text-[13px] font-medium tracking-[-0.01em] text-ink">
              {activeTitle || t("New chat")}
            </h1>
            {!activeTitle && <span className="shell-topbar-badge">{t("Conversation")}</span>}
          </div>
          <p className="mt-0.5 hidden text-[10px] text-faint sm:block">{layoutMode === "agent" ? t("Chat is ready for your next idea") : t("Project context")}</p>
        </div>

        {onLayoutModeChange && (
          <div
            role="group"
            aria-label="Layout mode"
            className="shell-layout-switcher hidden items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 text-[11px] font-medium sm:flex"
          >
            {layoutModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onLayoutModeChange(mode.id)}
                aria-pressed={layoutMode === mode.id}
                  className={`rounded-md px-2.5 py-1.5 transition-colors ${
                    layoutMode === mode.id ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink"
                  }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2">
          <ModelSwitcher
            connections={connections}
            roleBindings={roles}
            onSelectModel={(role, connectionId, model) => bindRole(role, connectionId, model)}
            onOpenConnections={onOpenConnections}
          />

          {hasArtifacts && (
            <button onClick={onOpenExport} className="shell-icon-button" title={t("Export document & task bundle")}>
              <Download className="h-4 w-4 text-faint" aria-hidden />
              <span className="hidden sm:inline">{t("Export")}</span>
            </button>
          )}

          {onToggleChat && (
            <button
              onClick={onToggleChat}
              className="shell-icon-button"
              aria-pressed={Boolean(chatOpen)}
              title={t("Ask the agent to change this project")}
            >
              <MessageSquare className="h-4 w-4 text-faint" aria-hidden />
              <span className="hidden sm:inline">{t("Agent")}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
