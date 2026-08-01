import { ProjectSession, LLMConfig } from "../types";

// localStorage kini hanya menyimpan preferensi per-device: konfigurasi LLM dan
// sesi mana yang terakhir dibuka. Isi proyeknya sendiri hidup di SQLite.
const ACTIVE_SESSION_ID_KEY = "ai_plan_architect_active_session_id";
const DEFAULT_LLM_CONFIG_KEY = "ai_plan_architect_llm_config";

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: "gemini",
  modelName: "gemini-3.6-flash",
  baseUrl: "",
  apiKey: "",
};

export function createEmptySession(llmConfig: LLMConfig): ProjectSession {
  return {
    id: "session_" + Date.now(),
    title: "",
    updatedAt: new Date().toISOString(),
    llmConfig,
    input: {
      title: "",
      description: "",
      targetAudience: "",
      techStackPreference: "",
      answersToFollowUp: {},
    },
    followUps: [],
    currentStep: 1,
  };
}

export function loadSavedLLMConfig(): LLMConfig {
  try {
    const raw = localStorage.getItem(DEFAULT_LLM_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load LLM config:", e);
  }
  return DEFAULT_LLM_CONFIG;
}

export function saveLLMConfig(config: LLMConfig): void {
  try {
    localStorage.setItem(DEFAULT_LLM_CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.warn("Failed to save LLM config:", e);
  }
}

export function loadActiveSessionId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_SESSION_ID_KEY);
  } catch (e) {
    console.warn("Failed to load active session id:", e);
    return null;
  }
}

export function saveActiveSessionId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_SESSION_ID_KEY, id);
  } catch (e) {
    console.warn("Failed to save active session id:", e);
  }
}
