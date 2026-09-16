import React, { useState } from "react";
import { Bot, Check, ChevronRight, DraftingCompass, FolderKanban, Languages, Layers, MessageCircle, Moon, PanelLeftClose, PanelLeftOpen, Plug, Plus, Sun, Trash2, X } from "lucide-react";
import type { ProjectSession, SessionSummary } from "../types";
import { SAMPLE_PROJECTS, sampleText, type SampleProject } from "../lib/sampleData";
import type { Theme } from "../lib/theme";
import { useT } from "../lib/i18n";

interface SidebarProps {
  session: ProjectSession;
  historySessions: SessionSummary[];
  onSelectStep: (step: 1 | 2 | 3) => void;
  onNewProject: () => void;
  onSelectSample: (sample: SampleProject) => void;
  onSelectHistorySession: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onOpenConnections: () => void;
  onOpenAgents: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  onToggleLanguage: () => void;
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  layoutMode?: "agent" | "split" | "board";
  onSelectAgent?: () => void;
}

const sectionLabel = "px-2.5 pb-2 text-[10px] font-medium uppercase tracking-[0.12em] text-faint";

export const Sidebar: React.FC<SidebarProps> = ({
  session,
  historySessions,
  onSelectStep,
  onNewProject,
  onSelectSample,
  onSelectHistorySession,
  onDeleteHistory,
  onOpenConnections,
  onOpenAgents,
  theme,
  onToggleTheme,
  onToggleLanguage,
  isOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
  layoutMode,
  onSelectAgent,
}) => {
  const { lang, t } = useT();
  const [showSamples, setShowSamples] = useState(false);

  const hasPlan = Boolean(session.plan);
  const hasPrd = Boolean(session.prd);
  const hasTasks = Boolean(session.tasks?.length);
  const activeTitle = session.input.title || session.title;
  const projectStep: 1 | 2 | 3 = hasTasks ? 3 : hasPrd ? 2 : 1;
  const isRail = collapsed && !isOpen;
  const otherLanguageName = lang === "en" ? "Bahasa Indonesia" : "English";
  const railButton = isRail ? "mx-auto h-9 w-9 justify-center px-0" : "w-full justify-start px-2.5";

  const steps = [
    { num: 1 as const, label: t("Plan"), complete: hasPlan, available: true },
    { num: 2 as const, label: t("PRD"), complete: hasPrd, available: true },
    { num: 3 as const, label: t("Kanban"), complete: hasTasks, available: true },
  ];

  const selectAgent = () => {
    onSelectAgent?.();
    onClose();
  };

  const selectProject = () => {
    onSelectStep(projectStep);
    onClose();
  };

  const handleStepClick = (step: (typeof steps)[number]) => {
    onSelectStep(step.num);
    onClose();
  };

  return (
    <>
      {isOpen && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/40 md:hidden" aria-hidden />}
      <aside
        className={`shell-sidebar fixed inset-y-0 left-0 z-50 flex h-screen shrink-0 flex-col overflow-hidden border-r border-line bg-sidebar transition-[transform,width] duration-200 md:sticky md:top-0 md:translate-x-0 ${isRail ? "w-14" : "w-[13.5rem]"} ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
        aria-label={t("Main navigation")}
      >
        <div className={`flex h-16 shrink-0 items-center gap-2.5 border-b border-line ${isRail ? "justify-center px-0" : "px-4"}`}>
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-accent text-accent-fg shadow-sm">
            <DraftingCompass className="h-4 w-4" strokeWidth={2} aria-hidden />
          </span>
          {!isRail && <span className="truncate text-[13px] font-medium tracking-[-0.02em] text-ink">The Architech</span>}
          {!isRail && <button type="button" onClick={onClose} className="ml-auto rounded-md p-1.5 text-faint hover:bg-subtle hover:text-ink md:hidden" aria-label={t("Close menu")}><X className="h-4 w-4" /></button>}
        </div>

        <div className={`min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 ${isRail ? "px-2" : "px-3"}`}>
          <nav className="space-y-1" aria-label={t("Main navigation")}>
            <button type="button" onClick={selectAgent} aria-current={layoutMode === "agent" ? "page" : undefined} title={t("Chat")} className={`shell-nav-item ${railButton} ${layoutMode === "agent" ? "is-active" : ""}`}>
              <MessageCircle className="h-4 w-4 shrink-0" aria-hidden />
              {!isRail && <span>{t("Chat")}</span>}
            </button>
            <button type="button" onClick={selectProject} aria-current={layoutMode !== "agent" ? "page" : undefined} title={t("Projects")} className={`shell-nav-item ${railButton} ${layoutMode !== "agent" ? "is-active" : ""}`}>
              <FolderKanban className="h-4 w-4 shrink-0" aria-hidden />
              {!isRail && <span>{t("Projects")}</span>}
            </button>
            <button type="button" onClick={() => { onOpenAgents(); onClose(); }} title={t("Agents")} className={`shell-nav-item ${railButton}`}>
              <Bot className="h-4 w-4 shrink-0" aria-hidden />
              {!isRail && <span>{t("Agents")}</span>}
            </button>
            <button type="button" onClick={() => { onOpenConnections(); onClose(); }} title={t("Connections")} className={`shell-nav-item ${railButton}`}>
              <Plug className="h-4 w-4 shrink-0" aria-hidden />
              {!isRail && <span>{t("Connections")}</span>}
            </button>
          </nav>

          <div className="mt-7">
            {!isRail && <p className={sectionLabel}>{t("Conversation")}</p>}
            <button type="button" onClick={() => { onNewProject(); selectAgent(); }} title={t("New chat")} className={`shell-new-chat ${railButton}`}>
              <Plus className="h-4 w-4 shrink-0" aria-hidden />
              {!isRail && <span>{t("New chat")}</span>}
            </button>

            {!isRail && historySessions.length > 0 && (
              <div className="mt-2 space-y-0.5" aria-label={t("Recent chats")}>
                {historySessions.slice(0, 8).map((hist) => {
                  const isActive = hist.id === session.id;
                  return (
                    <div key={hist.id} className={`shell-history-row group ${isActive ? "is-active" : ""}`}>
                      <button type="button" onClick={() => { onSelectHistorySession(hist.id); onClose(); }} className="min-w-0 flex-1 truncate px-2.5 py-2 text-left" aria-current={isActive ? "page" : undefined}>
                        <span className="block truncate text-[11px]">{hist.title || t("Untitled project")}</span>
                        <span className="mt-0.5 block text-[10px] text-faint">{new Date(hist.updatedAt).toLocaleDateString(lang)}</span>
                      </button>
                      <button type="button" onClick={() => onDeleteHistory(hist.id)} title={t("Remove from history")} className="mr-1 rounded p-1 text-transparent group-hover:text-faint hover:!text-danger" aria-label={t("Remove from history")}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {!isRail && historySessions.length === 0 && <p className="px-2.5 pt-2 text-[11px] leading-relaxed text-faint">{t("No chats yet")}</p>}
          </div>

          <div className="mt-7">
            {!isRail && <p className={sectionLabel}>{t("Current project")}</p>}
            <button type="button" onClick={selectProject} title={activeTitle || t("Untitled project")} className={`shell-project ${railButton}`}>
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent-ink"><FolderKanban className="h-3.5 w-3.5" aria-hidden /></span>
              {!isRail && <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[11px] font-medium">{activeTitle || t("Untitled project")}</span><span className="mt-0.5 block text-[10px] text-faint">{t("Chat · PRD · Kanban")}</span></span>}
            </button>
            {!isRail && <div className="mt-2 space-y-0.5 pl-2">
              {steps.map((step) => (
                <button key={step.num} type="button" onClick={() => handleStepClick(step)} className={`shell-step ${session.currentStep === step.num ? "is-active" : ""}`} title={step.label}>
                  <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-line text-[9px]">{step.complete ? <Check className="h-2.5 w-2.5 text-ok" /> : step.num}</span><span className="truncate">{step.label}</span>
                </button>
              ))}
            </div>}
          </div>

          {!isRail && <div className="mt-6">
            <button type="button" onClick={() => setShowSamples((open) => !open)} className="shell-nav-item w-full justify-start px-2.5" aria-expanded={showSamples}>
              <Layers className="h-4 w-4 text-faint" aria-hidden /><span>{t("Templates")}</span><ChevronRight className={`ml-auto h-3.5 w-3.5 text-faint transition-transform ${showSamples ? "rotate-90" : ""}`} />
            </button>
            {showSamples && <div className="mt-1 space-y-0.5 pl-8">{SAMPLE_PROJECTS.map((sample) => <button key={sample.id} type="button" onClick={() => { onSelectSample(sample); setShowSamples(false); onClose(); }} className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[11px] text-muted hover:bg-subtle hover:text-ink" title={sampleText(sample, lang).tagline}>{sampleText(sample, lang).name}</button>)}</div>}
          </div>}
        </div>

        <div className={`shrink-0 border-t border-line py-3 ${isRail ? "px-2" : "px-3"}`}>
          <div className={`mb-2 flex items-center gap-2.5 ${isRail ? "justify-center" : "px-2"}`}>
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-line bg-surface text-[10px] font-medium text-muted">L</span>
            {!isRail && <span className="min-w-0"><span className="block truncate text-[11px] font-medium text-ink">{t("Workspace local")}</span><span className="block truncate text-[10px] text-faint">{t("Ready to work")}</span></span>}
          </div>
          <div className="flex items-center gap-0.5">
            <button type="button" onClick={onToggleLanguage} title={otherLanguageName} className={`shell-settings-button ${isRail ? "mx-auto" : ""}`}><Languages className="h-3.5 w-3.5" aria-hidden /><span className="sr-only">{otherLanguageName}</span></button>
            <button type="button" onClick={onToggleTheme} title={theme === "dark" ? t("Light mode") : t("Dark mode")} className={`shell-settings-button ${isRail ? "mx-auto" : ""}`}>{theme === "dark" ? <Sun className="h-3.5 w-3.5" aria-hidden /> : <Moon className="h-3.5 w-3.5" aria-hidden />}<span className="sr-only">{theme === "dark" ? t("Light mode") : t("Dark mode")}</span></button>
            {!isOpen && <button type="button" onClick={onToggleCollapsed} title={isRail ? t("Expand sidebar") : t("Collapse sidebar")} className={`shell-settings-button ${isRail ? "mx-auto" : "ml-auto"}`}>{isRail ? <PanelLeftOpen className="h-3.5 w-3.5" aria-hidden /> : <PanelLeftClose className="h-3.5 w-3.5" aria-hidden />}<span className="sr-only">{isRail ? t("Expand sidebar") : t("Collapse sidebar")}</span></button>}
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
