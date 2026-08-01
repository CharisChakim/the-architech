import React, { useState, useEffect, useRef } from "react";
import { ProjectSession, SessionSummary, LLMConfig } from "./types";
import {
  createEmptySession,
  loadSavedLLMConfig,
  saveLLMConfig,
  loadActiveSessionId,
  saveActiveSessionId,
} from "./lib/localStorage";
import { fetchSessionList, fetchSession, persistSession, removeSession } from "./lib/sessionStore";
import { Theme, loadTheme, saveTheme, applyTheme } from "./lib/theme";
import { SampleProject } from "./lib/sampleData";
import { Header } from "./components/Header";
import { StepNavigator } from "./components/StepNavigator";
import { Step1Plan } from "./components/Step1Plan";
import { Step2PRD } from "./components/Step2PRD";
import { Step3AgentTasks } from "./components/Step3AgentTasks";
import { LLMConfigModal } from "./components/LLMConfigModal";
import { ExportModal } from "./components/ExportModal";
import { Cpu, Database, AlertTriangle, RefreshCw } from "lucide-react";

export default function App() {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [historySessions, setHistorySessions] = useState<SessionSummary[]>([]);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  // Snapshot of what the store already holds, so hydrating a session does not
  // immediately write it back (which would reorder history just by opening it).
  const lastPersistedRef = useRef<string | null>(null);

  const applySession = (next: ProjectSession, markAsPersisted: boolean) => {
    if (markAsPersisted) lastPersistedRef.current = JSON.stringify(next);
    setSession(next);
    saveActiveSessionId(next.id);
  };

  const refreshHistory = () =>
    fetchSessionList()
      .then(setHistorySessions)
      .catch((err: Error) => setStoreError(err.message));

  // Initial hydration: LLM config from localStorage, session content from SQLite.
  useEffect(() => {
    let cancelled = false;
    const llmConfig = loadSavedLLMConfig();
    const activeId = loadActiveSessionId();

    const hydrate = async () => {
      try {
        const list = await fetchSessionList();
        if (cancelled) return;
        setHistorySessions(list);

        const restored = activeId ? await fetchSession(activeId, llmConfig) : null;
        if (cancelled) return;
        applySession(restored ?? createEmptySession(llmConfig), Boolean(restored));
      } catch (err: any) {
        if (cancelled) return;
        setStoreError(err.message || "Gagal menghubungi penyimpanan riwayat.");
        applySession(createEmptySession(llmConfig), false);
      }
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist every change back to SQLite. Untitled drafts stay out of history.
  useEffect(() => {
    if (!session) return;
    const snapshot = JSON.stringify(session);
    if (snapshot === lastPersistedRef.current) return;
    lastPersistedRef.current = snapshot;
    if (!session.input.title && !session.title) return;

    persistSession(session)
      .then(refreshHistory)
      .catch((err: Error) => setStoreError(err.message));
  }, [session]);

  const handleUpdateSession = (updatedFields: Partial<ProjectSession>) => {
    setSession((prev) =>
      prev
        ? {
            ...prev,
            ...updatedFields,
            updatedAt: new Date().toISOString(),
          }
        : prev
    );
  };

  const handleSelectStep = (step: 1 | 2 | 3) => {
    handleUpdateSession({ currentStep: step });
  };

  const handleNewProject = () => {
    if (!session) return;
    applySession(createEmptySession(session.llmConfig), false);
  };

  const handleSelectSample = (sample: SampleProject) => {
    if (!session) return;
    applySession(
      {
        ...createEmptySession(session.llmConfig),
        title: sample.input.title,
        input: sample.input,
      },
      false
    );
  };

  const handleSelectHistorySession = async (id: string) => {
    if (!session) return;
    try {
      const loaded = await fetchSession(id, session.llmConfig);
      if (!loaded) {
        setStoreError("Sesi proyek tidak ditemukan lagi di penyimpanan.");
        await refreshHistory();
        return;
      }
      applySession(loaded, true);
    } catch (err: any) {
      setStoreError(err.message || "Gagal membuka sesi proyek.");
    }
  };

  const handleDeleteHistory = async (id: string) => {
    try {
      await removeSession(id);
      await refreshHistory();
      if (session?.id === id) {
        applySession(createEmptySession(session.llmConfig), false);
      }
    } catch (err: any) {
      setStoreError(err.message || "Gagal menghapus sesi proyek.");
    }
  };

  const handleSaveLLMConfig = (newConfig: LLMConfig) => {
    saveLLMConfig(newConfig);
    handleUpdateSession({ llmConfig: newConfig });
  };

  if (!session) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-[#1e2331] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600 dark:text-indigo-300" />
          Memuat riwayat proyek...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#1e2331] text-sm text-slate-900 dark:text-slate-100 font-sans antialiased flex flex-col selection:bg-indigo-500 selection:text-white">
      {/* Top Header */}
      <Header
        session={session}
        onOpenLLMConfig={() => setIsLLMModalOpen(true)}
        onNewProject={handleNewProject}
        onSelectSample={handleSelectSample}
        onSelectHistorySession={handleSelectHistorySession}
        historySessions={historySessions}
        onDeleteHistory={handleDeleteHistory}
        onOpenExport={() => setIsExportModalOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
      />

      {/* Interactive 3-Step Pipeline Navigator */}
      <StepNavigator session={session} onSelectStep={handleSelectStep} />

      {/* Main Container */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-6 lg:px-8 py-10">
        {storeError && (
          <div className="mb-8 p-4 bg-amber-50 dark:bg-amber-500/10 rounded-xl ring-1 ring-amber-200 dark:ring-amber-500/30 text-amber-900 dark:text-amber-200 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-medium">Penyimpanan riwayat bermasalah</p>
              <p className="text-amber-800 dark:text-amber-300 mt-0.5">{storeError}</p>
            </div>
            <button
              onClick={() => setStoreError(null)}
              className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 font-medium shrink-0"
            >
              Tutup
            </button>
          </div>
        )}

        {session.currentStep === 1 && (
          <Step1Plan
            session={session}
            onUpdateSession={handleUpdateSession}
            onGoToNextStep={() => handleSelectStep(2)}
          />
        )}

        {session.currentStep === 2 && (
          <Step2PRD
            session={session}
            onUpdateSession={handleUpdateSession}
            onGoToNextStep={() => handleSelectStep(3)}
          />
        )}

        {session.currentStep === 3 && (
          <Step3AgentTasks
            session={session}
            onUpdateSession={handleUpdateSession}
          />
        )}
      </main>

      {/* Modals */}
      <LLMConfigModal
        isOpen={isLLMModalOpen}
        onClose={() => setIsLLMModalOpen(false)}
        config={session.llmConfig}
        onSave={handleSaveLLMConfig}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        session={session}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-[#3f4557] text-xs text-slate-500 dark:text-slate-400 py-6 mt-16">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 flex flex-wrap items-center justify-between gap-3">
          <span>Perencanaan → PRD → Task Agent</span>
          <div className="flex items-center gap-5">
            <button
              onClick={() => setIsLLMModalOpen(true)}
              className="flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              <Cpu className="w-3.5 h-3.5" />
              {session.llmConfig.provider} · {session.llmConfig.modelName || "model bawaan"}
            </button>
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5" />
              {historySessions.length} proyek tersimpan
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
