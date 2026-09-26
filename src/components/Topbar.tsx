import React, { useLayoutEffect, useRef, useState } from "react";
import { ProjectSession } from "../types";
import { Check, ChevronDown, Download, Folder, Layers, Menu, MessageSquare, Moon, Plug, Settings2, Sun } from "lucide-react";
import { useT, type Language } from "../lib/i18n";
import { useConnections } from "../lib/connections";
import { useDismissable } from "../lib/dismissable";
import { SAMPLE_PROJECTS, sampleText, type SampleProject } from "../lib/sampleData";
import { projectNameFromWorkspaceRoot } from "../lib/workspace";
import type { Theme } from "../lib/theme";

export type LayoutMode = "agent" | "split" | "board";

export interface TopbarProps {
  session: ProjectSession;
  onOpenMenu: () => void;
  onOpenExport: () => void;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  layoutMode?: LayoutMode;
  onLayoutModeChange?: (mode: LayoutMode) => void;
  isNarrow?: boolean;
  onOpenConnections: () => void;
  onOpenSettings: () => void;
  onSelectSample: (sample: SampleProject) => void;
  theme: Theme;
  onToggleTheme: () => void;
  onSelectLanguage: (lang: Language) => void;
}

const FLAGS: Record<Language, React.ReactNode> = {
  en: (
    <svg width="20" height="14" viewBox="0 0 60 42" className="block rounded-[2px]" aria-hidden>
      <rect width="60" height="42" fill="#012169" />
      <path d="M0 0 60 42M60 0 0 42" stroke="#ffffff" strokeWidth="8" />
      <path d="M0 0 60 42M60 0 0 42" stroke="#c8102e" strokeWidth="4" />
      <path d="M30 0v42M0 21h60" stroke="#ffffff" strokeWidth="14" />
      <path d="M30 0v42M0 21h60" stroke="#c8102e" strokeWidth="8" />
    </svg>
  ),
  id: (
    <svg width="20" height="14" viewBox="0 0 60 42" className="block rounded-[2px]" aria-hidden>
      <rect width="60" height="21" fill="#ce1126" />
      <rect y="21" width="60" height="21" fill="#f5f5f7" />
    </svg>
  ),
};

const LANGUAGE_NAMES: Record<Language, string> = { en: "English", id: "Bahasa Indonesia" };

export const Topbar: React.FC<TopbarProps> = ({
  session,
  onOpenMenu,
  onOpenExport,
  chatOpen,
  onToggleChat,
  layoutMode = "agent",
  onLayoutModeChange,
  isNarrow = false,
  onOpenConnections,
  onOpenSettings,
  onSelectSample,
  theme,
  onToggleTheme,
  onSelectLanguage,
}) => {
  const { lang, t } = useT();
  const { connections } = useConnections();
  const [openMenu, setOpenMenu] = useState<"templates" | "language" | null>(null);
  // Tombol yang membuka menu, supaya Escape mengembalikan fokus ke sana.
  const menuTrigger = useRef<HTMLButtonElement | null>(null);
  const menuRef = useDismissable<HTMLDivElement>((reason) => {
    setOpenMenu((open) => {
      if (open && reason === "escape") menuTrigger.current?.focus();
      return null;
    });
  });

  // Each menu hangs off its button's right edge. On a phone the header wraps
  // and the buttons sit near the left, so that pushed the menu off screen.
  const menuPopup = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const popup = menuPopup.current;
    if (!popup) return;
    popup.style.translate = "";
    const margin = 8;
    const rect = popup.getBoundingClientRect();
    const viewport = document.documentElement.clientWidth;
    const shift = rect.left < margin
      ? margin - rect.left
      : rect.right > viewport - margin ? viewport - margin - rect.right : 0;
    if (shift) popup.style.translate = `${shift}px 0`;
  }, [openMenu]);

  const toggleMenu = (menu: "templates" | "language", trigger: HTMLButtonElement) => {
    menuTrigger.current = trigger;
    setOpenMenu((open) => (open === menu ? null : menu));
  };

  const activeTitle = session.input.title || session.title;
  const folderName = projectNameFromWorkspaceRoot(session.workspaceRoot || "");
  const hasArtifacts = Boolean(session.plan || session.prd || session.tasks);
  const activeConnections = connections.filter((connection) => connection.enabled).length;
  const stepNames = { 1: t("Plan"), 2: t("PRD"), 3: t("Kanban") } as const;
  const layoutModes: { id: LayoutMode; label: string }[] = [
    { id: "agent", label: t("Chat") },
    ...(!isNarrow ? [{ id: "split" as const, label: t("Split") }] : []),
    { id: "board", label: t("Board") },
  ];

  return (
    <header className="shell-topbar sticky top-0 z-30 shrink-0 border-b border-line bg-surface">
      {/* Di ponsel breadcrumb dan deretan kontrol tidak muat pada satu baris:
          breadcrumb tergencet habis dan tombol terakhir terpotong. Jadi header
          membungkus jadi dua baris sampai lebar sm. */}
      <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:min-h-[3.25rem] sm:flex-nowrap sm:gap-2.5 sm:py-0 md:px-4">
        <button
          onClick={onOpenMenu}
          className="-ml-1 shrink-0 rounded-lg p-2 text-muted hover:bg-subtle hover:text-ink md:hidden"
          aria-label={t("Open menu")}
        >
          <Menu className="h-4 w-4" aria-hidden />
        </button>

        <nav aria-label={t("Breadcrumb")} className="flex min-w-0 flex-1 items-center gap-1.5 text-[12px] sm:flex-none">
          {folderName && (
            <>
              <span className="flex min-w-0 items-center gap-1.5 text-muted">
                <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="truncate">{folderName}</span>
              </span>
              <span className="text-faint" aria-hidden>/</span>
            </>
          )}
          <span className={`min-w-0 truncate ${layoutMode === "board" ? "text-muted" : "font-semibold text-ink"}`}>
            {activeTitle || t("New chat")}
          </span>
          {layoutMode === "board" && (
            <>
              <span className="text-faint" aria-hidden>/</span>
              <span className="shrink-0 font-semibold text-ink">{stepNames[session.currentStep]}</span>
            </>
          )}
        </nav>

        <span className="hidden flex-1 sm:block" />

        <div className="flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 sm:w-auto sm:flex-nowrap sm:gap-2.5">
        {onLayoutModeChange && (
          <div
            role="group"
            aria-label={t("Layout mode")}
            className="shell-layout-switcher flex items-center gap-0.5 rounded-lg bg-subtle p-0.5 text-[12px] font-medium"
          >
            {layoutModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                onClick={() => onLayoutModeChange(mode.id)}
                aria-pressed={layoutMode === mode.id}
                className={`rounded-md px-2.5 py-1 transition-colors ${
                  layoutMode === mode.id ? "bg-surface text-ink shadow-elev-1" : "text-muted hover:text-ink"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        )}

        <span className="h-5 w-px shrink-0 bg-line" aria-hidden />

        {hasArtifacts && (
          <button onClick={onOpenExport} className="shell-icon-button" title={t("Export document & task bundle")}>
            <Download className="h-4 w-4 text-faint" aria-hidden />
            <span className="hidden lg:inline">{t("Export")}</span>
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
            <span className="hidden lg:inline">{t("Agent")}</span>
          </button>
        )}

        <div ref={menuRef} className="flex items-center gap-1">
          <div className="relative">
            <button
              type="button"
              onClick={(event) => toggleMenu("templates", event.currentTarget)}
              aria-expanded={openMenu === "templates"}
              className="shell-icon-button"
              title={t("Templates")}
            >
              <Layers className="h-4 w-4 text-accent-ink" aria-hidden />
              <span className="hidden lg:inline">{t("Templates")}</span>
            </button>
            {openMenu === "templates" && (
              <div ref={menuPopup} className="absolute right-0 top-full z-40 mt-1.5 w-56 rounded-lg border border-line bg-surface p-1 shadow-elev-2">
                {SAMPLE_PROJECTS.map((sample) => (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => { onSelectSample(sample); setOpenMenu(null); }}
                    className="block w-full truncate rounded-md px-2 py-1.5 text-left text-[12px] text-muted hover:bg-subtle hover:text-ink"
                    title={sampleText(sample, lang).tagline}
                  >
                    {sampleText(sample, lang).name}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button type="button" onClick={onOpenConnections} className="shell-icon-button" title={t("Connections")}>
            <Plug className="h-4 w-4 text-ok" aria-hidden />
            <span className="hidden lg:inline">{t("Connections")}</span>
            {activeConnections > 0 && (
              <span className="rounded bg-ok-soft px-1.5 text-[10px] font-semibold text-ok-ink">{activeConnections}</span>
            )}
          </button>

          <div className="relative">
            <button
              type="button"
              onClick={(event) => toggleMenu("language", event.currentTarget)}
              aria-expanded={openMenu === "language"}
              className="flex items-center gap-1.5 rounded-lg border border-line bg-subtle px-1.5 py-1.5"
              aria-label={t("Language: {name}", { name: LANGUAGE_NAMES[lang] })}
            >
              {FLAGS[lang]}
              <ChevronDown className="h-3 w-3 text-faint" aria-hidden />
            </button>
            {openMenu === "language" && (
              <div ref={menuPopup} className="absolute right-0 top-full z-40 mt-1.5 w-44 rounded-lg border border-line bg-surface p-1 shadow-elev-2">
                {(["en", "id"] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => { onSelectLanguage(code); setOpenMenu(null); }}
                    aria-pressed={lang === code}
                    className={`flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-[12px] ${lang === code ? "bg-accent-soft font-semibold text-accent-ink" : "text-muted hover:bg-subtle hover:text-ink"}`}
                  >
                    {FLAGS[code]}
                    <span className="flex-1">{LANGUAGE_NAMES[code]}</span>
                    {lang === code && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            className="shell-settings-button"
            title={theme === "dark" ? t("Light mode") : t("Dark mode")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            <span className="sr-only">{theme === "dark" ? t("Light mode") : t("Dark mode")}</span>
          </button>

          <button type="button" onClick={onOpenSettings} className="shell-settings-button" title={t("Agent settings")}>
            <Settings2 className="h-4 w-4" aria-hidden />
            <span className="sr-only">{t("Agent settings")}</span>
          </button>
        </div>
        </div>
      </div>
    </header>
  );
};
