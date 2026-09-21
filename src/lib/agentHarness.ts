export interface AgentHarnessSettings {
  compactTerminal: boolean;
  conciseAnswers: boolean;
  minimalCode: boolean;
  karpathyGuidelines: boolean;
}

const STORAGE_KEY = "ai_plan_architect_agent_harness_v1";

export const DEFAULT_AGENT_HARNESS_SETTINGS: AgentHarnessSettings = {
  compactTerminal: true,
  conciseAnswers: true,
  minimalCode: true,
  karpathyGuidelines: true,
};

export function loadAgentHarnessSettings(): AgentHarnessSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    // Versi sebelumnya menyimpan satu tombol `efficiencyStack` untuk ketiga
    // lapis sekaligus. Kalau pengguna sengaja mematikannya, pilihan itu
    // dihormati — tanpa ini token yang sudah ia tolak diam-diam menyala lagi.
    const legacyOff = saved?.efficiencyStack === false;
    const layer = (value: unknown) => (value === undefined ? !legacyOff : value !== false);
    return {
      compactTerminal: layer(saved?.compactTerminal),
      conciseAnswers: layer(saved?.conciseAnswers),
      minimalCode: layer(saved?.minimalCode),
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
