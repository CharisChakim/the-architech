import React, { useEffect, useMemo } from "react";
import type { RuntimeDetection, RuntimePreference, RuntimeModel, RuntimeDiscoveryReport } from "../../types";
import type { RuntimeChatSelection } from "../../lib/runtimeChat";
import { useT } from "../../lib/i18n";

const RUNTIME_NAMES: Record<RuntimeDetection["runtime"], string> = {
  codex: "Codex",
  claude: "Claude Code",
  antigravity: "Antigravity",
};

const STATUS_LABELS: Record<RuntimeDetection["status"], string> = {
  ready: "Ready",
  needs_login: "Needs login",
  not_installed: "Not installed",
  unsupported_version: "Unsupported version",
  error: "Unavailable",
};

export interface RuntimeControlsProps {
  sessionId: string;
  selection: RuntimeChatSelection;
  report: RuntimeDiscoveryReport | null;
  preferences: RuntimePreference[];
  loading?: boolean;
  onChange: (selection: RuntimeChatSelection) => void;
  onOpenConnections?: () => void;
  disabled?: boolean;
}

function preferredValue(
  detection: RuntimeDetection,
  preferences: RuntimePreference[],
  key: "requestedModel" | "requestedEffort",
): string {
  const connectionId = detection.catalog?.connectionId ?? `runtime:${detection.runtime}`;
  return preferences.find((item) => item.runtime === detection.runtime && item.connectionId === connectionId)?.[key] ?? "inherit";
}

function selectedModel(models: RuntimeModel[], model: string): RuntimeModel | null {
  if (model !== "inherit") return models.find((item) => item.modelId === model) ?? null;
  return models.find((item) => item.modelId === models[0]?.defaultModel) ?? models[0] ?? null;
}

export const RuntimeControls: React.FC<RuntimeControlsProps> = ({
  selection,
  report,
  preferences,
  loading = false,
  onChange,
  onOpenConnections,
  disabled = false,
}) => {
  const { t } = useT();
  const detection = selection.runtime === "legacy"
    ? undefined
    : report?.runtimes.find((item) => item.runtime === selection.runtime);
  const models = detection?.catalog?.models ?? [];
  const activeModel = useMemo(() => selectedModel(models, selection.runtime === "legacy" ? "inherit" : selection.model), [models, selection]);
  const effortOptions = activeModel?.effortOptions ?? [];
  const selectedRuntimeUnavailable = selection.runtime !== "legacy" && (
    report
      ? !detection || detection.status !== "ready"
        || Boolean(detection.catalog?.connectionId && detection.catalog.connectionId !== selection.connectionId)
      : !loading
  );
  const selectedRuntimeStatus = !report && loading
    ? t("Checking...")
    : detection && !selectedRuntimeUnavailable
      ? t("Ready")
      : t("Unavailable");
  const selectedRuntimeChecking = selection.runtime !== "legacy" && !report && loading;
  const selectedRuntimeDisplayStatus = detection && selectedRuntimeUnavailable
    ? detection.status === "ready" ? t("Connection unavailable") : t(STATUS_LABELS[detection.status])
    : selectedRuntimeStatus;

  useEffect(() => {
    if (selection.runtime === "legacy" || selectedRuntimeUnavailable || !models.length) return;
    const nextModel = selection.model === "inherit" || models.some((model) => model.modelId === selection.model)
      ? selection.model
      : "inherit";
    const nextDetails = selectedModel(models, nextModel);
    const nextEffort = selection.effort === "inherit"
      || nextDetails?.effortOptions.some((option) => option.value === selection.effort)
      ? selection.effort
      : "inherit";
    if (nextModel !== selection.model || nextEffort !== selection.effort) {
      onChange({ ...selection, model: nextModel, effort: nextEffort });
    }
  }, [models, onChange, selectedRuntimeUnavailable, selection]);

  const changeRuntime = (value: string) => {
    if (value === "legacy") {
      onChange({ runtime: "legacy", model: "inherit", effort: "inherit" });
      return;
    }
    const next = report?.runtimes.find((item) => item.runtime === value);
    if (!next || next.status !== "ready") return;
    const connectionId = next.catalog?.connectionId ?? `runtime:${next.runtime}`;
    const nextModels = next.catalog?.models ?? [];
    const requestedModel = preferredValue(next, preferences, "requestedModel");
    const model = requestedModel === "inherit" || nextModels.some((item) => item.modelId === requestedModel)
      ? requestedModel
      : "inherit";
    const active = selectedModel(nextModels, model);
    const requestedEffort = preferredValue(next, preferences, "requestedEffort");
    const effort = requestedEffort === "inherit" || active?.effortOptions.some((item) => item.value === requestedEffort)
      ? requestedEffort
      : "inherit";
    onChange({
      runtime: next.runtime,
      connectionId,
      model,
      effort,
    });
  };

  const changeModel = (model: string) => {
    if (selection.runtime === "legacy") return;
    const nextModel = selectedModel(models, model);
    const effort = selection.effort === "inherit" || nextModel?.effortOptions.some((item) => item.value === selection.effort)
      ? selection.effort
      : "inherit";
    onChange({ ...selection, model, effort });
  };

  return (
    <div className="min-w-0 flex-1" aria-label={t("Agent runtime controls")}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <label htmlFor="agent-runtime" className="text-[11px] font-medium text-muted">{t("Runtime")}</label>
        <select
          id="agent-runtime"
          className="field min-w-36 flex-1 py-1 text-[11px] sm:max-w-56 sm:flex-none"
          value={selection.runtime}
          onChange={(event) => changeRuntime(event.target.value)}
          disabled={disabled}
        >
          <option value="legacy">{t("Legacy API")}</option>
          {selection.runtime !== "legacy" && !report?.runtimes.some((item) => item.runtime === selection.runtime) && (
            <option value={selection.runtime} disabled>
              {RUNTIME_NAMES[selection.runtime]} · {selectedRuntimeStatus}
            </option>
          )}
          {report?.runtimes.map((item) => (
            <option key={item.runtime} value={item.runtime} disabled={item.status !== "ready"}>
              {RUNTIME_NAMES[item.runtime]} · {t(STATUS_LABELS[item.status])}
            </option>
          ))}
        </select>
        {loading && <span className="text-[11px] text-faint" role="status" aria-live="polite">{t("Detecting...")}</span>}
        {selection.runtime !== "legacy" && (
          <span className={`rounded-full border px-2 py-0.5 text-[10px] ${selectedRuntimeChecking ? "border-line bg-subtle text-muted" : selectedRuntimeUnavailable ? "border-warn/30 bg-warn-soft text-warn-ink" : "border-ok/30 bg-ok-soft text-ok-ink"}`} role="status" aria-live="polite">
            {selectedRuntimeDisplayStatus}
          </span>
        )}
        {selectedRuntimeUnavailable && (
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            {onOpenConnections && <button type="button" className="text-accent-ink hover:underline" onClick={onOpenConnections}>{t("Manage connections")}</button>}
            <button type="button" className="text-accent-ink hover:underline" onClick={() => onChange({ runtime: "legacy", model: "inherit", effort: "inherit" })} disabled={disabled}>
              {t("Use Legacy API")}
            </button>
          </div>
        )}
      </div>

      {selection.runtime !== "legacy" && (
        <div className="mt-2 flex min-w-0 flex-wrap items-center gap-2">
          <label htmlFor="agent-runtime-model" className="text-[11px] font-medium text-muted">{t("Model")}</label>
          <select
            id="agent-runtime-model"
            className="field min-w-36 flex-1 py-1 text-[11px] sm:max-w-56 sm:flex-none"
            value={selection.model}
            onChange={(event) => changeModel(event.target.value)}
            disabled={disabled || selectedRuntimeUnavailable || !models.length}
          >
            <option value="inherit">{t("Use runtime default")}</option>
            {models.map((model) => <option key={model.modelId} value={model.modelId}>{model.label}</option>)}
          </select>
          {effortOptions.length > 0 && (
            <>
              <label htmlFor="agent-runtime-effort" className="text-[11px] font-medium text-muted">{t("Effort")}</label>
              <select
                id="agent-runtime-effort"
                className="field min-w-28 flex-1 py-1 text-[11px] sm:max-w-40 sm:flex-none"
                value={selection.effort}
                onChange={(event) => onChange({ ...selection, effort: event.target.value })}
                disabled={disabled || selectedRuntimeUnavailable}
              >
                <option value="inherit">{t("Use runtime default")}</option>
                {effortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </>
          )}
          {!models.length && <span className="text-[11px] text-faint">{t("No model catalog available")}</span>}
        </div>
      )}
    </div>
  );
};

export default RuntimeControls;
