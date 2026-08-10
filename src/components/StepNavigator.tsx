import React, { useState } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
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
      title: "Bikin Plan",
      hint: "Klarifikasi ide, arsitektur, dan diagram logika",
      isCompleted: hasPlan,
      isAvailable: true,
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

  const handleStepClick = (step: (typeof steps)[0]) => {
    if (step.isAvailable) {
      setLockNotice(null);
      onSelectStep(step.num);
    } else {
      setLockNotice(step.unlockRequirement || "Selesaikan langkah sebelumnya terlebih dahulu.");
      setTimeout(() => setLockNotice(null), 3000);
    }
  };

  return (
    <div className="bg-white dark:bg-[#262c3b] border-b border-slate-200 dark:border-[#3f4557] sticky top-14 z-30">
      <div className="max-w-6xl mx-auto px-6 lg:px-8">
        <nav className="flex items-center gap-1 overflow-x-auto">
          {steps.map((step, idx) => {
            const isActive = currentStep === step.num;
            const isLocked = !step.isAvailable;

            return (
              <React.Fragment key={step.num}>
                <button
                  onClick={() => handleStepClick(step)}
                  title={step.hint}
                  aria-current={isActive ? "step" : undefined}
                  className={`flex items-center gap-2.5 shrink-0 py-4 px-1 border-b-2 transition-colors ${
                    isActive
                      ? "border-indigo-600 text-slate-900 dark:text-slate-100"
                      : isLocked
                        ? "border-transparent text-slate-400 dark:text-slate-500 cursor-not-allowed"
                        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-full grid place-items-center text-xs font-semibold shrink-0 ${
                      isActive
                        ? "bg-indigo-600 text-white"
                        : step.isCompleted
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 dark:ring-emerald-500/30"
                          : "bg-slate-100 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400"
                    }`}
                  >
                    {isLocked ? (
                      <Lock className="w-3 h-3" />
                    ) : step.isCompleted && !isActive ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      step.num
                    )}
                  </span>
                  <span className="text-sm font-medium whitespace-nowrap">{step.title}</span>
                </button>

                {idx < steps.length - 1 && (
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 shrink-0 mx-1" aria-hidden />
                )}
              </React.Fragment>
            );
          })}
        </nav>

        {lockNotice && (
          <div className="pb-3 pt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300">
            <Lock className="w-3.5 h-3.5 shrink-0" />
            {lockNotice}
          </div>
        )}
      </div>
    </div>
  );
};
