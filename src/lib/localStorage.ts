import { ProjectSession, LLMConfig } from "../types";

// localStorage kini hanya menyimpan preferensi per-device: konfigurasi LLM dan
// sesi mana yang terakhir dibuka. Isi proyeknya sendiri hidup di SQLite.
const ACTIVE_SESSION_ID_KEY = "ai_plan_architect_active_session_id";
const DEFAULT_LLM_CONFIG_KEY = "ai_plan_architect_llm_config";

// Semua isian kosong: pengguna yang mengisi, dan yang dibiarkan kosong memakai
// bawaan server (model default, GEMINI_API_KEY dari environment).
export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: "gemini",
  modelName: "",
  baseUrl: "",
  apiKey: "",
  saveApiKey: false,
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
    // API key hanya ikut tertulis kalau pengguna memintanya. Kalau tidak, ia
    // tetap hidup di state sesi tapi hilang saat tab ditutup.
    const stored = config.saveApiKey ? config : { ...config, apiKey: "" };
    localStorage.setItem(DEFAULT_LLM_CONFIG_KEY, JSON.stringify(stored));
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
