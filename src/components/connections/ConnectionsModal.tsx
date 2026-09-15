import React, { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Cpu, Plus, RefreshCw, Save, Trash2, X } from "lucide-react";
import type { AgentRole, WireFormat } from "../../types";
import { useConnections } from "../../lib/connections";
import type { ConnectionDraft, ConnectionTestResult } from "../../lib/connections";
import { useT } from "../../lib/i18n";
import { PROVIDER_PRESETS as CONNECTION_PRESETS, createProviderDraft } from "../../lib/providerPresets";
import type { ProviderPreset } from "../../lib/providerPresets";
import { McpPanel } from "./McpPanel";

export interface ConnectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = "connections" | "roles" | "mcp";
const ROLES: AgentRole[] = ["agent", "plan", "prd", "tasks"];

const inputClass = "field";
const labelClass = "field-label";

const roleLabel = (role: AgentRole, t: (key: string) => string): string =>
  role === "agent" ? t("Agent") : role === "plan" ? t("Plan") : role === "prd" ? t("PRD") : t("Tasks");

function testSummary(result: ConnectionTestResult, t: (key: string) => string): string {
  return result.probes.map((probe) => `${probe.name} ${probe.ok ? "✓" : "✗"} ${probe.ms}ms${probe.detail ? ` · ${probe.detail}` : ""}`).join("\n") || t("No probe result");
}

export const ConnectionsModal: React.FC<ConnectionsModalProps> = ({ isOpen, onClose }) => {
  const { t } = useT();
  const { connections, roles, loading, error, createConnection, updateConnection, deleteConnection, bindRole, testConnection, refresh } = useConnections();
  const [tab, setTab] = useState<Tab>("connections");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPresets, setShowPresets] = useState(false);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<WireFormat>("openai");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKeyEnv, setApiKeyEnv] = useState("");
  const [models, setModels] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [jsonMode, setJsonMode] = useState(true);
  const [selectedRole, setSelectedRole] = useState<AgentRole>("agent");
  const [roleConnectionId, setRoleConnectionId] = useState("");
  const [roleModel, setRoleModel] = useState("");
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const apiKeyRef = useRef<HTMLInputElement>(null);

  const active = selectedId ? connections.find((connection) => connection.id === selectedId) || null : null;

  useEffect(() => {
    if (!isOpen) return;
    setTab("connections");
    setShowPresets(false);
    setSelectedId((current) => current && connections.some((connection) => connection.id === current) ? current : connections[0]?.id || null);
  }, [isOpen, connections]);

  useEffect(() => {
    if (!isOpen) return;
    setName(active?.name || "");
    setFormat(active?.format || "openai");
    setBaseUrl(active?.baseUrl || "");
    setApiKeyEnv(active?.apiKeyEnv || "");
    setModels(active?.models.join(", ") || "");
    setEnabled(active?.enabled ?? true);
    setJsonMode(active?.jsonMode ?? true);
    setTestResult(null);
    setTestError(null);
  }, [active?.id, isOpen]);

  useEffect(() => {
    const binding = roles[selectedRole];
    setRoleConnectionId(binding?.connectionId || connections.find((connection) => connection.enabled)?.id || "");
    setRoleModel(binding?.model || "");
  }, [connections, roles, selectedRole, isOpen]);

  if (!isOpen) return null;

  const choosePreset = async (preset: ProviderPreset) => {
    const draft = createProviderDraft(preset);
    setSelectedId(null);
    setName(draft.name);
    setFormat(draft.format || "openai");
    setBaseUrl(draft.baseUrl);
    setApiKeyEnv("");
    setModels(preset.defaultModel || draft.models?.join(", ") || "");
    setEnabled(true);
    setJsonMode(true);
    setTestResult(null);
    setTestError(null);
    setShowPresets(false);

    if (!draft.baseUrl) return;
    setTesting(true);
    try {
      const result = await testConnection({
        ...draft,
        format: draft.format || "openai",
        model: preset.defaultModel || draft.models[0] || "default",
      });
      setTestResult(result);
      if (result.models.length) setModels(result.models.join(", "));
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : t("Could not reach the LLM."));
    } finally {
      setTesting(false);
    }
  };

  const formPatch = (): ConnectionDraft => ({
    name: name.trim(),
    format,
    baseUrl: baseUrl.trim(),
    ...(apiKeyEnv.trim() ? { apiKeyEnv: apiKeyEnv.trim() } : {}),
    models: models.split(",").map((model) => model.trim()).filter(Boolean),
    jsonMode,
    enabled,
  });

  const handleSave = async () => {
    setSaving(true);
    setTestError(null);
    try {
      const patch = formPatch();
      const newKey = apiKeyRef.current?.value.trim() || "";
      const saved = selectedId
        ? await updateConnection(selectedId, newKey ? { ...patch, apiKey: newKey } : patch)
        : await createConnection(newKey ? { ...patch, apiKey: newKey } : patch);
      setSelectedId(saved.id);
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : t("Failed to save connection."));
    } finally {
      setSaving(false);
    }
  };

  const handleClearKey = async () => {
    if (!selectedId || !active) return;
    setSaving(true);
    try {
      await updateConnection(selectedId, { ...formPatch(), apiKey: "" });
      if (apiKeyRef.current) apiKeyRef.current.value = "";
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : t("Failed to remove API key."));
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    setTestError(null);
    try {
      const draft = formPatch();
      const result = await testConnection({
        ...draft,
        model: models.split(",").map((model) => model.trim()).filter(Boolean)[0] || "default",
        ...(apiKeyRef.current?.value.trim() ? { apiKey: apiKeyRef.current.value.trim() } : {}),
      });
      setTestResult(result);
      if (result.models.length) setModels(result.models.join(", "));
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : t("Could not reach the LLM."));
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    setDeleting(true);
    try {
      await deleteConnection(selectedId);
      setSelectedId(null);
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : t("Failed to delete connection."));
    } finally {
      setDeleting(false);
    }
  };

  const handleBindRole = async () => {
    if (!roleConnectionId || !roleModel.trim()) return;
    try {
      await bindRole(selectedRole, roleConnectionId, roleModel.trim());
    } catch (cause) {
      setTestError(cause instanceof Error ? cause.message : t("Failed to bind role."));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-xs">
      <div className="card flex max-h-[min(760px,calc(100vh-2rem))] w-full max-w-4xl flex-col overflow-hidden shadow-lg">
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-2.5"><Cpu className="h-4 w-4 text-accent" /><h3 className="font-semibold text-ink">{t("Connections")}</h3></div>
          <button type="button" onClick={onClose} aria-label={t("Close")} className="rounded-lg p-1.5 text-faint hover:bg-subtle hover:text-ink"><X className="h-4 w-4" /></button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <nav className="flex shrink-0 gap-1 overflow-x-auto border-b border-line bg-subtle/50 p-2 sm:w-44 sm:flex-col sm:border-b-0 sm:border-r">
            {(["connections", "roles", "mcp"] as Tab[]).map((item) => (
              <button key={item} type="button" onClick={() => setTab(item)} className={`rounded-lg px-3 py-2 text-left text-xs font-medium ${tab === item ? "bg-surface text-accent-ink shadow-sm" : "text-muted hover:text-ink"}`}>
                {item === "connections" ? t("Connections") : item === "roles" ? t("Roles") : t("MCP")}
              </button>
            ))}
          </nav>

          {tab === "connections" && (
            <div className="flex min-h-0 min-w-0 flex-1 flex-col sm:flex-row">
              <div className="flex max-h-48 shrink-0 flex-col border-b border-line p-3 sm:max-h-none sm:w-56 sm:border-b-0 sm:border-r">
                <div className="mb-2 flex items-center justify-between"><span className="text-xs font-semibold text-ink">{t("Saved connections")}</span><button type="button" onClick={() => setShowPresets((value) => !value)} title={t("Add connection")} className="rounded-md p-1 text-accent hover:bg-accent-soft"><Plus className="h-4 w-4" /></button></div>
                {showPresets ? (
                  <div className="min-h-0 space-y-1 overflow-y-auto">
                    <button type="button" onClick={() => void choosePreset(CONNECTION_PRESETS[6])} className="mb-1 flex w-full items-center gap-2 rounded-lg border border-dashed border-line px-2.5 py-2 text-left text-xs text-muted hover:border-accent hover:text-ink"><Plus className="h-3.5 w-3.5" />{t("Custom connection")}</button>
                    {CONNECTION_PRESETS.slice(0, 6).map((preset) => <button key={preset.id} type="button" onClick={() => void choosePreset(preset)} className="block w-full rounded-lg border border-line px-2.5 py-2 text-left hover:bg-subtle"><span className="block text-xs font-medium text-ink">{preset.name}</span><span className="mt-0.5 block text-[11px] text-faint">{preset.baseUrl}</span></button>)}
                  </div>
                ) : (
                  <div className="min-h-0 space-y-1 overflow-y-auto">
                    {connections.map((connection) => <button key={connection.id} type="button" onClick={() => setSelectedId(connection.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left ${selectedId === connection.id ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-subtle hover:text-ink"}`}><span className={`h-2 w-2 shrink-0 rounded-full ${connection.lastCheck?.ok ? "bg-ok" : connection.lastCheck ? "bg-warn" : "bg-faint"}`} /><span className="min-w-0 flex-1 truncate text-xs font-medium">{connection.name}</span>{connection.hasKey && <span className="text-[10px] text-faint">key</span>}</button>)}
                    {!connections.length && <p className="px-2 py-3 text-xs leading-relaxed text-faint">{t("No connections yet. Choose a preset to get started.")}</p>}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-5">
                {showPresets ? <div className="flex h-full items-center justify-center text-center text-xs text-faint">{t("Choose a preset on the left.")}</div> : (
                  <div className="space-y-5">
                    <div className="flex items-start justify-between gap-3"><div><h4 className="text-sm font-semibold text-ink">{active?.name || name || t("New connection")}</h4><p className="mt-1 text-xs text-faint">{active?.hasKey ? t("API key is stored securely on the server.") : t("API key is optional for this connection.")}</p></div>{active && <button type="button" onClick={() => void handleDelete()} disabled={deleting} className="btn-ghost text-danger-ink"><Trash2 className="h-3.5 w-3.5" />{deleting ? t("Deleting...") : t("Delete")}</button>}</div>
                    <div><label className={labelClass}>{t("Connection name")}</label><input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ollama" /></div>
                    <div><span className={labelClass}>{t("Wire format")}</span><div className="grid grid-cols-2 gap-2">{(["openai", "anthropic"] as WireFormat[]).map((item) => <button key={item} type="button" onClick={() => setFormat(item)} className={`rounded-lg border px-3 py-2 text-left text-xs ${format === item ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:bg-subtle"}`}>{item === "openai" ? "OpenAI compatible" : "Anthropic Messages"}</button>)}</div></div>
                    <div><label className={labelClass}>{t("Base URL")}</label><input className={`${inputClass} font-mono text-xs`} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://localhost:11434" /></div>
                    <div><label className={labelClass}>{t("API key")}</label><input key={`${selectedId || "new"}-${active?.hasKey ? "stored" : "empty"}`} ref={apiKeyRef} type="password" defaultValue="" placeholder={active?.hasKey ? t("(stored on server)") : t("Optional") } autoComplete="new-password" className={`${inputClass} font-mono text-xs`} /><div className="mt-1.5 flex items-center justify-between gap-3"><p className="field-hint mt-0">{t("Blank keeps an existing key. Use Remove key to delete it.")}</p>{active?.hasKey && <button type="button" onClick={() => void handleClearKey()} disabled={saving} className="text-xs font-medium text-danger-ink hover:underline">{t("Remove key")}</button>}</div></div>
                    <div><label className={labelClass}>{t("API key environment variable")}</label><input className={`${inputClass} font-mono text-xs`} value={apiKeyEnv} onChange={(event) => setApiKeyEnv(event.target.value)} placeholder="OPENROUTER_API_KEY" /></div>
                    <div><label className={labelClass}>{t("Models")}</label><input className={`${inputClass} font-mono text-xs`} value={models} onChange={(event) => setModels(event.target.value)} placeholder="llama3, qwen2.5-coder" /><p className="field-hint">{t("Separate model names with commas. Test can discover them automatically.")}</p></div>
                    <div className="flex flex-wrap gap-4"><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />{t("Enabled")}</label><label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={jsonMode} onChange={(event) => setJsonMode(event.target.checked)} />{t("JSON mode")}</label></div>

                    {(testResult || testError) && <div className={`rounded-lg border p-3 text-xs ${testError || !testResult?.ok ? "border-warn/30 bg-warn-soft text-warn-ink" : "border-ok/30 bg-ok-soft text-ok-ink"}`}>{testError ? <div className="flex gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{testError}</div> : <pre className="whitespace-pre-wrap font-sans">{testSummary(testResult!, t)}</pre>}{testResult && !testResult.toolsSupported && <p className="mt-2">{t("Tools are unavailable; this connection is still suitable for plan, PRD, or tasks.")}</p>}</div>}

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4"><button type="button" onClick={() => void handleTest()} disabled={testing || !name.trim() || !baseUrl.trim()} className="btn-ghost"><RefreshCw className={`h-4 w-4 ${testing ? "animate-spin" : ""}`} />{testing ? t("Testing...") : t("Test connection")}</button><div className="flex gap-2"><button type="button" onClick={onClose} className="btn-ghost">{t("Cancel")}</button><button type="button" onClick={() => void handleSave()} disabled={saving || !name.trim() || !baseUrl.trim()} className="btn-primary"><Save className="h-4 w-4" />{saving ? t("Saving...") : t("Save")}</button></div></div>
                  </div>
                )}
              </div>
            </div>
          )}

          {tab === "roles" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-5"><div className="max-w-xl space-y-5"><div><h4 className="text-sm font-semibold text-ink">{t("Role bindings")}</h4><p className="mt-1 text-xs leading-relaxed text-faint">{t("Choose which connection and model each workflow role uses.")}</p></div><div className="grid grid-cols-2 gap-2">{ROLES.map((item) => <button key={item} type="button" onClick={() => setSelectedRole(item)} className={`rounded-lg border px-3 py-2 text-left text-xs ${selectedRole === item ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:bg-subtle"}`}>{roleLabel(item, t)}<span className="mt-1 block truncate text-[11px] opacity-70">{roles[item]?.model || t("Not bound")}</span></button>)}</div><div><label className={labelClass}>{t("Connection")}</label><select className={inputClass} value={roleConnectionId} onChange={(event) => setRoleConnectionId(event.target.value)}><option value="">{t("Choose connection")}</option>{connections.filter((connection) => connection.enabled).map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></div><div><label className={labelClass}>{t("Model")}</label><input className={`${inputClass} font-mono text-xs`} value={roleModel} onChange={(event) => setRoleModel(event.target.value)} placeholder="model-name" /></div>{selectedRole === "agent" && roleConnectionId && !connections.find((connection) => connection.id === roleConnectionId)?.lastCheck?.toolsSupported && <p className="rounded-lg border border-warn/30 bg-warn-soft p-3 text-xs text-warn-ink">{t("This connection has not passed the tools probe; agent tools may not work.")}</p>}<button type="button" onClick={() => void handleBindRole()} disabled={!roleConnectionId || !roleModel.trim()} className="btn-primary"><Check className="h-4 w-4" />{t("Save role binding")}</button></div></div>
          )}

          {tab === "mcp" && (
            <McpPanel />
          )}
        </div>

        {(loading || error) && <div className="flex items-center gap-2 border-t border-line px-5 py-2 text-xs text-faint">{loading && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}{error || t("Loading connections...")} {!loading && <button type="button" onClick={() => void refresh()} className="ml-auto font-medium text-accent-ink hover:underline">{t("Retry")}</button>}</div>}
      </div>
    </div>
  );
};

export default ConnectionsModal;
