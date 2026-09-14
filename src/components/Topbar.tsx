import React from "react";
import { ProjectSession } from "../types";
import { Menu, Download, MessageSquare } from "lucide-react";
import { useT } from "../lib/i18n";

interface TopbarProps {
  session: ProjectSession;
  onOpenMenu: () => void;
  onOpenExport: () => void;
  chatOpen: boolean;
  onToggleChat: () => void;
}

export const Topbar: React.FC<TopbarProps> = ({
  session,
  onOpenMenu,
  onOpenExport,
  chatOpen,
  onToggleChat,
}) => {
  const { t } = useT();
  const stepNames: Record<number, string> = {
    1: t("Plan"),
    2: t("PRD"),
    3: t("Send to Agent"),
  };
  const activeTitle = session.input.title || session.title;
  const hasArtifacts = Boolean(session.plan || session.prd || session.tasks);

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

        <div className="ml-auto flex items-center gap-2">
          {hasArtifacts && (
            <button onClick={onOpenExport} className="btn-outline" title={t("Export document & task bundle")}>
              <Download className="w-4 h-4 text-faint" />
              <span className="hidden sm:inline">{t("Export")}</span>
            </button>
          )}

          <button
            onClick={onToggleChat}
            className="btn-outline"
            aria-pressed={chatOpen}
            title={t("Ask the agent to change this project")}
          >
            <MessageSquare className="w-4 h-4 text-faint" />
            <span className="hidden sm:inline">{t("Agent")}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
