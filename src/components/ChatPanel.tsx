import React, { useEffect, useRef, useState } from "react";
import { Send, X, Wrench, Check, AlertTriangle, RefreshCw } from "lucide-react";
import { useT } from "../lib/i18n";

// Satu baris di layar. Bukan bentuk yang dikirim ke model — riwayat untuk model
// disimpan terpisah apa adanya dari server, karena blok tool_use dan tool_result
// harus tetap berpasangan persis atau permintaan berikutnya ditolak.
interface ChatEntry {
  role: "user" | "assistant" | "tool";
  text?: string;
  tool?: string;
  isError?: boolean;
  running?: boolean;
}

interface ChatPanelProps {
  sessionId: string;
  open: boolean;
  onClose: () => void;
  onToolApplied: () => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ sessionId, open, onClose, onToolApplied }) => {
  const { t } = useT();
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useRef<unknown[]>([]);
  const scroller = useRef<HTMLDivElement>(null);

  // Riwayat model terikat ke proyek, jadi berpindah proyek berarti mulai bersih.
  useEffect(() => {
    history.current = [];
    setEntries([]);
    setError(null);
  }, [sessionId]);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight });
  }, [entries]);

  const send = async () => {
    const message = draft.trim();
    if (!message || busy) return;

    setDraft("");
    setError(null);
    setBusy(true);
    setEntries((prev) => [...prev, { role: "user", text: message }]);

    let toolTouchedSession = false;

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, history: history.current, message }),
      });
      if (!res.ok || !res.body) throw new Error(t("The assistant is unreachable."));

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
          const event = JSON.parse(line.slice(6));

          if (event.type === "text") {
            setEntries((prev) => {
              const last = prev[prev.length - 1];
              if (last?.role === "assistant") {
                return [...prev.slice(0, -1), { ...last, text: (last.text || "") + event.text }];
              }
              return [...prev, { role: "assistant", text: event.text }];
            });
          } else if (event.type === "tool_start") {
            setEntries((prev) => [...prev, { role: "tool", tool: event.tool, running: true }]);
          } else if (event.type === "tool_done") {
            if (!event.isError) toolTouchedSession = true;
            setEntries((prev) => {
              const idx = prev.map((e) => e.role === "tool" && e.running).lastIndexOf(true);
              if (idx === -1) return prev;
              const next = [...prev];
              next[idx] = { ...next[idx], running: false, isError: event.isError };
              return next;
            });
          } else if (event.type === "history") {
            history.current = event.history;
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || t("The assistant is unreachable."));
    } finally {
      setBusy(false);
      if (toolTouchedSession) onToolApplied();
    }
  };

  if (!open) return null;

  return (
    <aside className="w-96 shrink-0 border-l border-line bg-surface flex flex-col h-screen sticky top-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h2 className="font-medium text-ink">{t("Assistant")}</h2>
        <button onClick={onClose} aria-label={t("Close")} className="text-faint hover:text-ink">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {entries.length === 0 && (
          <p className="text-xs text-faint leading-relaxed">
            {t("Ask for a change to this project — the assistant can read it and edit the features or the task board directly.")}
          </p>
        )}

        {entries.map((entry, idx) => {
          if (entry.role === "tool") {
            return (
              <div key={idx} className="flex items-center gap-2 text-xs text-muted">
                {entry.running ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" />
                ) : entry.isError ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-danger shrink-0" />
                ) : (
                  <Check className="w-3.5 h-3.5 text-success shrink-0" />
                )}
                <Wrench className="w-3.5 h-3.5 shrink-0" />
                <code className="font-mono">{entry.tool}</code>
              </div>
            );
          }

          if (entry.role === "user") {
            return (
              <div key={idx} className="ml-6 rounded-xl bg-subtle px-3 py-2 text-ink whitespace-pre-wrap">
                {entry.text}
              </div>
            );
          }

          return (
            <div key={idx} className="text-ink whitespace-pre-wrap leading-relaxed">
              {entry.text}
            </div>
          );
        })}

        {error && (
          <div className="rounded-xl bg-danger-soft border border-danger/30 px-3 py-2 text-danger-ink text-xs">
            {error}
          </div>
        )}
      </div>

      <div className="border-t border-line p-3">
        <div className="flex items-end gap-2">
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("Ask for a change...")}
            className="flex-1 min-w-0 resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-ink placeholder:text-faint focus:outline-hidden focus:ring-2 focus:ring-accent"
          />
          <button
            onClick={send}
            disabled={busy || !draft.trim()}
            aria-label={t("Send")}
            className="shrink-0 rounded-lg bg-accent text-accent-fg p-2.5 disabled:opacity-40"
          >
            {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
};
