import { ProjectSession, LLMConfig } from "../types";

const ACTIVE_SESSION_KEY = "ai_plan_architect_active_session";
const SESSIONS_HISTORY_KEY = "ai_plan_architect_history";
const DEFAULT_LLM_CONFIG_KEY = "ai_plan_architect_llm_config";

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: "gemini",
  modelName: "gemini-3.6-flash",
  baseUrl: "",
  apiKey: "",
};

export const DEFAULT_PROJECT_SESSION: ProjectSession = {
  id: "session_" + Date.now(),
  title: "",
  updatedAt: new Date().toISOString(),
  llmConfig: DEFAULT_LLM_CONFIG,
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

export function loadActiveSession(): ProjectSession {
  try {
    const raw = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.id) return parsed;
    }
  } catch (e) {
    console.warn("Failed to load active session:", e);
  }
  return { ...DEFAULT_PROJECT_SESSION, id: "session_" + Date.now(), llmConfig: loadSavedLLMConfig() };
}

export function saveActiveSession(session: ProjectSession): void {
  try {
    const updated = { ...session, updatedAt: new Date().toISOString() };
    localStorage.setItem(ACTIVE_SESSION_KEY, JSON.stringify(updated));
    saveToHistory(updated);
  } catch (e) {
    console.warn("Failed to save active session:", e);
  }
}

export function loadHistorySessions(): ProjectSession[] {
  try {
    const raw = localStorage.getItem(SESSIONS_HISTORY_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn("Failed to load session history:", e);
  }
  return [];
}

export function saveToHistory(session: ProjectSession): void {
  if (!session.input.title && !session.title) return;
  try {
    const history = loadHistorySessions();
    const index = history.findIndex((s) => s.id === session.id);
    if (index !== -1) {
      history[index] = session;
    } else {
      history.unshift(session);
    }
    // Limit history to 20 items
    const trimmed = history.slice(0, 20);
    localStorage.setItem(SESSIONS_HISTORY_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("Failed to update history:", e);
  }
}

export function deleteSessionFromHistory(id: string): ProjectSession[] {
  try {
    const history = loadHistorySessions().filter((s) => s.id !== id);
    localStorage.setItem(SESSIONS_HISTORY_KEY, JSON.stringify(history));
    return history;
  } catch (e) {
    console.warn("Failed to delete session from history:", e);
    return [];
  }
}
