import React, { useState, useEffect, useRef } from "react";
import { ProjectSession, SessionSummary, LLMConfig } from "./types";
import {
  createEmptySession,
  loadSavedLLMConfig,
  saveLLMConfig,
  loadActiveSessionId,
  saveActiveSessionId,
  loadSidebarCollapsed,
  saveSidebarCollapsed,
} from "./lib/localStorage";
import { fetchSessionList, fetchSession, persistSession, removeSession } from "./lib/sessionStore";
import { Theme, loadTheme, saveTheme, applyTheme } from "./lib/theme";
import { SampleProject } from "./lib/sampleData";
import { Sidebar } from "./components/Sidebar";
import { Topbar } from "./components/Topbar";
import { Step1Plan } from "./components/Step1Plan";
import { Step2PRD } from "./components/Step2PRD";
import { Step3AgentTasks } from "./components/Step3AgentTasks";
import { LLMConfigModal } from "./components/LLMConfigModal";
import { ExportModal } from "./components/ExportModal";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function App() {
  const [session, setSession] = useState<ProjectSession | null>(null);
  const [historySessions, setHistorySessions] = useState<SessionSummary[]>([]);
  const [storeError, setStoreError] = useState<string | null>(null);

  const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(loadSidebarCollapsed);
  const [theme, setTheme] = useState<Theme>(loadTheme);

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      saveSidebarCollapsed(!prev);
      return !prev;
    });
  };

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
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-muted">
          <RefreshCw className="w-4 h-4 animate-spin text-accent" />
          Memuat riwayat proyek...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas text-sm text-ink font-sans antialiased flex selection:bg-accent selection:text-accent-fg">
      <Sidebar
        session={session}
        historySessions={historySessions}
        onSelectStep={handleSelectStep}
        onNewProject={handleNewProject}
        onSelectSample={handleSelectSample}
        onSelectHistorySession={handleSelectHistorySession}
        onDeleteHistory={handleDeleteHistory}
        onOpenLLMConfig={() => setIsLLMModalOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        collapsed={isSidebarCollapsed}
        onToggleCollapsed={toggleSidebarCollapsed}
      />

      {/* min-w-0 supaya kanvas dan tabel lebar di dalamnya menggulung sendiri,
          bukan melebarkan seluruh kolom dan mendorong sidebar keluar layar. */}
      <div className="flex-1 min-w-0 flex flex-col">
        <Topbar
          session={session}
          onOpenMenu={() => setIsSidebarOpen(true)}
          onOpenExport={() => setIsExportModalOpen(true)}
        />

        <main className="flex-1 px-4 lg:px-8 py-8">
          {storeError && (
            <div className="mb-6 p-4 bg-warn-soft border border-warn/30 rounded-xl text-warn-ink flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">Penyimpanan riwayat bermasalah</p>
                <p className="opacity-80 mt-0.5">{storeError}</p>
              </div>
              <button
                onClick={() => setStoreError(null)}
                className="text-xs font-medium shrink-0 hover:underline"
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
            <Step3AgentTasks session={session} onUpdateSession={handleUpdateSession} />
          )}
        </main>
      </div>

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
    </div>
  );
}
