import React, { useState } from "react";
import { Compass, FileText, CheckCircle2, ArrowRight, Bot, Lock } from "lucide-react";
import { ProjectSession } from "../types";

interface StepNavigatorProps {
  session: ProjectSession;
  onSelectStep: (step: 1 | 2 | 3) => void;
}

export const StepNavigator: React.FC<StepNavigatorProps> = ({ session, onSelectStep }) => {
  const currentStep = session.currentStep;

  const hasPlan = Boolean(session.plan);
  const hasPrd = Boolean(session.prd);
  const hasTasks = Boolean(session.tasks && session.tasks.length > 0);

  const [lockNotice, setLockNotice] = useState<string | null>(null);

  const steps = [
    {
      num: 1 as const,
      title: "1. Bikin Plan",
      subtitle: "Klarifikasi Ide & Spec Arsitektur",
      icon: Compass,
      isCompleted: hasPlan,
      isAvailable: true,
    },
    {
      num: 2 as const,
      title: "2. Bikin PRD",
      subtitle: "7 Poin Spesifikasi & Diagram Horizontal",
      icon: FileText,
      isCompleted: hasPrd,
      isAvailable: hasPlan, // Must complete Step 1 first
      unlockRequirement: "Selesaikan Step 1 (Bikin Plan) terlebih dahulu",
    },
    {
      num: 3 as const,
      title: "3. Task AI Agent",
      subtitle: "Kanban Board & Smart Prompts",
      icon: Bot,
      isCompleted: hasTasks,
      isAvailable: hasPrd, // Must complete Step 2 first
      unlockRequirement: "Selesaikan Step 2 (Bikin PRD) terlebih dahulu",
    },
  ];

  const handleStepClick = (step: typeof steps[0]) => {
    if (step.isAvailable) {
      setLockNotice(null);
      onSelectStep(step.num);
    } else {
      setLockNotice(step.unlockRequirement || "Selesaikan langkah sebelumnya terlebih dahulu.");
      setTimeout(() => setLockNotice(null), 3000);
    }
  };

  return (
    <div className="bg-slate-900 border-b border-slate-800 sticky top-16 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {lockNotice && (
          <div className="mb-2 p-2.5 bg-amber-500/20 border border-amber-500/40 text-amber-200 rounded-xl text-xs flex items-center gap-2 animate-in fade-in">
            <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{lockNotice}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            const isActive = currentStep === step.num;
            const isLocked = !step.isAvailable;

            return (
              <button
                key={step.num}
                onClick={() => handleStepClick(step)}
                className={`relative text-left p-3.5 rounded-2xl border transition-all flex items-center justify-between gap-3 group ${
                  isActive
                    ? "bg-indigo-600 text-white border-indigo-500 shadow-lg ring-2 ring-indigo-500/30"
                    : step.isCompleted
                    ? "bg-slate-800/80 border-slate-700 text-slate-100 hover:bg-slate-800"
                    : isLocked
                    ? "bg-slate-900/50 border-slate-800/80 text-slate-500 cursor-not-allowed opacity-75"
                    : "bg-slate-900 border-slate-800 text-slate-300 hover:bg-slate-800/50"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 transition-colors ${
                      isActive
                        ? "bg-white/20 text-white"
                        : step.isCompleted
                        ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                        : isLocked
                        ? "bg-slate-800 text-slate-600"
                        : "bg-slate-800 text-slate-400"
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-4 h-4 text-slate-500" />
                    ) : step.isCompleted && !isActive ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-xs sm:text-sm tracking-tight truncate">{step.title}</h3>
                      {step.isCompleted && (
                        <span
                          className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                            isActive ? "bg-white/20 text-white" : "bg-emerald-500/20 text-emerald-300"
                          }`}
                        >
                          Selesai
                        </span>
                      )}
                      {isLocked && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-slate-800 text-slate-500 border border-slate-700/50">
                          Terkunci
                        </span>
                      )}
                    </div>
                    <p className={`text-[11px] truncate mt-0.5 ${isActive ? "text-indigo-100" : isLocked ? "text-slate-600" : "text-slate-400"}`}>
                      {step.subtitle}
                    </p>
                  </div>
                </div>

                {idx < steps.length - 1 && (
                  <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 z-10 pointer-events-none">
                    <div className="w-6 h-6 rounded-full bg-slate-800 border border-slate-700 shadow-xs flex items-center justify-center text-slate-400">
                      <ArrowRight className="w-3 h-3" />
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
