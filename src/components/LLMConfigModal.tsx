import React, { useState } from "react";
import { LLMConfig } from "../types";
import { Cpu, Server, Key, CheckCircle2, AlertCircle, RefreshCw, X, Sparkles, Terminal } from "lucide-react";

interface LLMConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: LLMConfig;
  onSave: (newConfig: LLMConfig) => void;
}

export const LLMConfigModal: React.FC<LLMConfigModalProps> = ({ isOpen, onClose, config, onSave }) => {
  const [provider, setProvider] = useState<"gemini" | "ollama" | "custom">(config.provider || "gemini");
  const [modelName, setModelName] = useState<string>(config.modelName || "gemini-3.6-flash");
  const [baseUrl, setBaseUrl] = useState<string>(config.baseUrl || "http://localhost:11434");
  const [apiKey, setApiKey] = useState<string>(config.apiKey || "");

  const [testing, setTesting] = useState<boolean>(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  if (!isOpen) return null;

  const handleProviderChange = (newProvider: "gemini" | "ollama" | "custom") => {
    setProvider(newProvider);
    setTestResult(null);
    if (newProvider === "gemini") {
      setModelName("gemini-3.6-flash");
    } else if (newProvider === "ollama") {
      setModelName("llama3");
      if (!baseUrl) setBaseUrl("http://localhost:11434");
    } else if (newProvider === "custom") {
      setModelName("gpt-4o-mini");
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/test-llm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          llmConfig: { provider, modelName, baseUrl, apiKey },
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTestResult({
          success: true,
          message: `Koneksi berhasil! Model: ${modelName} terhubung.`,
        });
      } else {
        setTestResult({
          success: false,
          message: data.error || "Gagal menghubungi model LLM.",
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Gagal menghubungi server lokal.",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    onSave({
      provider,
      modelName,
      baseUrl: provider !== "gemini" ? baseUrl : "",
      apiKey: provider === "custom" ? apiKey : "",
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-500/20 text-indigo-400 rounded-lg border border-indigo-500/30">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-base">Pengaturan LLM & Custom Engine</h3>
              <p className="text-xs text-slate-400">Pilih Gemini AI Studio atau ganti dengan Ollama / LLM kustom.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 space-y-6">
          {/* Provider Selection Cards */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
              Pilih Provider LLM
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleProviderChange("gemini")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                  provider === "gemini"
                    ? "bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Sparkles className={`w-4 h-4 ${provider === "gemini" ? "text-indigo-600" : "text-slate-400"}`} />
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700">Default</span>
                </div>
                <div>
                  <div className="font-semibold text-xs">Gemini AI</div>
                  <div className="text-[11px] text-slate-500 font-normal">Google Gemini 3.6 Flash</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange("ollama")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                  provider === "ollama"
                    ? "bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Terminal className={`w-4 h-4 ${provider === "ollama" ? "text-indigo-600" : "text-slate-400"}`} />
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Lokal</span>
                </div>
                <div>
                  <div className="font-semibold text-xs">Ollama</div>
                  <div className="text-[11px] text-slate-500 font-normal">Llama3 / Qwen / Mistral</div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => handleProviderChange("custom")}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 ${
                  provider === "custom"
                    ? "bg-indigo-50/80 border-indigo-500 ring-2 ring-indigo-500/20 text-indigo-950"
                    : "bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Server className={`w-4 h-4 ${provider === "custom" ? "text-indigo-600" : "text-slate-400"}`} />
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Custom</span>
                </div>
                <div>
                  <div className="font-semibold text-xs">Custom API</div>
                  <div className="text-[11px] text-slate-500 font-normal">OpenAI Compatible</div>
                </div>
              </button>
            </div>
          </div>

          {/* Detailed Inputs */}
          <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            {provider === "gemini" && (
              <div>
                <label className="block font-medium text-slate-700 mb-1">Model Gemini</label>
                <select
                  value={modelName}
                  onChange={(e) => setModelName(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="gemini-3.6-flash">gemini-3.6-flash (Direkomendasikan - Cepat & Cerdas)</option>
                  <option value="gemini-3.1-pro-preview">gemini-3.1-pro-preview (Model Penalaran Kompleks)</option>
                  <option value="gemini-3.1-flash-lite">gemini-3.1-flash-lite (Ultra Fast Lightweight)</option>
                </select>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Secara default Gemini API Key disediakan oleh lingkungan AI Studio.
                </p>
              </div>
            )}

            {provider === "ollama" && (
              <div className="space-y-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Ollama Base URL</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Contoh: http://localhost:11434 atau IP Server Ollama Anda.</p>
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nama Model Ollama</label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="llama3, qwen2.5-coder, mistral"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Pastikan model telah di-pull via 'ollama run &lt;model&gt;'.</p>
                </div>
              </div>
            )}

            {provider === "custom" && (
              <div className="space-y-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Base Endpoint URL</label>
                  <input
                    type="text"
                    value={baseUrl}
                    onChange={(e) => setBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com atau custom proxy"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Model Name</label>
                  <input
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="gpt-4o-mini, deepseek-coder"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">API Key (Opsional)</label>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-..."
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Test connection alert box */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border flex items-start gap-2 text-xs ${
                testResult.success ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-rose-50 border-rose-200 text-rose-900"
              }`}
            >
              {testResult.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              )}
              <div className="leading-snug">{testResult.message}</div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={testing}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${testing ? "animate-spin" : ""}`} />
            {testing ? "Pengujian..." : "Uji Koneksi LLM"}
          </button>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-900 text-xs font-semibold rounded-xl transition-all"
            >
              Batal
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl text-xs font-semibold transition-all shadow-xs"
            >
              Simpan Pengaturan
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
