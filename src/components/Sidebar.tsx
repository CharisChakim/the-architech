import React, { useState } from "react";
import { ProjectSession, SessionSummary, LLMConfig } from "../types";
import {
  DraftingCompass,
  Check,
  Lock,
  Plus,
  Layers,
  ChevronRight,
  Trash2,
  Cpu,
  Sun,
  Moon,
  X,
  FolderOpen,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { SAMPLE_PROJECTS, SampleProject } from "../lib/sampleData";
import { Theme } from "../lib/theme";

interface SidebarProps {
  session: ProjectSession;
  historySessions: SessionSummary[];
  onSelectStep: (step: 1 | 2 | 3) => void;
  onNewProject: () => void;
  onSelectSample: (sample: SampleProject) => void;
  onSelectHistorySession: (id: string) => void;
  onDeleteHistory: (id: string) => void;
  onOpenLLMConfig: () => void;
  theme: Theme;
  onToggleTheme: () => void;
  isOpen: boolean;
  onClose: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

const sectionLabel = "px-2.5 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint";

const engineLabel = (config: LLMConfig) => {
  const provider =
    config.provider === "ollama" ? "Ollama" : config.provider === "custom" ? "Custom" : "Gemini";
  return `${provider} · ${config.modelName || "model bawaan"}`;
};

export const Sidebar: React.FC<SidebarProps> = ({
  session,
  historySessions,
  onSelectStep,
  onNewProject,
  onSelectSample,
  onSelectHistorySession,
  onDeleteHistory,
  onOpenLLMConfig,
  theme,
  onToggleTheme,
  isOpen,
  onClose,
  collapsed,
  onToggleCollapsed,
}) => {
  const [showSamples, setShowSamples] = useState(false);
  const [lockNotice, setLockNotice] = useState<string | null>(null);

  const hasPlan = Boolean(session.plan);
  const hasPrd = Boolean(session.prd);
  const hasTasks = Boolean(session.tasks && session.tasks.length > 0);

  const steps = [
    {
      num: 1 as const,
      title: "Bikin Plan",
      hint: "Klarifikasi ide, arsitektur, dan diagram logika",
      isCompleted: hasPlan,
      isAvailable: true,
      unlockRequirement: "",
    },
    {
      num: 2 as const,
      title: "Bikin PRD",
      hint: "Tujuh poin spesifikasi dan diagram alur",
      isCompleted: hasPrd,
      isAvailable: hasPlan,
      unlockRequirement: "Selesaikan Step 1 (Bikin Plan) terlebih dahulu",
    },
    {
      num: 3 as const,
      title: "Task AI Agent",
      hint: "Kanban board dan prompt siap eksekusi",
      isCompleted: hasTasks,
      isAvailable: hasPrd,
      unlockRequirement: "Selesaikan Step 2 (Bikin PRD) terlebih dahulu",
    },
  ];

  // Klik pada langkah yang belum terbuka tidak boleh diam saja: alasannya
  // ditampilkan sebentar di bawah daftar langkah.
  const handleStepClick = (step: (typeof steps)[0]) => {
    if (!step.isAvailable) {
      setLockNotice(step.unlockRequirement);
      setTimeout(() => setLockNotice(null), 3000);
      return;
    }
    setLockNotice(null);
    onSelectStep(step.num);
    onClose();
  };

  // Rail adalah urusan tata letak desktop: ia menukar lebar sidebar dengan
  // lebar konten. Sebagai drawer melayang di layar sempit tidak ada yang
  // ditukar, sementara ikon tanpa label kehilangan tooltip-nya di layar sentuh
  // — jadi drawer selalu tampil penuh.
  const isRail = collapsed && !isOpen;

  // Dalam mode rail hanya ikon yang muat, jadi tombol dijadikan kotak 40px yang
  // terpusat. Utility menimpa padding bawaan .btn-* karena layer utilities
  // dievaluasi setelah layer components.
  const railed = isRail ? "w-10 h-10 mx-auto px-0 justify-center" : "w-full justify-start";

  return (
    <>
      {/* Di layar sempit sidebar jadi drawer; latar gelap ini yang menutupnya. */}
      {isOpen && <div onClick={onClose} className="fixed inset-0 z-40 bg-black/50 lg:hidden" aria-hidden />}

      <aside
        className={`fixed lg:sticky inset-y-0 left-0 top-0 z-50 flex h-screen shrink-0 flex-col
          bg-sidebar border-r border-line transition-[transform,width] duration-200 lg:translate-x-0
          ${isRail ? "w-14" : "w-64"} ${isOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        {/* Brand */}
        <div
          className={`h-14 shrink-0 flex items-center gap-2.5 border-b border-line ${
            isRail ? "justify-center px-0" : "px-4"
          }`}
        >
          <div className="w-7 h-7 rounded-lg bg-accent grid place-items-center shrink-0">
            <DraftingCompass className="w-4 h-4 text-accent-fg" strokeWidth={2} />
          </div>
          {!isRail && (
            <>
              <span className="text-sm font-semibold tracking-tight text-ink">The Architech</span>
              <button
                onClick={onClose}
                className="ml-auto lg:hidden p-1.5 rounded-lg text-faint hover:text-ink hover:bg-subtle transition-colors"
                aria-label="Tutup menu"
              >
                <X className="w-4 h-4" />
              </button>
            </>
          )}
        </div>

        <div className={`flex-1 overflow-y-auto overflow-x-hidden py-4 space-y-6 ${isRail ? "px-2" : "px-3"}`}>
          {/* Tiga langkah pipeline */}
          <div>
            {!isRail && <p className={sectionLabel}>Alur kerja</p>}
            <nav className="space-y-0.5">
              {steps.map((step) => {
                const isActive = session.currentStep === step.num;
                const isLocked = !step.isAvailable;

                return (
                  <button
                    key={step.num}
                    onClick={() => handleStepClick(step)}
                    aria-current={isActive ? "step" : undefined}
                    title={isLocked ? step.unlockRequirement : `${step.title} — ${step.hint}`}
                    className={`flex items-start gap-2.5 rounded-lg text-left transition-colors ${
                      isRail ? "w-10 h-10 mx-auto items-center justify-center" : "w-full px-2.5 py-2"
                    } ${
                      isActive
                        ? "bg-accent-soft text-accent-ink"
                        : isLocked
                          ? "text-faint cursor-not-allowed"
                          : "text-muted hover:text-ink hover:bg-subtle"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 shrink-0 rounded-md grid place-items-center text-[11px] font-semibold ${
                        isRail ? "" : "mt-px"
                      } ${
                        isActive
                          ? "bg-accent text-accent-fg"
                          : step.isCompleted
                            ? "bg-ok-soft text-ok-ink"
                            : "bg-subtle text-faint"
                      }`}
                    >
                      {isLocked ? (
                        <Lock className="w-3 h-3" />
                      ) : step.isCompleted && !isActive ? (
                        <Check className="w-3 h-3" />
                      ) : (
                        step.num
                      )}
                    </span>

                    {!isRail && (
                      <span className="min-w-0">
                        <span className="block text-sm font-medium">{step.title}</span>
                        {isActive && (
                          <span className="block text-xs opacity-70 mt-0.5 leading-snug">{step.hint}</span>
                        )}
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            {lockNotice && !isRail && (
              <p className="mt-2 px-2.5 flex items-start gap-1.5 text-xs text-warn-ink">
                <Lock className="w-3 h-3 shrink-0 mt-0.5" />
                {lockNotice}
              </p>
            )}
          </div>

          {/* Mulai proyek */}
          <div>
            {!isRail && <p className={sectionLabel}>Proyek</p>}
            <button
              onClick={() => {
                onNewProject();
                onClose();
              }}
              title="Proyek baru"
              className={`btn-primary ${railed}`}
            >
              <Plus className="w-4 h-4 shrink-0" />
              {!isRail && "Proyek baru"}
            </button>

            <button
              onClick={() => {
                // Daftar template butuh lebar; membukanya dari rail sekalian
                // memekarkan sidebar supaya judulnya terbaca.
                if (isRail) onToggleCollapsed();
                setShowSamples(isRail ? true : !showSamples);
              }}
              title="Template proyek contoh"
              className={`btn-ghost mt-1 ${railed}`}
            >
              <Layers className="w-4 h-4 shrink-0 text-faint" />
              {!isRail && (
                <>
                  Template
                  <ChevronRight
                    className={`w-3.5 h-3.5 ml-auto transition-transform ${showSamples ? "rotate-90" : ""}`}
                  />
                </>
              )}
            </button>

            {showSamples && !isRail && (
              <div className="mt-0.5 space-y-0.5">
                {SAMPLE_PROJECTS.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => {
                      onSelectSample(sample);
                      setShowSamples(false);
                      onClose();
                    }}
                    title={sample.tagline}
                    className="w-full text-left px-2.5 py-1.5 pl-9 rounded-lg text-xs text-muted hover:text-ink hover:bg-subtle transition-colors truncate"
                  >
                    {sample.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Riwayat proyek tersimpan */}
          {isRail ? (
            <button
              onClick={onToggleCollapsed}
              title={`Riwayat proyek (${historySessions.length})`}
              className={`btn-ghost ${railed}`}
            >
              <FolderOpen className="w-4 h-4 shrink-0 text-faint" />
            </button>
          ) : (
            <div>
              <p className={sectionLabel}>
                Riwayat {historySessions.length > 0 && `(${historySessions.length})`}
              </p>

              {historySessions.length === 0 ? (
                <p className="px-2.5 text-xs text-faint leading-relaxed">
                  Proyek tersimpan otomatis begitu judulnya terisi.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {historySessions.map((hist) => {
                    const isActive = hist.id === session.id;
                    return (
                      <div
                        key={hist.id}
                        className={`group flex items-center rounded-lg transition-colors ${
                          isActive ? "bg-subtle" : "hover:bg-subtle"
                        }`}
                      >
                        <button
                          onClick={() => {
                            onSelectHistorySession(hist.id);
                            onClose();
                          }}
                          className="flex-1 min-w-0 text-left px-2.5 py-1.5"
                        >
                          <span
                            className={`block text-xs truncate ${isActive ? "text-ink font-medium" : "text-muted"}`}
                          >
                            {hist.title || "Proyek tanpa judul"}
                          </span>
                          <span className="block text-[11px] text-faint mt-0.5">
                            Step {hist.currentStep}/3 · {new Date(hist.updatedAt).toLocaleDateString()}
                          </span>
                        </button>

                        <button
                          onClick={() => onDeleteHistory(hist.id)}
                          title="Hapus dari riwayat"
                          className="shrink-0 p-1.5 mr-1 rounded-md text-transparent group-hover:text-faint hover:!text-danger transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Pengaturan */}
        <div className="shrink-0 border-t border-line p-2 space-y-0.5">
          <button
            onClick={onOpenLLMConfig}
            title={`Konfigurasi LLM — ${engineLabel(session.llmConfig)}`}
            className={`btn-ghost ${railed}`}
          >
            <Cpu className="w-4 h-4 shrink-0 text-faint" />
            {!isRail && <span className="truncate text-xs">{engineLabel(session.llmConfig)}</span>}
          </button>

          <button
            onClick={onToggleTheme}
            title={theme === "dark" ? "Mode terang" : "Mode gelap"}
            className={`btn-ghost ${railed}`}
          >
            {theme === "dark" ? (
              <Sun className="w-4 h-4 shrink-0 text-faint" />
            ) : (
              <Moon className="w-4 h-4 shrink-0 text-faint" />
            )}
            {!isRail && <span className="text-xs">{theme === "dark" ? "Mode terang" : "Mode gelap"}</span>}
          </button>

          {/* Disembunyikan selama drawer terbuka: di sana sidebar selalu penuh,
              jadi tombolnya akan mengaku "ciutkan" tanpa ada yang berubah. */}
          {!isOpen && (
            <button
              onClick={onToggleCollapsed}
              title={isRail ? "Perlebar sidebar" : "Ciutkan sidebar"}
              className={`btn-ghost ${railed}`}
            >
              {isRail ? (
                <PanelLeftOpen className="w-4 h-4 shrink-0 text-faint" />
              ) : (
                <PanelLeftClose className="w-4 h-4 shrink-0 text-faint" />
              )}
              {!isRail && <span className="text-xs">Ciutkan sidebar</span>}
            </button>
          )}
        </div>
      </aside>
    </>
  );
};
