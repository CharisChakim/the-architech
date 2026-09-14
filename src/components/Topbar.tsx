import React from "react";
import { ProjectSession } from "../types";
import { Menu, Download, MessageSquare } from "lucide-react";
import { useT } from "../lib/i18n";

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
  const stepNames: Record<number, string> = {
    1: t("Plan"),
    2: t("PRD"),
    3: t("Send to Agent"),
  };
  const activeTitle = session.input.title || session.title;
  const hasArtifacts = Boolean(session.plan || session.prd || session.tasks);
  const layoutModes: { id: LayoutMode; label: string }[] = [
    { id: "agent", label: t("Agent") },
    ...(!isNarrow ? [{ id: "split" as const, label: t("Split") }] : []),
    { id: "board", label: t("Board") },
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
    <header className="sticky top-0 z-30 h-14 shrink-0 bg-canvas/85 backdrop-blur border-b border-line">
      <div className="h-full px-4 lg:px-8 flex items-center gap-3">
        <button
          onClick={onOpenMenu}
          className="lg:hidden p-2 -ml-2 rounded-lg text-muted hover:text-ink hover:bg-subtle transition-colors"
          aria-label={t("Open menu")}
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-sm font-medium text-ink truncate">
            {activeTitle || t("Untitled project")}
          </h1>
          <span className="text-faint shrink-0" aria-hidden>
            /
          </span>
          <span className="text-sm text-muted shrink-0">{stepNames[session.currentStep]}</span>
        </div>

        {onLayoutModeChange && (
          <div
            role="group"
            aria-label="Layout mode"
            className="hidden sm:flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 text-xs font-medium"
          >
            {layoutModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onLayoutModeChange(mode.id)}
                aria-pressed={layoutMode === mode.id}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  layoutMode === mode.id ? "bg-accent-soft text-accent-ink" : "text-muted hover:text-ink"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex min-w-0 items-center gap-2">
          {hasConnectionStatus &&
            (onOpenConnections ? (
              <button
                type="button"
                onClick={onOpenConnections}
                title={connectionStatusLabel}
                className="hidden max-w-56 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted hover:bg-subtle hover:text-ink sm:flex"
              >
                {connectionContent}
              </button>
            ) : (
              <span
                title={connectionStatusLabel}
                className="hidden max-w-56 items-center gap-1.5 px-2 py-1 text-xs text-muted sm:flex"
              >
                {connectionContent}
              </span>
            ))}

          {hasArtifacts && (
            <button onClick={onOpenExport} className="btn-outline" title={t("Export document & task bundle")}>
              <Download className="w-4 h-4 text-faint" />
              <span className="hidden sm:inline">{t("Export")}</span>
            </button>
          )}

          {onToggleChat && (
            <button
              onClick={onToggleChat}
              className="btn-outline"
              aria-pressed={Boolean(chatOpen)}
              title={t("Ask the agent to change this project")}
            >
              <MessageSquare className="w-4 h-4 text-faint" />
              <span className="hidden sm:inline">{t("Agent")}</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
