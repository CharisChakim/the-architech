import React, { useEffect, useRef } from "react";
import { Settings2, X } from "lucide-react";
import type { AgentHarnessSettings } from "../lib/agentHarness";
import { useT } from "../lib/i18n";

interface AgentSettingsModalProps {
  isOpen: boolean;
  settings: AgentHarnessSettings;
  onChange: (settings: AgentHarnessSettings) => void;
  onClose: () => void;
}

interface ToggleProps {
  checked: boolean;
  title: string;
  description: string;
  onChange: (checked: boolean) => void;
}

const Toggle: React.FC<ToggleProps> = ({ checked, title, description, onChange }) => (
  <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-surface p-4 hover:border-accent/40">
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-medium text-ink">{title}</span>
      <span className="mt-1 block text-xs leading-relaxed text-muted">{description}</span>
    </span>
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
    />
  </label>
);

export const AgentSettingsModal: React.FC<AgentSettingsModalProps> = ({ isOpen, settings, onChange, onClose }) => {
  const { t } = useT();
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => closeButton.current?.focus());
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", closeOnEscape);
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="agent-settings-title" className="card w-full max-w-lg overflow-hidden shadow-lg" onMouseDown={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5">
            <Settings2 className="h-4 w-4 text-accent" aria-hidden />
            <h3 id="agent-settings-title" className="font-semibold text-ink">{t("Agent settings")}</h3>
          </div>
          <button ref={closeButton} type="button" onClick={onClose} aria-label={t("Close")} className="rounded-lg p-1.5 text-faint hover:bg-subtle hover:text-ink">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div className="space-y-3 p-5">
          <Toggle
            checked={settings.efficiencyStack}
            title={t("Efficiency stack")}
            description={t("Compact terminal output, concise answers, and minimum-code discipline. Inspired by RTK/chop, Caveman, and Ponytail.")}
            onChange={(efficiencyStack) => onChange({ ...settings, efficiencyStack })}
          />
          <Toggle
            checked={settings.karpathyGuidelines}
            title={t("Karpathy Guidelines")}
            description={t("Requires explicit assumptions, surgical changes, simple solutions, and verification for coding work.")}
            onChange={(karpathyGuidelines) => onChange({ ...settings, karpathyGuidelines })}
          />
          <p className="px-1 text-[11px] leading-relaxed text-faint">
            {t("Both are enabled by default. Disable either to remove its extra prompt tokens. Lower runtime effort for larger token savings on simple work.")}
          </p>
        </div>
      </div>
    </div>
  );
};

export default AgentSettingsModal;
