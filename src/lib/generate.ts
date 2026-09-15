import type { AgentTask, FollowUpQuestion, PRDData, ProjectPlan, ProjectSession } from "../types";
import { Language, makeT } from "./i18n";

export type GenerateProgress = (chars: number) => void;

// Dilempar saat pengguna menekan Cancel. Pemanggil membedakannya dari kegagalan
// sungguhan supaya pembatalan tidak memunculkan pesan error.
export const isAbort = (err: any): boolean => err?.name === "AbortError";

async function readStreamResult(
  response: Response,
  lang: Language,
  fallbackKey: string,
  onProgress: GenerateProgress,
): Promise<unknown> {
  if (!response.body) throw new Error(makeT(lang)(fallbackKey));

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: unknown;
  let hasResult = false;
  let streamError: string | null = null;

  const consume = (frame: string): void => {
    const eventLine = frame.split(/\r?\n/).find((line) => line.startsWith("event:"));
    const dataLines = frame
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => (line.slice(5).startsWith(" ") ? line.slice(6) : line.slice(5)));
    if (dataLines.length === 0) return;

    const payload = JSON.parse(dataLines.join("\n")) as any;
    const event = eventLine?.slice(6).trim();
    if (event === "progress") {
      if (typeof payload?.chars === "number" && Number.isFinite(payload.chars)) onProgress(Math.max(0, payload.chars));
    } else if (event === "result") {
      result = payload;
      hasResult = true;
    } else if (event === "error") {
      streamError = typeof payload?.message === "string" ? payload.message : String(payload);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || "";
      frames.forEach(consume);
    }
    buffer += decoder.decode();
    if (buffer.trim()) consume(buffer);
  } finally {
    reader.releaseLock();
  }

  if (streamError) throw new Error(streamError);
  if (!hasResult) throw new Error(makeT(lang)(fallbackKey));
  return result;
}

async function postJson(
  url: string,
  body: unknown,
  lang: Language,
  fallbackKey: string,
  signal?: AbortSignal,
  onProgress?: GenerateProgress,
): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(onProgress ? { Accept: "text/event-stream" } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  const contentType = res.headers.get("content-type") || "";
  if (onProgress && contentType.toLowerCase().includes("text/event-stream")) {
    return readStreamResult(res, lang, fallbackKey, onProgress);
  }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || makeT(lang)(fallbackKey));
  return data;
}

export async function generateFollowUpQuestions(
  body: unknown,
  lang: Language,
  signal?: AbortSignal,
  onProgress?: GenerateProgress,
): Promise<{ questions: FollowUpQuestion[]; needsMoreInfo?: boolean; readinessNote?: string }> {
  return (await postJson("/api/followup-questions", body, lang, "Failed to generate the follow-up questions.", signal, onProgress)) as {
    questions: FollowUpQuestion[];
    needsMoreInfo?: boolean;
    readinessNote?: string;
  };
}

export async function generateProjectPlan(
  body: unknown,
  lang: Language,
  signal?: AbortSignal,
  onProgress?: GenerateProgress,
): Promise<ProjectPlan> {
  return (await postJson("/api/generate-plan", body, lang, "Failed to generate the project plan.", signal, onProgress)) as ProjectPlan;
}

export async function generatePrd(
  session: ProjectSession,
  lang: Language,
  signal?: AbortSignal,
  onProgress?: GenerateProgress,
): Promise<PRDData> {
  return (await postJson(
    "/api/generate-prd",
    {
      title: session.input.title || session.title || "AI application",
      plan: session.plan,
      language: lang,
    },
    lang,
    "Failed to generate the PRD.",
    signal,
    onProgress,
  )) as PRDData;
}

export async function generateTasks(
  session: ProjectSession,
  lang: Language,
  signal?: AbortSignal,
  onProgress?: GenerateProgress,
): Promise<AgentTask[]> {
  const data = await postJson(
    "/api/generate-tasks",
    {
      title: session.input.title || session.title || "AI application",
      plan: session.plan,
      prd: session.prd,
      language: lang,
    },
    lang,
    "Failed to generate the agent tasks.",
    signal,
    onProgress,
  );

  return (data.tasks || []).map((task: AgentTask) => ({ ...task, status: task.status || "todo" }));
}
