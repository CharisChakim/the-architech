import React, { useState, useEffect, useRef } from "react";
import { ProjectSession, SessionSummary, LLMConfig } from "../types";
import { Cpu, FolderOpen, Plus, Sparkles, Download, Layers, Trash2 } from "lucide-react";
import { SAMPLE_PROJECTS, SampleProject } from "../lib/sampleData";

interface HeaderProps {
  session: ProjectSession;
  onOpenLLMConfig: () => void;
  onNewProject: () => void;
  onSelectSample: (sample: SampleProject) => void;
  onSelectHistorySession: (id: string) => void;
  historySessions: SessionSummary[];
  onDeleteHistory: (id: string) => void;
  onOpenExport: () => void;
}

const ghostButton =
  "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors";

export const Header: React.FC<HeaderProps> = ({
  session,
  onOpenLLMConfig,
  onNewProject,
  onSelectSample,
  onSelectHistorySession,
  historySessions,
  onDeleteHistory,
  onOpenExport,
}) => {
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false);
  const [showSamplesDropdown, setShowSamplesDropdown] = useState(false);
  const actionsRef = useRef<HTMLDivElement>(null);

  // Tutup dropdown saat klik di luar area aksi header.
  useEffect(() => {
    if (!showHistoryDropdown && !showSamplesDropdown) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (actionsRef.current?.contains(event.target as Node)) return;
      setShowHistoryDropdown(false);
      setShowSamplesDropdown(false);
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showHistoryDropdown, showSamplesDropdown]);

  const engineLabel = (config: LLMConfig) => {
    const provider =
      config.provider === "ollama" ? "Ollama" : config.provider === "custom" ? "Custom" : "Gemini";
    return `${provider} · ${config.modelName}`;
  };

  const activeTitle = session.input.title || session.title;

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 h-14 flex items-center justify-between gap-6">
        {/* Brand & Active Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 rounded-lg bg-indigo-600 grid place-items-center shrink-0">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h1 className="text-sm font-semibold tracking-tight text-slate-900 truncate">AI Plan Architect</h1>
          {activeTitle && (
            <>
              <span className="hidden md:inline text-slate-300" aria-hidden>
                /
              </span>
              <span className="hidden md:inline text-sm text-slate-500 truncate">{activeTitle}</span>
            </>
          )}
        </div>

        {/* Right Actions */}
        <div ref={actionsRef} className="flex items-center gap-1 shrink-0">
          <button onClick={onOpenLLMConfig} className={ghostButton} title="Konfigurasi LLM / Ollama / Custom API">
            <Cpu className="w-4 h-4 text-slate-400" />
            <span className="hidden lg:inline text-slate-500">{engineLabel(session.llmConfig)}</span>
          </button>

          {/* Sample Templates Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSamplesDropdown(!showSamplesDropdown);
                setShowHistoryDropdown(false);
              }}
              className={ghostButton}
            >
              <Layers className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">Template</span>
            </button>

            {showSamplesDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-lg ring-1 ring-slate-200 p-1.5 z-50">
                <div className="px-2.5 py-2 text-xs font-medium text-slate-500">Mulai dari contoh proyek</div>
                {SAMPLE_PROJECTS.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => {
                      onSelectSample(sample);
                      setShowSamplesDropdown(false);
                    }}
                    className="w-full text-left px-2.5 py-2 hover:bg-slate-50 rounded-lg transition-colors"
                  >
                    <div className="text-sm font-medium text-slate-900">{sample.name}</div>
                    <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{sample.tagline}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* History Sessions Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowHistoryDropdown(!showHistoryDropdown);
                setShowSamplesDropdown(false);
              }}
              className={ghostButton}
            >
              <FolderOpen className="w-4 h-4 text-slate-400" />
              <span className="hidden sm:inline">Riwayat</span>
              {historySessions.length > 0 && (
                <span className="text-xs text-slate-400">{historySessions.length}</span>
              )}
            </button>

            {showHistoryDropdown && (
              <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg ring-1 ring-slate-200 p-1.5 z-50 max-h-96 overflow-y-auto">
                <div className="px-2.5 py-2 text-xs font-medium text-slate-500">Proyek tersimpan</div>
                {historySessions.length === 0 ? (
                  <p className="px-2.5 py-6 text-center text-sm text-slate-400">Belum ada proyek tersimpan.</p>
                ) : (
                  historySessions.map((hist) => (
                    <div
                      key={hist.id}
                      className="flex items-center gap-2 px-2.5 py-2 hover:bg-slate-50 rounded-lg group transition-colors"
                    >
                      <button
                        onClick={() => {
                          onSelectHistorySession(hist.id);
                          setShowHistoryDropdown(false);
                        }}
                        className="text-left flex-1 min-w-0"
                      >
                        <div className="text-sm font-medium text-slate-900 truncate">
                          {hist.title || "Proyek Tanpa Judul"}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">
                          {new Date(hist.updatedAt).toLocaleDateString()} · Step {hist.currentStep} dari 3
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteHistory(hist.id);
                        }}
                        className="p-1.5 text-slate-300 hover:text-rose-600 rounded-lg transition-colors shrink-0"
                        title="Hapus dari riwayat"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {(session.plan || session.prd || session.tasks) && (
            <button onClick={onOpenExport} className={ghostButton} title="Export bundle dokumen & task">
              <Download className="w-4 h-4 text-slate-400" />
              <span className="hidden md:inline">Export</span>
            </button>
          )}

          <button
            onClick={onNewProject}
            className="ml-1 flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Proyek Baru</span>
          </button>
        </div>
      </div>
    </header>
  );
};
