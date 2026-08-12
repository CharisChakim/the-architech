import React, { useState, useEffect, useRef, useMemo } from "react";
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
import { Language, loadLanguage, saveLanguage, makeT, LanguageProvider } from "./lib/i18n";
import { STEP_PATHS, pathToStep, isStepReachable, Step } from "./lib/routing";
import { SampleProject, sampleText } from "./lib/sampleData";
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
  const [lang, setLang] = useState<Language>(loadLanguage);

  // App ikut memakai t untuk teksnya sendiri, jadi fungsinya dibuat di sini dan
  // nilai yang sama diteruskan ke provider — sebuah komponen tidak bisa membaca
  // context yang ia sediakan sendiri.
  const t = useMemo(() => makeT(lang), [lang]);

  const toggleSidebarCollapsed = () => {
    setIsSidebarCollapsed((prev) => {
      saveSidebarCollapsed(!prev);
      return !prev;
    });
  };

  const toggleLanguage = () => {
    setLang((prev) => {
      const next = prev === "en" ? "id" : "en";
      saveLanguage(next);
      return next;
    });
  };

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  // Dipakai pembaca layar untuk memilih pelafalan, dan browser untuk tawaran
  // terjemahan otomatis.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  // Snapshot of what the store already holds, so hydrating a session does not
  // immediately write it back (which would reorder history just by opening it).
  const lastPersistedRef = useRef<string | null>(null);

  // Sekali saja saat sesi pertama termuat: kalau URL menunjuk langkah lain dan
  // langkah itu memang boleh dibuka, URL yang menang — itu gunanya alamat bisa
  // disimpan. Setelah itu arahnya berbalik: URL yang mengikuti langkah aktif.
  const urlSynced = useRef(false);

  useEffect(() => {
    if (!session || urlSynced.current) return;
    urlSynced.current = true;

    const fromUrl = pathToStep(window.location.pathname);
    if (fromUrl && fromUrl !== session.currentStep && isStepReachable(fromUrl, session)) {
      handleUpdateSession({ currentStep: fromUrl });
    } else {
      window.history.replaceState({}, "", STEP_PATHS[session.currentStep]);
    }
  }, [session]);

  useEffect(() => {
    if (!session || !urlSynced.current) return;
    const path = STEP_PATHS[session.currentStep];
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
  }, [session?.currentStep]);

  // Tombol back/forward browser. setSession dipakai langsung, bukan
  // handleUpdateSession, supaya sekadar menavigasi tidak menaikkan updatedAt
  // dan mengacak urutan riwayat.
  useEffect(() => {
    const handlePopState = () => {
      const step = pathToStep(window.location.pathname);
      if (!step) return;
      setSession((prev) => (prev && isStepReachable(step, prev) ? { ...prev, currentStep: step } : prev));
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

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
        setStoreError(err.message || t("Could not reach project storage."));
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

  const handleSelectStep = (step: Step) => {
    handleUpdateSession({ currentStep: step });
  };


  const handleNewProject = () => {
    if (!session) return;
    applySession(createEmptySession(session.llmConfig), false);
  };

  const handleSelectSample = (sample: SampleProject) => {
    if (!session) return;
    const { input } = sampleText(sample, lang);
    applySession(
      {
        ...createEmptySession(session.llmConfig),
        title: input.title,
        input,
      },
      false
    );
  };

  const handleSelectHistorySession = async (id: string) => {
    if (!session) return;
    try {
      const loaded = await fetchSession(id, session.llmConfig);
      if (!loaded) {
        setStoreError(t("That project session no longer exists in storage."));
        await refreshHistory();
        return;
      }
      applySession(loaded, true);
    } catch (err: any) {
      setStoreError(err.message || t("Failed to open the project session."));
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
      setStoreError(err.message || t("Failed to delete the project session."));
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
          {t("Loading project history...")}
        </div>
      </div>
    );
  }

  return (
    <LanguageProvider value={{ lang, t }}>
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
        onToggleLanguage={toggleLanguage}
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
                <p className="font-medium">{t("Project storage is not responding")}</p>
                <p className="opacity-80 mt-0.5">{storeError}</p>
              </div>
              <button
                onClick={() => setStoreError(null)}
                className="text-xs font-medium shrink-0 hover:underline"
              >
                {t("Dismiss")}
              </button>
            </div>
          )}

          {session.currentStep === 1 && (
            <Step1Plan
              session={session}
              onUpdateSession={handleUpdateSession}
              onGoToNextStep={() => handleSelectStep(2)}
              onSelectSample={handleSelectSample}
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
    </LanguageProvider>
  );
}
