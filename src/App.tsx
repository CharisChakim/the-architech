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
import { SampleProject } from "./lib/sampleData";
import { Header } from "./components/Header";
import { StepNavigator } from "./components/StepNavigator";
import { Step1Plan } from "./components/Step1Plan";
import { Step2PRD } from "./components/Step2PRD";
import { Step3AgentTasks } from "./components/Step3AgentTasks";
import { LLMConfigModal } from "./components/LLMConfigModal";
import { ExportModal } from "./components/ExportModal";
import { Sparkles, Cpu, Database, AlertTriangle, RefreshCw } from "lucide-react";

export default function App() {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [historySessions, setHistorySessions] = useState<SessionSummary[]>([]);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

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
      <div className="min-h-screen bg-slate-100/70 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-600 text-sm">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-600" />
          Memuat riwayat proyek...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans antialiased flex flex-col selection:bg-indigo-500 selection:text-white">
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
      />

      {/* Interactive 3-Step Pipeline Navigator */}
      <StepNavigator session={session} onSelectStep={handleSelectStep} />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {storeError && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl text-xs flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <strong className="font-semibold block mb-0.5">Penyimpanan riwayat bermasalah:</strong>
              {storeError}
            </div>
            <button
              onClick={() => setStoreError(null)}
              className="text-amber-700 hover:text-amber-900 font-semibold shrink-0"
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
      <footer className="bg-slate-900 text-slate-400 border-t border-slate-800 text-xs py-6 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <span className="font-semibold text-slate-200">AI Plan Architect</span>
            <span>• Workflow: Perencanaan ➔ PRD ➔ Task Agent</span>
          </div>

          <div className="flex items-center gap-4 text-[11px]">
            <button
              onClick={() => setIsLLMModalOpen(true)}
              className="hover:text-indigo-300 transition-colors flex items-center gap-1"
            >
              <Cpu className="w-3.5 h-3.5" />
              Engine: {session.llmConfig.provider.toUpperCase()} ({session.llmConfig.modelName})
            </button>
            <span className="flex items-center gap-1 text-emerald-400">
              <Database className="w-3.5 h-3.5" /> Riwayat: SQLite ({historySessions.length} proyek)
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
