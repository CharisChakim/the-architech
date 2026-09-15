import React, { useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, CircleHelp, RefreshCw } from "lucide-react";
import type {
  RuntimeDetection,
  RuntimeEffortOption,
  RuntimeModel,
  RuntimePreference,
  RuntimePreferenceInput,
} from "../../types";
import { useT } from "../../lib/i18n";

const INHERIT = "inherit";

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

const STATUS_STYLES: Record<RuntimeDetection["status"], string> = {
  ready: "border-ok/30 bg-ok-soft text-ok-ink",
  needs_login: "border-warn/30 bg-warn-soft text-warn-ink",
  not_installed: "border-line bg-subtle text-muted",
  unsupported_version: "border-warn/30 bg-warn-soft text-warn-ink",
  error: "border-danger/30 bg-danger-soft text-danger-ink",
};

export interface RuntimeCardProps {
  detection: RuntimeDetection;
  preference?: RuntimePreference;
  onRefresh: () => Promise<void>;
  onSavePreference: (input: RuntimePreferenceInput) => Promise<RuntimePreference>;
  refreshing?: boolean;
}

function selectedModel(models: readonly RuntimeModel[], modelId: string): RuntimeModel | null {
  if (modelId !== INHERIT) return models.find((model) => model.modelId === modelId) ?? null;
  return models.find((model) => model.modelId === models[0]?.defaultModel) ?? models[0] ?? null;
}

function effortLabel(option: RuntimeEffortOption): string {
  return option.label || option.value;
}

function checkedLabel(value: string, unknownLabel: string): string {
  if (!value) return unknownLabel;
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export const RuntimeCard: React.FC<RuntimeCardProps> = ({ detection, preference, onRefresh, onSavePreference, refreshing = false }) => {
  const { t } = useT();
  const [modelId, setModelId] = useState(INHERIT);
  const [effort, setEffort] = useState(INHERIT);
  const [saving, setSaving] = useState<"model" | "effort" | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const models = detection.catalog?.models ?? [];
  const activeModel = useMemo(() => selectedModel(models, modelId), [models, modelId]);
  const effortOptions = activeModel?.effortOptions ?? [];
  const connectionId = detection.catalog?.connectionId ?? `runtime:${detection.runtime}`;
  const requestedModel = preference?.requestedModel ?? INHERIT;
  const requestedEffort = preference?.requestedEffort ?? INHERIT;
  const modelOverrideInvalid = requestedModel !== INHERIT && !models.some((model) => model.modelId === requestedModel);
  const effortOverrideInvalid = requestedEffort !== INHERIT
    && !effortOptions.some((option) => option.value === requestedEffort);

  useEffect(() => {
    const nextModel = requestedModel === INHERIT || models.some((model) => model.modelId === requestedModel)
      ? requestedModel
      : INHERIT;
    const nextModelDetails = selectedModel(models, nextModel);
    const nextEffort = requestedEffort === INHERIT
      || nextModelDetails?.effortOptions.some((option) => option.value === requestedEffort)
      ? requestedEffort
      : INHERIT;
    setModelId(nextModel);
    setEffort(nextEffort);
    setSaveError(null);
  }, [detection.runtime, detection.checkedAt, models, requestedModel, requestedEffort, preference?.updatedAt]);

  useEffect(() => {
    if (effort !== INHERIT && !effortOptions.some((option) => option.value === effort)) setEffort(INHERIT);
  }, [effort, effortOptions]);

  const persist = async (kind: "model" | "effort", nextValue: string) => {
    // Keep a stale server override intact while the UI asks the user to replace
    // it; changing effort must not silently clear an unavailable model choice.
    const nextModel = kind === "model" ? nextValue : (modelId !== INHERIT ? modelId : requestedModel);
    const nextModelDetails = selectedModel(models, nextModel);
    const nextEffort = kind === "effort"
      ? nextValue
      : requestedEffort === INHERIT || nextModelDetails?.effortOptions.some((option) => option.value === requestedEffort)
        ? requestedEffort
        : INHERIT;
    setSaving(kind);
    setSaveError(null);
    try {
      await onSavePreference({
        runtime: detection.runtime,
        connectionId,
        scope: "global",
        scopeKey: null,
        model: nextModel,
        effort: nextEffort,
      });
    } catch (cause) {
      setSaveError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(null);
    }
  };

  const handleModelChange = (nextModel: string) => {
    setModelId(nextModel);
    const nextModelDetails = selectedModel(models, nextModel);
    if (effort !== INHERIT && !nextModelDetails?.effortOptions.some((option) => option.value === effort)) {
      setEffort(INHERIT);
    }
    void persist("model", nextModel);
  };

  const handleEffortChange = (nextEffort: string) => {
    setEffort(nextEffort);
    void persist("effort", nextEffort);
  };

  return (
    <article className="card min-w-0 p-4" aria-labelledby={`runtime-${detection.runtime}-title`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h5 id={`runtime-${detection.runtime}-title`} className="text-sm font-semibold text-ink">
            {RUNTIME_NAMES[detection.runtime]}
          </h5>
          <div className={`mt-2 inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px] font-medium ${STATUS_STYLES[detection.status]}`} role="status">
            {detection.status === "ready" ? <Check className="h-3 w-3" aria-hidden /> : <CircleAlert className="h-3 w-3" aria-hidden />}
            {t(STATUS_LABELS[detection.status])}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void onRefresh().catch(() => undefined)}
          disabled={refreshing}
          className="btn-ghost shrink-0 px-2 py-1.5 text-xs"
          aria-label={t("Refresh {runtime} runtime", { runtime: RUNTIME_NAMES[detection.runtime] })}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden />
          {t("Refresh")}
        </button>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div><dt className="text-faint">{t("Version")}</dt><dd className="mt-0.5 font-mono text-muted">{detection.version ?? "—"}</dd></div>
        <div><dt className="text-faint">{t("Binary")}</dt><dd className="mt-0.5 text-muted">{detection.binaryFound ? t("Found") : t("Not found")}</dd></div>
        <div><dt className="text-faint">{t("Auth")}</dt><dd className="mt-0.5 text-muted">{detection.authStatus === "unknown" ? t("Unknown") : detection.authStatus === "authenticated" ? t("Authenticated") : t("Unauthenticated")}</dd></div>
        <div><dt className="text-faint">{t("Checked")}</dt><dd className="mt-0.5 truncate text-muted" title={detection.checkedAt}>{checkedLabel(detection.checkedAt, t("Unknown"))}</dd></div>
      </dl>

      {detection.diagnostic && (
        <p className="mt-3 flex items-start gap-1.5 rounded-lg border border-line bg-subtle px-2.5 py-2 text-[11px] text-muted">
          <CircleHelp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" aria-hidden />
          <span>{detection.diagnostic}</span>
        </p>
      )}

      <div className="mt-4 border-t border-line pt-4">
        <div className="flex items-center justify-between gap-2">
          <h6 className="text-xs font-semibold text-ink">{t("Detected models")}</h6>
          <span className="text-[11px] text-faint">{models.length}</span>
        </div>
        {models.length > 0 ? (
          <ul className="mt-2 flex flex-wrap gap-1.5" aria-label={t("{runtime} detected models", { runtime: RUNTIME_NAMES[detection.runtime] })}>
            {models.map((model) => <li key={model.modelId} className="max-w-full truncate rounded-md bg-subtle px-2 py-1 font-mono text-[11px] text-muted" title={model.label}>{model.label}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-faint">{t("No model catalog available.")}</p>
        )}
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label htmlFor={`runtime-${detection.runtime}-model`} className="field-label">{t("Model")}</label>
          <select id={`runtime-${detection.runtime}-model`} className="field text-xs" value={modelId} onChange={(event) => handleModelChange(event.target.value)} disabled={!models.length || saving !== null}>
            <option value={INHERIT}>{t("Use runtime default")}</option>
            {models.map((model) => <option key={model.modelId} value={model.modelId}>{model.label} · {model.modelId}</option>)}
          </select>
          <p className="field-hint">{activeModel ? t("Effective model: {model}", { model: activeModel.label }) : t("Uses runtime connection default.")}</p>
        </div>

        {effortOptions.length > 0 && (
          <div>
            <label htmlFor={`runtime-${detection.runtime}-effort`} className="field-label">{t("Effort")}</label>
            <select id={`runtime-${detection.runtime}-effort`} className="field text-xs" value={effort} onChange={(event) => handleEffortChange(event.target.value)} disabled={saving !== null}>
              <option value={INHERIT}>{t("Use runtime default")}</option>
              {effortOptions.map((option) => <option key={option.value} value={option.value}>{effortLabel(option)}</option>)}
            </select>
            <p className="field-hint">{effort === INHERIT && activeModel?.defaultEffort ? t("Effective effort: {effort}", { effort: activeModel.defaultEffort }) : t("Runtime reported effort options.")}</p>
          </div>
        )}
      </div>

      {saving && <p className="mt-3 text-xs text-muted" role="status" aria-live="polite">{t("Saving {preference} preference...", { preference: saving })}</p>}
      {(saveError || modelOverrideInvalid || effortOverrideInvalid) && (
        <p className="mt-3 break-words rounded-lg border border-warn/30 bg-warn-soft px-2.5 py-2 text-xs text-warn-ink" role="alert">
          {saveError ?? (modelOverrideInvalid
            ? t("Saved model override \u201c{model}\u201d is unavailable in the current catalog. Choose a model to replace it.", { model: requestedModel })
            : t("Saved effort override \u201c{effort}\u201d is unavailable for the current model. Choose an effort to replace it.", { effort: requestedEffort }))}
        </p>
      )}

      {detection.catalog && (
        <p className="mt-4 text-[10px] leading-relaxed text-faint">
          {t("Source: {source} · refreshed {date}", { source: detection.catalog.source, date: checkedLabel(detection.catalog.discoveredAt, t("Unknown")) })}
        </p>
      )}
    </article>
  );
};

export default RuntimeCard;
