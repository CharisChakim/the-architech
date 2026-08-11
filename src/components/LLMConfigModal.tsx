import React, { useEffect, useState } from "react";
import { LLMConfig, LLMProvider } from "../types";
import { Cpu, CheckCircle2, AlertCircle, RefreshCw, X, Sparkles, Terminal, Server } from "lucide-react";

interface LLMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LLMConfig;
  onSave: (newConfig: LLMConfig) => void;
}

// Setiap provider punya isiannya sendiri. Disimpan terpisah supaya berpindah
// provider lalu kembali tidak menghapus apa yang sudah diketik.
interface ProviderDraft {
  modelName: string;
  baseUrl: string;
  apiKey: string;
}

const EMPTY_DRAFT: ProviderDraft = { modelName: "", baseUrl: "", apiKey: "" };

const PROVIDERS: { id: LLMProvider; name: string; hint: string; icon: typeof Cpu }[] = [
  { id: "gemini", name: "Gemini", hint: "Google AI Studio", icon: Sparkles },
  { id: "ollama", name: "Ollama", hint: "Model lokal", icon: Terminal },
  { id: "custom", name: "Custom API", hint: "OpenAI compatible", icon: Server },
];

const inputClass = "field";
const labelClass = "field-label";
const hintClass = "field-hint";

export const LLMConfigModal: React.FC<LLMConfigModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [provider, setProvider] = useState<LLMProvider>(config.provider || "gemini");
  const [drafts, setDrafts] = useState<Record<LLMProvider, ProviderDraft>>({
    gemini: { ...EMPTY_DRAFT },
    ollama: { ...EMPTY_DRAFT },
    custom: { ...EMPTY_DRAFT },
  });
  const [saveApiKey, setSaveApiKey] = useState<boolean>(config.saveApiKey ?? false);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Saat modal dibuka, tarik ulang dari konfigurasi tersimpan. Tanpa ini isian
  // bisa tertinggal di nilai lama ketika konfigurasi berubah dari luar.
  useEffect(() => {
    if (!isOpen) return;
    const active = config.provider || "gemini";
    setProvider(active);
    setSaveApiKey(config.saveApiKey ?? false);
    setTestResult(null);
    setDrafts({
      gemini: { ...EMPTY_DRAFT },
      ollama: { ...EMPTY_DRAFT },
      custom: { ...EMPTY_DRAFT },
      [active]: {
        modelName: config.modelName || "",
        baseUrl: config.baseUrl || "",
        apiKey: config.apiKey || "",
      },
    } as Record<LLMProvider, ProviderDraft>);
  }, [isOpen, config]);

  if (!isOpen) return null;

  const draft = drafts[provider];
  const patchDraft = (patch: Partial<ProviderDraft>) =>
    setDrafts((prev) => ({ ...prev, [provider]: { ...prev[provider], ...patch } }));

  const hasApiKeyField = provider === "gemini" || provider === "custom";

  const currentConfig = (): LLMConfig => ({
    provider,
    modelName: draft.modelName.trim(),
    baseUrl: draft.baseUrl.trim(),
    apiKey: draft.apiKey.trim(),
    saveApiKey,
  });

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ llmConfig: currentConfig() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Koneksi berhasil${draft.modelName ? ` ke ${draft.modelName}` : ""}.`,
        });
      } else {
        setTestResult({ success: false, message: data.error || "Gagal menghubungi model LLM." });
      }
    } catch (err: any) {
      setTestResult({ success: false, message: err.message || "Gagal menghubungi server lokal." });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSave(currentConfig());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="card shadow-lg w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-faint" />
            <h3 className="font-semibold text-ink">Pengaturan LLM</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-faint hover:text-ink hover:bg-subtle rounded-lg transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Provider */}
          <div>
            <span className={labelClass}>Provider</span>
            <div className="grid grid-cols-3 gap-2">
              {PROVIDERS.map(({ id, name, hint, icon: Icon }) => {
                const active = provider === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setProvider(id);
                      setTestResult(null);
                    }}
                    className={`p-3 rounded-lg text-left transition-colors border ${
                      active
                        ? "bg-accent-soft border-accent text-accent-ink"
                        : "bg-surface border-line text-muted hover:bg-subtle hover:text-ink"
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-2 ${active ? "" : "text-faint"}`} />
                    <div className="text-sm font-medium">{name}</div>
                    <div className={`text-xs mt-0.5 ${active ? "opacity-70" : "text-faint"}`}>{hint}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Isian per provider — semuanya kosong, placeholder hanya contoh */}
          <div className="space-y-4">
            {provider !== "gemini" && (
              <div>
                <label className={labelClass}>Base URL</label>
                <input
                  type="text"
                  value={draft.baseUrl}
                  onChange={(e) => patchDraft({ baseUrl: e.target.value })}
                  placeholder={provider === "ollama" ? "contoh: http://localhost:11434" : "contoh: https://api.openai.com"}
                  className={inputClass}
                />
                {provider === "ollama" && (
                  <p className={hintClass}>Dikosongkan berarti http://localhost:11434.</p>
                )}
                {provider === "custom" && <p className={hintClass}>Wajib diisi. Endpoint OpenAI-compatible.</p>}
              </div>
            )}

            <div>
              <label className={labelClass}>Nama model</label>
              <input
                type="text"
                value={draft.modelName}
                onChange={(e) => patchDraft({ modelName: e.target.value })}
                placeholder={
                  provider === "gemini"
                    ? "contoh: gemini-3.6-flash"
                    : provider === "ollama"
                      ? "contoh: llama3"
                      : "contoh: gpt-4o-mini"
                }
                className={inputClass}
              />
              {provider === "gemini" && (
                <p className={hintClass}>
                  Contoh lain: gemini-3.1-pro-preview, gemini-3.1-flash-lite. Kosong berarti gemini-3.6-flash.
                </p>
              )}
            </div>

            {hasApiKeyField && (
              <div>
                <label className={labelClass}>API key</label>
                <input
                  type="password"
                  value={draft.apiKey}
                  onChange={(e) => patchDraft({ apiKey: e.target.value })
                  }
                  placeholder={provider === "gemini" ? "contoh: AIza..." : "contoh: sk-..."}
                  className={`${inputClass} font-mono`}
                  autoComplete="off"
                />
                <p className={hintClass}>
                  {provider === "gemini"
                    ? "Kosong berarti memakai GEMINI_API_KEY dari environment server."
                    : "Kosongkan bila endpoint tidak memerlukan otentikasi."}
                </p>

                <label className="mt-3 flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={saveApiKey}
                    onChange={(e) => setSaveApiKey(e.target.checked)}
                    className="mt-0.5 w-4 h-4 rounded border-strong accent-[var(--app-accent)]"
                  />
                  <span className="text-xs text-muted">
                    Simpan API key di browser ini
                    <span className="block text-faint mt-0.5">
                      Kalau tidak dicentang, key hanya dipakai selama tab ini terbuka dan tidak ditulis ke
                      localStorage. Key tidak pernah ikut tersimpan ke riwayat proyek.
                    </span>
                  </span>
                </label>
              </div>
            )}
          </div>

          {testResult && (
            <div
              className={`p-3.5 rounded-lg border flex items-start gap-2.5 ${
                testResult.success
                  ? "bg-ok-soft border-ok/30 text-ok-ink"
                  : "bg-danger-soft border-danger/30 text-danger-ink"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed break-words">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-line flex items-center justify-between">
          <button type="button" onClick={handleTestConnection} disabled={testing} className="btn-ghost">
            <RefreshCw className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} />
            {testing ? "Menguji..." : "Uji koneksi"}
          </button>

          <div className="flex items-center gap-2">
            <button onClick={onClose} className="btn-ghost">
              Batal
            </button>
            <button onClick={handleSave} className="btn-primary">
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
