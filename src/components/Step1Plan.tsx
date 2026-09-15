import React from "react";
import type { ProjectSession } from "../types";
import type { SampleProject } from "../lib/sampleData";
import { PlanIntake } from "./plan/PlanIntake";
import { PlanView } from "./plan/PlanView";

export interface Step1PlanProps {
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onGoToNextStep: () => void;
  onSelectSample: (sample: SampleProject) => void;
}

export const Step1Plan: React.FC<Step1PlanProps> = (props) => {
  if (props.session.plan) return <PlanView {...props} />;
  return <PlanIntake {...props} />;
};

export default Step1Plan;
