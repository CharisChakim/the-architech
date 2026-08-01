import React, { useState, useEffect } from "react";
import { ProjectSession, LLMConfig } from "./types";
import {
  loadActiveSession,
  saveActiveSession,
  loadHistorySessions,
  deleteSessionFromHistory,
  DEFAULT_PROJECT_SESSION,
  saveLLMConfig,
} from "./lib/localStorage";
import { SampleProject } from "./lib/sampleData";
import { Header } from "./components/Header";
import { StepNavigator } from "./components/StepNavigator";
import { Step1Plan } from "./components/Step1Plan";
import { Step2PRD } from "./components/Step2PRD";
import { Step3AgentTasks } from "./components/Step3AgentTasks";
import { LLMConfigModal } from "./components/LLMConfigModal";
import { ExportModal } from "./components/ExportModal";
import { Sparkles, Cpu, ShieldCheck } from "lucide-react";

export default function App() {
  const [session, setSession] = useState<ProjectSession>(() => loadActiveSession());
  const [historySessions, setHistorySessions] = useState<ProjectSession[]>(() => loadHistorySessions());

  const [isLLMModalOpen, setIsLLMModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Sync session changes to localStorage
  useEffect(() => {
    saveActiveSession(session);
    setHistorySessions(loadHistorySessions());
  }, [session]);

  const handleUpdateSession = (updatedFields: Partial<ProjectSession>) => {
    setSession((prev) => ({
      ...prev,
      ...updatedFields,
      updatedAt: new Date().toISOString(),
    }));
  };

  const handleSelectStep = (step: 1 | 2 | 3) => {
    handleUpdateSession({ currentStep: step });
  };

  const handleNewProject = () => {
    const newSession: ProjectSession = {
      ...DEFAULT_PROJECT_SESSION,
      id: "session_" + Date.now(),
      llmConfig: session.llmConfig,
    };
    setSession(newSession);
  };

  const handleSelectSample = (sample: SampleProject) => {
    const newSession: ProjectSession = {
      id: "session_" + Date.now(),
      title: sample.input.title,
      updatedAt: new Date().toISOString(),
      llmConfig: session.llmConfig,
      input: sample.input,
      followUps: [],
      currentStep: 1,
    };
    setSession(newSession);
  };

  const handleSelectHistorySession = (selected: ProjectSession) => {
    setSession(selected);
  };

  const handleDeleteHistory = (id: string) => {
    const updated = deleteSessionFromHistory(id);
    setHistorySessions(updated);
  };

  const handleSaveLLMConfig = (newConfig: LLMConfig) => {
    saveLLMConfig(newConfig);
    handleUpdateSession({ llmConfig: newConfig });
  };

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
              <ShieldCheck className="w-3.5 h-3.5" /> Server-side Gemini Ready
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
