import React from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import type { RuntimeDiscoveryState } from "../../lib/runtimes";
import { useT } from "../../lib/i18n";
import { RuntimeCard } from "./RuntimeCard";

export type RuntimePanelProps = RuntimeDiscoveryState;

export const RuntimePanel: React.FC<RuntimePanelProps> = ({ report, preferences, loading, error, refresh, savePreference, saveBinaryPath }) => {
  const { t } = useT();
  return (
  <div className="min-h-0 min-w-0 flex-1 overflow-y-auto p-4 sm:p-5" aria-labelledby="runtime-panel-title">
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 id="runtime-panel-title" className="text-sm font-semibold text-ink">{t("Agent runtimes")}</h4>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-faint">{t("Detect Codex, Claude Code, and Antigravity on this workspace machine. Discovery reads version and model metadata only.")}</p>
      </div>
      <button type="button" onClick={() => void refresh().catch(() => undefined)} disabled={loading} className="btn-outline shrink-0 text-xs" aria-label={t("Refresh all runtimes")}>
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} aria-hidden />
        {loading ? t("Refreshing...") : t("Refresh")}
      </button>
    </div>

    {error && (
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger-ink" role="alert">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{error}</span>
      </div>
    )}

    {loading && !report ? (
      <div className="grid gap-3 lg:grid-cols-3" aria-label={t("Loading runtimes")} aria-busy="true">
        {["codex", "claude", "antigravity"].map((runtime) => <div key={runtime} className="card h-80 animate-pulse bg-subtle" />)}
      </div>
    ) : report?.runtimes.length ? (
      <div className="grid gap-3 lg:grid-cols-3">
        {report.runtimes.map((detection) => <RuntimeCard
          key={detection.runtime}
          detection={detection}
          preference={preferences.find((item) => (
            item.runtime === detection.runtime
            && item.connectionId === detection.catalog?.connectionId
            && item.scope === "global"
            && item.scopeKey === null
          ))}
          onRefresh={async () => { await refresh(); }}
          onSavePreference={savePreference}
          onSaveBinaryPath={saveBinaryPath}
          refreshing={loading}
        />)}
      </div>
    ) : (
      <div className="card p-6 text-center text-xs text-faint">{t("No runtime detection result.")}</div>
    )}

    {report && <p className="mt-4 text-[11px] text-faint">{t("Last checked {date} · catalog TTL {minutes} min", { date: report.checkedAt, minutes: Math.round(report.ttlMs / 60000) })}</p>}
  </div>
  );
};

export default RuntimePanel;
