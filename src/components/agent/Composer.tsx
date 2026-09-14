import React, { useState } from "react";
import { LoaderCircle, RotateCcw, Send, Square } from "lucide-react";
import { useT } from "../../lib/i18n";

type SendHandler = (text: string) => void | Promise<void>;
type ActionHandler = () => void | Promise<void>;

export interface ComposerProps {
  send?: SendHandler;
  onSend?: SendHandler;
  busy?: boolean;
  stop?: ActionHandler;
  onStop?: ActionHandler;
  retry?: ActionHandler;
  onRetry?: ActionHandler;
  disabled?: boolean;
  placeholder?: string;
}

export const Composer: React.FC<ComposerProps> = ({
  send,
  onSend,
  busy = false,
  stop,
  onStop,
  retry,
  onRetry,
  disabled = false,
  placeholder,
}) => {
  const { t } = useT();
  const [draft, setDraft] = useState("");
  const sendHandler = onSend ?? send;
  const stopHandler = onStop ?? stop;
  const retryHandler = onRetry ?? retry;

  const submit = () => {
    const message = draft.trim();
    if (!message || busy || disabled || !sendHandler) return;
    setDraft("");
    void sendHandler(message);
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit();
  };

  return (
    <div className="border-t border-line bg-surface p-3">
      <div className="flex items-end gap-2">
        <textarea
          rows={2}
          value={draft}
          disabled={disabled || busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? t("Ask for a change...")}
          aria-label={placeholder ?? t("Ask for a change...")}
          className="flex-1 min-w-0 resize-none rounded-lg border border-line bg-canvas px-3 py-2 text-ink placeholder:text-faint focus:outline-hidden focus:ring-2 focus:ring-accent disabled:opacity-60"
        />

        {retryHandler && !busy && (
          <button
            type="button"
            onClick={() => void retryHandler()}
            disabled={disabled}
            aria-label="Retry"
            title="Retry"
            className="shrink-0 rounded-lg border border-line text-muted p-2.5 hover:bg-subtle hover:text-ink disabled:opacity-40"
          >
            <RotateCcw className="w-4 h-4" aria-hidden />
          </button>
        )}

        {busy && stopHandler ? (
          <button
            type="button"
            onClick={() => void stopHandler()}
            aria-label="Stop"
            title="Stop"
            className="shrink-0 rounded-lg border border-danger/30 text-danger-ink p-2.5 hover:bg-danger-soft"
          >
            <Square className="w-4 h-4" aria-hidden />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy || disabled || !draft.trim() || !sendHandler}
            aria-label={t("Send")}
            className="shrink-0 rounded-lg bg-accent text-accent-fg p-2.5 disabled:opacity-40"
          >
            {busy ? <LoaderCircle className="w-4 h-4 animate-spin" aria-hidden /> : <Send className="w-4 h-4" aria-hidden />}
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-faint">Enter to send · Shift+Enter for newline</p>
    </div>
  );
};

export default Composer;
