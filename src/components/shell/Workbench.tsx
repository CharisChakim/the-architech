import React from "react";
import { AlertTriangle, Bot, Check } from "lucide-react";
import { ProjectSession } from "../../types";
import { SampleProject } from "../../lib/sampleData";
import { isStepReachable, Step } from "../../lib/routing";
import { LayoutMode } from "../../lib/layout";
import { useT } from "../../lib/i18n";
import { useAgentRun } from "../../lib/useAgentRun";
import { AgentPane } from "../agent/AgentPane";
import { PipelinePane } from "./PipelinePane";
import { Splitter } from "./Splitter";

export interface WorkbenchProps {
  session: ProjectSession;
  storeError?: string | null;
  onDismissStoreError?: () => void;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onSelectStep: (step: Step) => void;
  onSelectSample: (sample: SampleProject) => void;
  onToolApplied?: () => void | Promise<void>;
  layoutMode: LayoutMode;
  ratio: number;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onRatioChange: (ratio: number) => void;
  onRatioCommit: (ratio: number) => void;
}

const stepLabel = (step: Step, t: ReturnType<typeof useT>["t"]): string => {
  if (step === 1) return t("Plan");
  if (step === 2) return t("PRD");
  return t("Send to Agent");
};

export const Workbench: React.FC<WorkbenchProps> = ({
  session,
  storeError,
  onDismissStoreError,
  onUpdateSession,
  onSelectStep,
  onSelectSample,
  onToolApplied,
  layoutMode,
  ratio,
  onLayoutModeChange,
  onRatioChange,
  onRatioCommit,
}) => {
  const { t } = useT();
  const taskCount = session.tasks?.length ?? 0;
  const completedTasks = (session.tasks ?? []).filter((task) => task.status === "done").length;
  const handleToolApplied = React.useCallback(() => {
    void onToolApplied?.();
  }, [onToolApplied]);
  const agentRun = useAgentRun({
    sessionId: session.id,
    workspaceRoot: session.workspaceRoot || "",
    llmConfig: session.llmConfig,
    onToolApplied: handleToolApplied,
  });

  const openPipeline = (step: Step) => {
    if (!isStepReachable(step, session)) return;
    onSelectStep(step);
    onLayoutModeChange("split");
  };

  const pipelineStrip = (
    <div className="shrink-0 overflow-x-auto border-t border-line bg-surface px-3 py-2">
      <div className="flex min-w-max items-center justify-center gap-1.5">
        {([1, 2, 3] as Step[]).map((step) => {
          const reachable = isStepReachable(step, session);
          const completed = step === 1 ? Boolean(session.plan) : step === 2 ? Boolean(session.prd) : taskCount > 0;
          const label = step === 3
            ? `${stepLabel(step, t)} ${taskCount ? `${completedTasks}/${taskCount}` : ""}`.trim()
            : stepLabel(step, t);
          return (
            <button
              key={step}
              type="button"
              disabled={!reachable}
              onClick={() => openPipeline(step)}
              title={!reachable ? (step === 2 ? t("Finish step 1 (Plan) first") : t("Finish step 2 (PRD) first")) : undefined}
              className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
                reachable ? "border-line text-muted hover:border-accent hover:text-accent-ink" : "cursor-not-allowed border-line text-faint"
              }`}
            >
              {completed ? <Check className="h-3 w-3 text-ok" /> : <span className="h-1.5 w-1.5 rounded-full bg-faint" />}
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );

  const agentPane = (
    <div className="flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface [&>aside]:!static [&>aside]:!inset-auto [&>aside]:!h-full [&>aside]:!w-full [&>aside]:!max-w-none [&>aside]:!shadow-none">
      <AgentPane
        workspaceRoot={session.workspaceRoot || ""}
        allowShell={Boolean(session.allowShell)}
        onChangeWorkspace={onUpdateSession}
        onNavigatePipeline={openPipeline}
        entries={agentRun.entries}
        busy={agentRun.busy}
        error={agentRun.error}
        onSend={agentRun.send}
        onRetry={agentRun.retry}
        onDecideApproval={agentRun.decideApproval}
        onStop={agentRun.stop}
      />
    </div>
  );

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
      {storeError && (
        <div className="mx-4 mt-4 flex shrink-0 items-start gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-warn-ink lg:mx-8">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-medium">{t("Project storage is not responding")}</p>
            <p className="mt-0.5 opacity-80">{storeError}</p>
          </div>
          {onDismissStoreError && (
            <button type="button" onClick={onDismissStoreError} className="shrink-0 text-xs font-medium hover:underline">
              {t("Dismiss")}
            </button>
          )}
        </div>
      )}

      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
          <div
            className={`min-h-0 min-w-0 ${layoutMode === "board" ? "hidden" : ""}`}
            style={{ width: layoutMode === "split" ? `${ratio * 100}%` : "100%" }}
          >
              {agentPane}
          </div>

          {layoutMode === "split" && <Splitter ratio={ratio} onRatioChange={onRatioChange} onCommit={onRatioCommit} />}

          {layoutMode !== "agent" && (
            <div className="min-h-0 min-w-0 flex-1" style={{ width: layoutMode === "split" ? `${(1 - ratio) * 100}%` : "100%" }}>
              <PipelinePane
                step={session.currentStep}
                session={session}
                onUpdateSession={onUpdateSession}
                onGoToNextStep={() => onSelectStep(session.currentStep === 3 ? 3 : (session.currentStep + 1) as Step)}
                onSelectSample={onSelectSample}
                onSelectStep={openPipeline}
              />
            </div>
          )}
        </div>

        {layoutMode === "agent" && pipelineStrip}

        {layoutMode === "board" && (
          <button
            type="button"
            onClick={() => onLayoutModeChange("agent")}
            className="absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium text-ink shadow-lg hover:border-accent"
          >
            <Bot className="h-3.5 w-3.5 text-accent" />
            {t("Agent")} · {completedTasks} {t("In progress")}
          </button>
        )}
      </div>
    </main>
  );
};

export default Workbench;
