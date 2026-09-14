import React, { useEffect, useRef, useState } from "react";
import { Send, X, Wrench, Check, AlertTriangle, RefreshCw, Terminal } from "lucide-react";
import { LLMConfig } from "../types";
import { useT } from "../lib/i18n";

// Satu baris di layar. Bukan bentuk yang dikirim ke model — riwayat untuk model
// disimpan terpisah apa adanya dari server, karena blok tool_use dan tool_result
// harus tetap berpasangan persis atau permintaan berikutnya ditolak.
interface ChatEntry {
  role: "user" | "assistant" | "tool" | "approval";
  text?: string;
  tool?: string;
  isError?: boolean;
  running?: boolean;
  // approval
  approvalId?: string;
  command?: string;
  decided?: boolean;
  approved?: boolean;
}

interface ChatPanelProps {
  sessionId: string;
  llmConfig: LLMConfig;
  workspaceRoot: string;
  allowShell: boolean;
  open: boolean;
  onClose: () => void;
  onToolApplied: () => void;
  onChangeWorkspace: (patch: { workspaceRoot?: string; allowShell?: boolean }) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({
  sessionId,
  llmConfig,
  workspaceRoot,
  allowShell,
  open,
  onClose,
  onToolApplied,
  onChangeWorkspace,
}) => {
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

  // Kartu tidak ditutup di sini. Server yang mengirim approval_resolved, dan
  // menutupnya lebih dulu akan berbohong kalau permintaannya ternyata sudah
  // kedaluwarsa di server.
  const decideApproval = async (approvalId: string, approved: boolean) => {
    try {
      const res = await fetch("/api/agent/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, approved }),
      });
      if (!res.ok) setError((await res.json()).error || t("That approval request is no longer valid."));
    } catch {
      setError(t("That approval request is no longer valid."));
    }
  };

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
        // Chat memakai endpoint yang sama dengan pengaturan LLM, tapi lewat
        // format Anthropic — router lokal melayani keduanya di base URL itu.
        body: JSON.stringify({
          sessionId,
          history: history.current,
          message,
          agentConfig: {
            baseUrl: llmConfig.baseUrl,
            apiKey: llmConfig.apiKey,
            model: llmConfig.modelName,
          },
        }),
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
          } else if (event.type === "approval_request") {
            setEntries((prev) => [
              ...prev,
              { role: "approval", approvalId: event.approvalId, command: event.command },
            ]);
          } else if (event.type === "approval_resolved") {
            // Bisa datang dari klik pengguna maupun dari batas waktu server,
            // jadi kartunya ditutup oleh peristiwa ini, bukan oleh klik.
            setEntries((prev) =>
              prev.map((e) =>
                e.role === "approval" && e.approvalId === event.approvalId
                  ? { ...e, decided: true, approved: event.approved }
                  : e
              )
            );
          } else if (event.type === "history") {
            history.current = event.history;
          } else if (event.type === "error") {
            setError(event.message);
          }
        }
      }
    } catch (err: any) {
      setError(err?.message || t("The agent is unreachable."));
    } finally {
      setBusy(false);
      if (toolTouchedSession) onToolApplied();
    }
  };

  if (!open) return null;

  return (
    // Di layar sempit panel mengambang di atas konten; kalau ikut mendesak
    // kolom utama, kanvas dan papan kanban tergencet sampai tidak terbaca.
    // Mulai lg ia kembali mendampingi seperti biasa.
    <aside
      className="fixed inset-y-0 right-0 z-40 w-full max-w-sm shadow-lg
                 lg:static lg:z-auto lg:w-96 lg:max-w-none lg:shadow-none lg:shrink-0
                 border-l border-line bg-surface flex flex-col h-screen lg:sticky lg:top-0"
    >
      <div className="flex items-center justify-between px-4 py-3 border-b border-line">
        <h2 className="font-medium text-ink">{t("Agent")}</h2>
        <button onClick={onClose} aria-label={t("Close")} className="text-faint hover:text-ink">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Folder kerja sengaja selalu terlihat: ini yang menentukan apa saja yang
          bisa disentuh model, dan bukan sesuatu yang layak disembunyikan. */}
      <div className="px-4 py-3 border-b border-line space-y-2">
        <label className="block text-xs font-medium text-muted">{t("Working folder")}</label>
        <input
          type="text"
          value={workspaceRoot}
          onChange={(e) => onChangeWorkspace({ workspaceRoot: e.target.value })}
          placeholder={t("Empty — no file access")}
          spellCheck={false}
          className="w-full rounded-lg border border-line bg-canvas px-2.5 py-1.5 text-xs font-mono text-ink placeholder:text-faint focus:outline-hidden focus:ring-2 focus:ring-accent"
        />

        <label
          className={`flex items-start gap-2 text-xs ${workspaceRoot.trim() ? "text-muted" : "text-faint"}`}
        >
          <input
            type="checkbox"
            checked={allowShell}
            disabled={!workspaceRoot.trim()}
            onChange={(e) => onChangeWorkspace({ allowShell: e.target.checked })}
            className="mt-0.5 shrink-0"
          />
          <span>
            {t("Allow shell commands")}
            {allowShell && (
              <span className="block text-warn-ink mt-0.5">
                {t("The model can run any command in that folder.")}
              </span>
            )}
          </span>
        </label>
      </div>

      <div ref={scroller} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {entries.length === 0 && (
          <p className="text-xs text-faint leading-relaxed">
            {t("Ask for a change to this project — the agent can read it and edit the features or the task board directly.")}
          </p>
        )}

        {entries.map((entry, idx) => {
          if (entry.role === "approval") {
            return (
              <div
                key={idx}
                className="rounded-xl border border-warn/40 bg-warn-soft px-3 py-2.5 space-y-2"
              >
                <div className="flex items-center gap-2 text-xs font-medium text-warn-ink">
                  <Terminal className="w-3.5 h-3.5 shrink-0" />
                  {t("Run this command?")}
                </div>

                <pre className="text-xs font-mono text-ink whitespace-pre-wrap break-all bg-canvas rounded-lg px-2.5 py-2">
                  {entry.command}
                </pre>

                {entry.decided ? (
                  <p className="text-xs text-muted">
                    {entry.approved ? t("Approved — it ran.") : t("Denied — nothing ran.")}
                  </p>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => decideApproval(entry.approvalId!, true)}
                      className="px-3 py-1.5 rounded-lg bg-accent text-accent-fg text-xs font-medium"
                    >
                      {t("Run it")}
                    </button>
                    <button
                      onClick={() => decideApproval(entry.approvalId!, false)}
                      className="px-3 py-1.5 rounded-lg border border-line text-xs font-medium text-ink"
                    >
                      {t("Don't run")}
                    </button>
                  </div>
                )}
              </div>
            );
          }

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
