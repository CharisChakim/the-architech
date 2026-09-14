import React, { Suspense } from "react";
import { Check, Lock } from "lucide-react";
import { ProjectSession } from "../../types";
import { SampleProject } from "../../lib/sampleData";
import { isStepReachable, STEP_PATHS, Step } from "../../lib/routing";
import { useT } from "../../lib/i18n";

const Step1Plan = React.lazy(() =>
  import("../Step1Plan").then((module) => ({ default: module.Step1Plan }))
);
const Step2PRD = React.lazy(() => import("../Step2PRD").then((module) => ({ default: module.Step2PRD })));
const Step3AgentTasks = React.lazy(() =>
  import("../Step3AgentTasks").then((module) => ({ default: module.Step3AgentTasks }))
);

export interface PipelinePaneProps {
  step: Step;
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onGoToNextStep: () => void;
  onSelectSample: (sample: SampleProject) => void;
  onSelectStep: (step: Step) => void;
}

const tabs: { step: Step; label: string; path: string }[] = [
  { step: 1, label: "Plan", path: STEP_PATHS[1] },
  { step: 2, label: "PRD", path: STEP_PATHS[2] },
  { step: 3, label: "Tasks", path: STEP_PATHS[3] },
];

export const PaneSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse" aria-label="Loading pipeline step">
    <div className="h-8 w-2/5 rounded-lg bg-subtle" />
    <div className="h-4 w-4/5 rounded bg-subtle" />
    <div className="h-4 w-3/5 rounded bg-subtle" />
    <div className="grid gap-4 @2xl/pane:grid-cols-2">
      <div className="h-36 rounded-xl border border-line bg-subtle" />
      <div className="h-36 rounded-xl border border-line bg-subtle" />
    </div>
  </div>
);

interface TabStripProps {
  step: Step;
  session: ProjectSession;
  onSelectStep: (step: Step) => void;
}

export const TabStrip: React.FC<TabStripProps> = ({ step, session, onSelectStep }) => {
  const { t } = useT();

  return (
    <nav
      aria-label={t("Workflow")}
      className="sticky top-0 z-20 flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-canvas/95 px-4 backdrop-blur @3xl/pane:px-8"
    >
      {tabs.map((tab) => {
        const reachable = isStepReachable(tab.step, session);
        const active = step === tab.step;
        const label = t(tab.label);
        const unlockReason =
          tab.step === 2 ? t("Finish step 1 (Plan) first") : tab.step === 3 ? t("Finish step 2 (PRD) first") : undefined;

        return (
          <button
            key={tab.path}
            type="button"
            disabled={!reachable}
            aria-current={active ? "page" : undefined}
            aria-label={reachable ? `${label} (${tab.path})` : `${label}. ${unlockReason}`}
            title={reachable ? tab.path : unlockReason}
            onClick={() => {
              if (reachable) onSelectStep(tab.step);
            }}
            className={`inline-flex min-w-max items-center gap-1.5 border-b-2 px-3 py-3 text-sm font-medium transition-colors ${
              active
                ? "border-accent text-accent-ink"
                : reachable
                  ? "border-transparent text-muted hover:border-line hover:text-ink"
                  : "cursor-not-allowed border-transparent text-faint"
            }`}
          >
            {!reachable && <Lock className="h-3.5 w-3.5" aria-hidden />}
            {reachable && tab.step < step && <Check className="h-3.5 w-3.5" aria-hidden />}
            {label}
          </button>
        );
      })}
    </nav>
  );
};

export const PipelinePane: React.FC<PipelinePaneProps> = ({
  step,
  session,
  onUpdateSession,
  onGoToNextStep,
  onSelectSample,
  onSelectStep,
}) => (
  <div className="@container/pane flex min-h-0 flex-1 min-w-0 flex-col overflow-y-auto">
    <TabStrip step={step} session={session} onSelectStep={onSelectStep} />
    <div className="px-4 py-8 @3xl/pane:px-8">
      <Suspense fallback={<PaneSkeleton />}>
        {step === 1 && (
          <Step1Plan
            session={session}
            onUpdateSession={onUpdateSession}
            onGoToNextStep={onGoToNextStep}
            onSelectSample={onSelectSample}
          />
        )}
        {step === 2 && (
          <Step2PRD session={session} onUpdateSession={onUpdateSession} onGoToNextStep={onGoToNextStep} />
        )}
        {step === 3 && <Step3AgentTasks session={session} onUpdateSession={onUpdateSession} />}
      </Suspense>
    </div>
  </div>
);

export default PipelinePane;
