import React from "react";
import { ProjectSession } from "../types";
import { Menu, Download } from "lucide-react";

interface TopbarProps {
  session: ProjectSession;
  onOpenMenu: () => void;
  onOpenExport: () => void;
}

const STEP_NAMES: Record<number, string> = {
  1: "Plan",
  2: "PRD",
  3: "Task AI Agent",
};

export const Topbar: React.FC<TopbarProps> = ({ session, onOpenMenu, onOpenExport }) => {
  const activeTitle = session.input.title || session.title;
  const hasArtifacts = Boolean(session.plan || session.prd || session.tasks);

  return (
    <header className="sticky top-0 z-30 h-14 shrink-0 bg-canvas/85 backdrop-blur border-b border-line">
      <div className="h-full px-4 lg:px-8 flex items-center gap-3">
        <button
          onClick={onOpenMenu}
          className="lg:hidden p-2 -ml-2 rounded-lg text-muted hover:text-ink hover:bg-subtle transition-colors"
          aria-label="Buka menu"
        >
          <Menu className="w-4 h-4" />
        </button>

        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-sm font-medium text-ink truncate">
            {activeTitle || "Proyek tanpa judul"}
          </h1>
          <span className="text-faint shrink-0" aria-hidden>
            /
          </span>
          <span className="text-sm text-muted shrink-0">{STEP_NAMES[session.currentStep]}</span>
        </div>

        {hasArtifacts && (
          <button onClick={onOpenExport} className="ml-auto btn-outline" title="Export bundle dokumen & task">
            <Download className="w-4 h-4 text-faint" />
            <span className="hidden sm:inline">Export</span>
          </button>
        )}
      </div>
    </header>
  );
};
