import React, { useState, useEffect, useRef } from "react";
import { ProjectSession, SessionSummary, LLMConfig } from "../types";
import { Cpu, Settings, FolderOpen, Plus, Sparkles, Download, Layers, Check, Trash2 } from "lucide-react";
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

  const getProviderBadge = (config: LLMConfig) => {
    if (config.provider === "ollama") return { name: `Ollama (${config.modelName})`, color: "bg-slate-800 text-slate-200" };
    if (config.provider === "custom") return { name: `Custom (${config.modelName})`, color: "bg-purple-900/80 text-purple-200" };
    return { name: `Gemini (${config.modelName || "3.6-flash"})`, color: "bg-indigo-950 text-indigo-200" };
  };

  const badge = getProviderBadge(session.llmConfig);

  return (
    <header className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-40 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Active Title */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 shrink-0 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white truncate">AI Plan Architect</h1>
            </div>
            <p className="text-xs text-slate-400 truncate">
              {session.input.title || session.title ? (
                <span className="text-indigo-200 font-medium">{session.input.title || session.title}</span>
              ) : (
                "Perancangan Proyek, PRD & Task Agent"
              )}
            </p>
          </div>
        </div>

        {/* Right Actions */}
        <div ref={actionsRef} className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* LLM Engine Indicator */}
          <button
            onClick={onOpenLLMConfig}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/90 hover:bg-slate-800 border border-slate-700/80 rounded-xl text-xs font-medium transition-all group"
            title="Konfigurasi LLM / Ollama / Custom API"
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400 group-hover:rotate-45 transition-transform duration-300" />
            <span className={`px-1.5 py-0.5 rounded text-[11px] font-mono font-semibold ${badge.color}`}>
              {badge.name}
            </span>
            <Settings className="w-3.5 h-3.5 text-slate-400 group-hover:text-white" />
          </button>

          {/* Sample Templates Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setShowSamplesDropdown(!showSamplesDropdown);
                setShowHistoryDropdown(false);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium transition-all"
            >
              <Layers className="w-3.5 h-3.5 text-cyan-400" />
              <span className="hidden sm:inline">Contoh Template</span>
            </button>

            {showSamplesDropdown && (
              <div className="absolute right-0 mt-2 w-72 bg-slate-900 border border-slate-700 rounded-2xl shadow-sm p-2 z-50 text-xs">
                <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1">
                  Pilih Contoh Proyek Cepat
                </div>
                {SAMPLE_PROJECTS.map((sample) => (
                  <button
                    key={sample.id}
                    onClick={() => {
                      onSelectSample(sample);
                      setShowSamplesDropdown(false);
                    }}
                    className="w-full text-left p-2.5 hover:bg-slate-800 rounded-xl transition-all group"
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="font-semibold text-white group-hover:text-indigo-300 transition-colors">
                        {sample.name}
                      </span>
                      <span className="text-[10px] bg-slate-800 border border-slate-700 text-slate-300 px-1.5 py-0.5 rounded">
                        {sample.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 line-clamp-1">{sample.tagline}</p>
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
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-xs font-medium transition-all"
            >
              <FolderOpen className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Riwayat Proyek</span>
              {historySessions.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 bg-emerald-500/20 text-emerald-300 text-[10px] font-bold rounded-full">
                  {historySessions.length}
                </span>
              )}
            </button>

            {showHistoryDropdown && (
              <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-2xl shadow-sm p-2 z-50 text-xs max-h-96 overflow-y-auto">
                <div className="px-3 py-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-800 mb-1 flex items-center justify-between">
                  <span>Daftar Proyek Tersimpan</span>
                  <span>{historySessions.length} Item</span>
                </div>
                {historySessions.length === 0 ? (
                  <div className="p-4 text-center text-slate-500 text-xs">Belum ada riwayat proyek tersimpan.</div>
                ) : (
                  historySessions.map((hist) => (
                    <div key={hist.id} className="flex items-center justify-between p-2 hover:bg-slate-800 rounded-xl group transition-all">
                      <button
                        onClick={() => {
                          onSelectHistorySession(hist.id);
                          setShowHistoryDropdown(false);
                        }}
                        className="text-left flex-1 min-w-0 pr-2"
                      >
                        <div className="font-semibold text-white group-hover:text-indigo-300 truncate">
                          {hist.title || "Proyek Tanpa Judul"}
                        </div>
                        <div className="text-[10px] text-slate-400 flex items-center gap-2">
                          <span>{new Date(hist.updatedAt).toLocaleDateString()}</span>
                          <span>• Step {hist.currentStep}/3</span>
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteHistory(hist.id);
                        }}
                        className="p-1.5 text-slate-500 hover:text-rose-400 hover:bg-slate-700/50 rounded-lg transition-all"
                        title="Hapus dari riwayat"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Export Bundle Button */}
          {(session.plan || session.prd || session.tasks) && (
            <button
              onClick={onOpenExport}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600/80 hover:bg-indigo-600 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
              title="Export Bundle Dokumen & Task"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Export Bundle</span>
            </button>
          )}

          {/* New Project */}
          <button
            onClick={onNewProject}
            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
            title="Mulai Proyek Baru"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Proyek Baru</span>
          </button>
        </div>
      </div>
    </header>
  );
};
