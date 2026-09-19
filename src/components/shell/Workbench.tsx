import React from "react";
import { AlertTriangle, Bot, Check } from "lucide-react";
import type { AgentTask, ProjectSession } from "../../types";
import { isStepReachable, Step } from "../../lib/routing";
import { LayoutMode } from "../../lib/layout";
import { useT } from "../../lib/i18n";
import { useAgentRun } from "../../lib/useAgentRun";
import { useRuntimeDiscovery } from "../../lib/runtimes";
import { loadRuntimeSelection, saveRuntimeSelection, type RuntimeChatSelection } from "../../lib/runtimeChat";
import { AgentPane } from "../agent/AgentPane";
import { PipelinePane } from "./PipelinePane";
import { Splitter } from "./Splitter";

export interface WorkbenchProps {
  session: ProjectSession;
  storeError?: string | null;
  onDismissStoreError?: () => void;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onWorkspaceSelected: (workspaceRoot: string) => void | Promise<void>;
  onSelectStep: (step: Step) => void;
  onToolApplied?: () => void | Promise<void>;
  onPrepareAgentPlan?: (idea: string) => void | Promise<void>;
  layoutMode: LayoutMode;
  ratio: number;
  onLayoutModeChange: (mode: LayoutMode) => void;
  onRatioChange: (ratio: number) => void;
  onRatioCommit: (ratio: number) => void;
  onOpenConnections?: () => void;
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
  onWorkspaceSelected,
  onSelectStep,
  onToolApplied,
  onPrepareAgentPlan,
  layoutMode,
  ratio,
  onLayoutModeChange,
  onRatioChange,
  onRatioCommit,
  onOpenConnections,
}) => {
  const { t } = useT();
  const taskCount = session.tasks?.length ?? 0;
  const completedTasks = (session.tasks ?? []).filter((task) => task.status === "done").length;
  const [runningTaskId, setRunningTaskId] = React.useState<string | null>(null);
  const runtimeDiscovery = useRuntimeDiscovery(true);
  const [runtimeState, setRuntimeState] = React.useState<{ sessionId: string; selection: RuntimeChatSelection }>(() => ({
    sessionId: session.id,
    selection: loadRuntimeSelection(session.id),
  }));
  React.useEffect(() => {
    setRuntimeState({ sessionId: session.id, selection: loadRuntimeSelection(session.id) });
  }, [session.id]);
  const runtimeSelection = runtimeState.sessionId === session.id ? runtimeState.selection : loadRuntimeSelection(session.id);
  const handleRuntimeSelectionChange = React.useCallback((selection: RuntimeChatSelection) => {
    setRuntimeState({ sessionId: session.id, selection });
    saveRuntimeSelection(session.id, selection);
  }, [session.id]);
  const handleToolApplied = React.useCallback(() => {
    void onToolApplied?.();
  }, [onToolApplied]);
  const agentRun = useAgentRun({
    sessionId: session.id,
    workspaceRoot: session.workspaceRoot || "",
    allowShell: Boolean(session.allowShell),
    onToolApplied: handleToolApplied,
    runtimeSelection,
  });

  const handleRunTask = React.useCallback((task: AgentTask): void => {
    if (agentRun.busy) return;
    setRunningTaskId(task.id);
    // Di layar sempit split dipetakan App menjadi board, jadi agent dibuka
    // langsung agar klik Run tetap menghasilkan permukaan kerja yang terlihat.
    onLayoutModeChange(window.innerWidth <= 1100 ? "agent" : "split");
    const prompt = [
      `Execute task ${task.id}: ${task.title}`,
      `Target files: ${(task.targetFiles || []).join(", ") || "None"}`,
      `Dependencies: ${(task.dependencies || []).join(", ") || "None"}`,
      `Instructions:\n${task.promptInstructions}`,
      `Verification steps:\n${task.verificationSteps}`,
      "Report the implementation and verification evidence. The task remains in Review until the user accepts it as Done.",
    ].join("\n\n");

    void agentRun.send(prompt, { taskId: task.id }).finally(() => setRunningTaskId(null));
  }, [agentRun.busy, agentRun.send, onLayoutModeChange]);

  const openPipeline = (step: Step) => {
    if (!isStepReachable(step, session)) return;
    onSelectStep(step);
    onLayoutModeChange("split");
  };

  const pipelineStrip = (
    <div className="shell-context-bar shrink-0 overflow-x-auto border-t border-line bg-surface px-4 py-2.5">
      <div className="flex min-w-max items-center gap-3">
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">{t("Project context")}</span>
        <div className="flex items-center gap-1 rounded-lg bg-subtle p-0.5">
          <button type="button" aria-current="page" onClick={() => onLayoutModeChange("agent")} className="rounded-md bg-surface px-2.5 py-1.5 text-[11px] font-medium text-accent-ink shadow-elev-1">{t("Chat")}</button>
          <button type="button" onClick={() => openPipeline(2)} className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-ink">{t("PRD")}</button>
          <button type="button" onClick={() => openPipeline(3)} className="rounded-md px-2.5 py-1.5 text-[11px] font-medium text-muted hover:text-ink">{t("Kanban")} {taskCount > 0 && <span className="text-faint">{completedTasks}/{taskCount}</span>}</button>
        </div>
        <button type="button" onClick={() => openPipeline(1)} className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted hover:text-accent-ink">{session.plan ? <Check className="h-3 w-3 text-ok" /> : <span className="h-1.5 w-1.5 rounded-full bg-faint" />}{t("Plan")}</button>
      </div>
    </div>
  );

  const agentPane = (
    <div className="shell-chat-pane flex min-h-0 min-w-0 flex-col overflow-hidden bg-surface [&>aside]:!static [&>aside]:!inset-auto [&>aside]:!h-full [&>aside]:!w-full [&>aside]:!max-w-none [&>aside]:!shadow-none">
      <AgentPane
        sessionId={session.id}
        workspaceRoot={session.workspaceRoot || ""}
        allowShell={Boolean(session.allowShell)}
        onChangeWorkspace={onUpdateSession}
        onWorkspaceSelected={onWorkspaceSelected}
        onNavigatePipeline={openPipeline}
        entries={agentRun.entries}
        busy={agentRun.busy}
        error={agentRun.error}
        onSend={agentRun.send}
        onRetry={agentRun.retry}
        onDecideApproval={agentRun.decideApproval}
        onRespondQuestions={agentRun.respondQuestions}
        onStop={agentRun.stop}
        hasPlan={Boolean(session.plan)}
        onPreparePlan={onPrepareAgentPlan}
        runtimeSelection={runtimeSelection}
        runtimeReport={runtimeDiscovery.report}
        runtimePreferences={runtimeDiscovery.preferences}
        runtimeLoading={runtimeDiscovery.loading}
        onRuntimeSelectionChange={handleRuntimeSelectionChange}
        onOpenConnections={onOpenConnections}
      />
    </div>
  );

  return (
    <main className="shell-workbench flex min-h-0 flex-1 flex-col overflow-hidden bg-canvas">
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
                onSelectStep={openPipeline}
                onSelectAgent={() => onLayoutModeChange("agent")}
                onRunTask={handleRunTask}
                runningTaskId={agentRun.busy ? runningTaskId ?? "__agent_busy__" : runningTaskId}
              />
            </div>
          )}
        </div>

        {layoutMode === "agent" && (session.plan || session.prd || taskCount > 0) && pipelineStrip}

        {layoutMode === "board" && (
          <button
            type="button"
            onClick={() => onLayoutModeChange("agent")}
            className="lift absolute bottom-4 right-4 z-20 inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-xs font-medium text-ink shadow-elev-3 hover:border-accent"
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
