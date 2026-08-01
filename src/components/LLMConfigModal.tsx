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

const inputClass =
  "w-full px-3 py-2 bg-white dark:bg-[#262c3b] border border-slate-300 dark:border-[#4a5169] rounded-lg " +
  "text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 " +
  "focus:outline-hidden focus:ring-2 focus:ring-indigo-500";

const labelClass = "block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5";
const hintClass = "mt-1.5 text-xs text-slate-500 dark:text-slate-400";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#2f3546] rounded-2xl shadow-lg ring-1 ring-slate-200 dark:ring-[#3f4557] w-full max-w-xl overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-[#3f4557] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Cpu className="w-4 h-4 text-slate-400" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">Pengaturan LLM</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Semua isian dimulai kosong. Yang dibiarkan kosong memakai bawaan server.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Provider */}
          <div>
            <label className={labelClass}>Provider</label>
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
                    className={`p-3 rounded-xl text-left transition-colors ring-1 ${
                      active
                        ? "bg-indigo-50 dark:bg-indigo-500/15 ring-indigo-500 text-indigo-900 dark:text-indigo-200"
                        : "bg-white dark:bg-[#262c3b] ring-slate-200 dark:ring-[#4a5169] text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/40"
                    }`}
                  >
                    <Icon className={`w-4 h-4 mb-2 ${active ? "text-indigo-600 dark:text-indigo-300" : "text-slate-400"}`} />
                    <div className="text-sm font-medium">{name}</div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{hint}</div>
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
                    className="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-[#4a5169] text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-xs text-slate-600 dark:text-slate-300">
                    Simpan API key di browser ini
                    <span className="block text-slate-500 dark:text-slate-400 mt-0.5">
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
              className={`p-3.5 rounded-xl ring-1 flex items-start gap-2.5 text-sm ${
                testResult.success
                  ? "bg-emerald-50 dark:bg-emerald-500/10 ring-emerald-200 dark:ring-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                  : "bg-rose-50 dark:bg-rose-500/10 ring-rose-200 dark:ring-rose-500/30 text-rose-900 dark:text-rose-200"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed break-words">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-[#3f4557] flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${testing ? "animate-spin" : ""}`} />
            {testing ? "Menguji..." : "Uji koneksi"}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-3 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              Simpan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
