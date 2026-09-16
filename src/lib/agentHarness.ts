export interface AgentHarnessSettings {
  efficiencyStack: boolean;
  karpathyGuidelines: boolean;
}

const STORAGE_KEY = "ai_plan_architect_agent_harness_v1";

export const DEFAULT_AGENT_HARNESS_SETTINGS: AgentHarnessSettings = {
  efficiencyStack: true,
  karpathyGuidelines: true,
};

export function loadAgentHarnessSettings(): AgentHarnessSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    return {
      efficiencyStack: saved?.efficiencyStack !== false,
      karpathyGuidelines: saved?.karpathyGuidelines !== false,
    };
  } catch (error) {
    console.warn("Failed to load agent harness settings:", error);
    return DEFAULT_AGENT_HARNESS_SETTINGS;
  }
}

export function saveAgentHarnessSettings(settings: AgentHarnessSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    console.warn("Failed to save agent harness settings:", error);
  }
}
