import { useCallback, useEffect, useRef, useState } from "react";
import type { Entry } from "./agentEvents";
import { useT } from "./i18n";
import type { LLMConfig } from "../types";

interface AgentRunOptions {
  sessionId: string;
  workspaceRoot: string;
  llmConfig?: LLMConfig;
  onToolApplied: () => void;
}

interface AgentRunResult {
  entries: Entry[];
  busy: boolean;
  error: string | null;
  send: (text: string) => Promise<void>;
  retry: () => Promise<void>;
  decideApproval: (elicitId: string, ok: boolean) => Promise<void>;
  stop: () => void;
}

function nextEntryId(sequence: { current: number }): string {
  sequence.current += 1;
  return `entry-${Date.now()}-${sequence.current}`;
}

function errorText(value: unknown, fallback: string): string {
  if (value instanceof Error && value.message) return value.message;
  if (typeof value === "string" && value) return value;
  return fallback;
}

// Satu baris di layar. Bukan bentuk yang dikirim ke model — riwayat untuk model
// disimpan terpisah apa adanya dari server, karena blok tool_use dan tool_result
// harus tetap berpasangan persis atau permintaan berikutnya ditolak.

export function useAgentRun({ sessionId, workspaceRoot, llmConfig, onToolApplied }: AgentRunOptions): AgentRunResult {
  const { t } = useT();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<unknown[]>([]);
  const lastMessage = useRef<string | null>(null);
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const onToolAppliedRef = useRef(onToolApplied);

  onToolAppliedRef.current = onToolApplied;

  useEffect(() => {
    controller.current?.abort();
    controller.current = null;
    history.current = [];
    lastMessage.current = null;
    setEntries([]);
    setBusy(false);
    setError(null);
  }, [sessionId]);

  useEffect(() => () => controller.current?.abort(), []);

  const appendError = useCallback((message: string, retryable: boolean) => {
    setEntries((prev) => [...prev, { kind: "error", id: nextEntryId(sequence), message, retryable }]);
  }, []);

  const decideApproval = useCallback(async (elicitId: string, ok: boolean): Promise<void> => {
    try {
      const res = await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId: elicitId, approved: ok }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error || t("That approval request is no longer valid."));
      }
    } catch {
      setError(t("That approval request is no longer valid."));
    }
  }, [t]);

  const send = useCallback(async (text: string): Promise<void> => {
    const message = text.trim();
    if (!message || controller.current) return;

    lastMessage.current = message;
    setError(null);
    setBusy(true);
    setEntries((prev) => [...prev, { kind: "user", id: `user-${Date.now()}`, text: message }]);

    const ac = new AbortController();
    controller.current = ac;
    let toolTouchedSession = false;
    let turnStartedAt = Date.now();
    let turnToolCount = 0;

    const pushStreamError = (message: string, retryable: boolean): void => {
      setError(message);
      appendError(message, retryable);
    };

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Chat memakai endpoint yang sama dengan pengaturan LLM, tapi lewat
        // format Anthropic — router lokal melayani keduanya di base URL itu.
        body: JSON.stringify({
          sessionId,
          workspaceRoot,
          history: history.current,
          message,
          ...(llmConfig ? { agentConfig: { baseUrl: llmConfig.baseUrl, apiKey: llmConfig.apiKey, model: llmConfig.modelName } } : {}),
        }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) throw new Error(t("The agent is unreachable."));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Satu event SSE berakhir di baris kosong; sisa potongan ditahan sampai
        // bagian berikutnya tiba.
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() || "";

        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const event = JSON.parse(line.slice(6)) as Record<string, any>;

          if (event.type === "text") {
            setEntries((prev) => {
              const last = prev[prev.length - 1];
              if (last?.kind === "assistant") {
                return [
                  ...prev.slice(0, -1),
                  { ...last, text: last.text + (typeof event.text === "string" ? event.text : ""), streaming: true },
                ];
              }
              return [
                ...prev,
                { kind: "assistant", id: nextEntryId(sequence), text: event.text || "", streaming: true },
              ];
            });
          } else if (event.type === "tool_start") {
            turnToolCount += 1;
            setEntries((prev) => [
              ...prev,
              {
                kind: "tool",
                id: event.id || nextEntryId(sequence),
                name: event.tool || "tool",
                input: event.input,
                state: "running",
                startedAt: Date.now(),
              },
            ]);
          } else if (event.type === "tool_done") {
            if (!event.isError) toolTouchedSession = true;
            setEntries((prev) => {
              // Fase 3 mengirim id stabil. Fallback ini menjaga kompatibilitas
              // dengan server lama yang belum menyertakan id pada tool_done.
              const keyedIndex = event.id
                ? prev.findIndex((entry) => entry.kind === "tool" && entry.id === event.id)
                : -1;
              const idx = event.id
                ? keyedIndex
                : prev.map((entry) => entry.kind === "tool" && entry.state === "running").lastIndexOf(true);
              if (idx === -1 || prev[idx].kind !== "tool") return prev;
              const next = [...prev];
              const tool = prev[idx];
              next[idx] = {
                ...tool,
                name: event.tool || tool.name,
                result: event.result,
                state: event.isError ? "error" : "ok",
                endedAt: Date.now(),
              };
              return next;
            });
          } else if (event.type === "approval_request") {
            const elicitId = event.elicitId || event.approvalId || nextEntryId(sequence);
            setEntries((prev) => [
              ...prev,
              {
                kind: "approval",
                id: nextEntryId(sequence),
                elicitId,
                command: event.command || "",
                ...(event.cwd ? { cwd: event.cwd } : {}),
                decided: false,
              },
            ]);
          } else if (event.type === "approval_resolved") {
            const elicitId = event.elicitId || event.approvalId;
            setEntries((prev) => prev.map((entry) =>
              entry.kind === "approval" && entry.elicitId === elicitId
                ? { ...entry, decided: true, approved: event.approved }
                : entry
            ));
          } else if (event.type === "history") {
            history.current = event.history;
          } else if (event.type === "error") {
            pushStreamError(
              event.message || t("The agent is unreachable."),
              event.retryable !== false,
            );
          } else if (event.type === "turn") {
            turnStartedAt = Date.now();
            turnToolCount = 0;
          } else if (event.type === "done") {
            setEntries((prev) => {
              const next = [...prev];
              const assistantIndex = next
                .map((entry) => entry.kind === "assistant" && entry.streaming)
                .lastIndexOf(true);
              if (assistantIndex !== -1 && next[assistantIndex].kind === "assistant") {
                next[assistantIndex] = { ...next[assistantIndex], streaming: false };
              }
              return [
                ...next,
                {
                  kind: "turn_end",
                  id: event.id || nextEntryId(sequence),
                  toolCount: turnToolCount,
                  ms: Math.max(0, Date.now() - turnStartedAt),
                },
              ];
            });
          }
        }
      }
    } catch (err) {
      if (!ac.signal.aborted) {
        pushStreamError(errorText(err, t("The agent is unreachable.")), true);
      }
    } finally {
      if (controller.current === ac) {
        controller.current = null;
        setBusy(false);
      }
      if (toolTouchedSession) onToolAppliedRef.current();
    }
  }, [appendError, llmConfig, sessionId, t, workspaceRoot]);

  const retry = useCallback(async (): Promise<void> => {
    if (lastMessage.current) await send(lastMessage.current);
  }, [send]);

  const stop = useCallback((): void => {
    controller.current?.abort();
  }, []);

  return { entries, busy, error, send, retry, decideApproval, stop };
}
