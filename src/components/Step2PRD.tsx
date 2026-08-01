import React, { useState, useEffect } from "react";
import { ProjectSession, PRDData, PRDExtraSection } from "../types";
import { MermaidViewer } from "./MermaidViewer";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  FileText,
  Sparkles,
  Download,
  Copy,
  Check,
  ArrowRight,
  RefreshCw,
  Edit3,
  CheckCircle2,
  ListOrdered,
  SlidersHorizontal,
  FileCode,
  Plus,
  Trash2,
} from "lucide-react";

interface Step2PRDProps {
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onGoToNextStep: () => void;
}

// Helpers for safe rendering & formatting
const formatRequirementsToString = (reqs: any): string => {
  if (!reqs) return "";
  if (typeof reqs === "string") return reqs;
  if (Array.isArray(reqs)) {
    return reqs.map((r) => (typeof r === "string" ? r : r.title || r.description || JSON.stringify(r))).join("\n");
  }
  if (typeof reqs === "object") {
    const fn = (reqs.functional || []).map((f: any) => `[Fungsional] ${f.title || f.description || f}`);
    const nfn = (reqs.nonFunctional || []).map((nf: any) => `[Non-Fungsional] ${nf.category ? `${nf.category}: ` : ""}${nf.description || nf}`);
    return [...fn, ...nfn].join("\n");
  }
  return String(reqs);
};

const getRequirementsList = (reqs: any): string[] => {
  const str = formatRequirementsToString(reqs);
  return str.split("\n").filter((s) => s.trim().length > 0);
};

const getPhaseFeatures = (cf: any, phaseKey: string): string[] => {
  if (!cf) return [];
  if (cf[phaseKey] && Array.isArray(cf[phaseKey])) return cf[phaseKey];
  if (phaseKey === "fase1" && cf.phase1) return cf.phase1;
  if (phaseKey === "fase2" && cf.phase2) return cf.phase2;
  if (phaseKey === "fase3Plus" && (cf.phase3 || cf.futurePhases)) return cf.phase3 || cf.futurePhases;
  return [];
};

const formatDbSchemaToString = (schema: any): string => {
  if (!schema) return "";
  if (typeof schema === "string") return schema;
  if (Array.isArray(schema)) {
    return schema
      .map((entity: any) => {
        if (typeof entity === "string") return entity;
        const fields = (entity.fields || [])
          .map((f: any) => `  - ${f.name} (${f.type}): ${f.constraints || ""}`)
          .join("\n");
        return `Table: ${entity.name}\n${entity.description ? `Deskripsi: ${entity.description}\n` : ""}${fields}`;
      })
      .join("\n\n");
  }
  return String(schema);
};

const formatTechStackToString = (ts: any): string => {
  if (!ts) return "";
  if (typeof ts === "string") return ts;
  if (Array.isArray(ts)) {
    return ts
      .map((item: any) => (typeof item === "string" ? item : `${item.layer || "Stack"}: ${item.technology || item.tech || ""} - ${item.rationale || ""}`))
      .join("\n");
  }
  return String(ts);
};

// Menyusun ulang markdown PRD dari isi yang sekarang, dipakai setelah pengguna
// mengedit supaya ekspor .md tidak lagi tertinggal di versi lama.
const buildPrdMarkdown = (p: PRDData): string => {
  const lines: string[] = [`# PRD - ${p.projectTitle || "Project Requirements Document"}`, ""];

  lines.push("## 1. Overview", p.overview || "", "");
  lines.push("## 2. Requirements", formatRequirementsToString(p.requirements) || "", "");

  lines.push("## 3. Core Features", "");
  ([
    ["Fase 1", "fase1"],
    ["Fase 2", "fase2"],
    ["Fase 3+", "fase3Plus"],
  ] as const).forEach(([label, key]) => {
    const feats = getPhaseFeatures(p.coreFeatures, key);
    if (feats.length === 0) return;
    lines.push(`### ${label}`);
    feats.forEach((f) => lines.push(`- ${f}`));
    lines.push("");
  });

  lines.push("## 4. User Flow", p.userFlow || "", "");
  if (p.logicFlowMermaid) {
    lines.push("```mermaid", p.logicFlowMermaid, "```", "");
  }
  lines.push("## 5. Architecture", p.architecture || "", "");
  lines.push("## 6. Database Schema", formatDbSchemaToString(p.databaseSchema) || "", "");
  lines.push("## 7. Tech Stack", formatTechStackToString(p.techStack) || "", "");

  (p.additionalSections || []).forEach((s) => {
    lines.push(`## ${s.number}. ${s.title}`, s.content || "", "");
  });

  return lines.join("\n");
};

export const Step2PRD: React.FC<Step2PRDProps> = ({ session, onUpdateSession, onGoToNextStep }) => {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedMd, setCopiedMd] = useState(false);
  const [activeTab, setActiveTab] = useState<"7point" | "overview_edit" | "markdown">("7point");

  const prd = session.prd;
  const extraSections = prd?.additionalSections || [];

  // Editable state for PRD Overview phase
  const [editOverview, setEditOverview] = useState(prd?.overview || "");
  const [editRequirements, setEditRequirements] = useState(formatRequirementsToString(prd?.requirements));
  const [editUserFlow, setEditUserFlow] = useState(prd?.userFlow || "");
  const [editArchitecture, setEditArchitecture] = useState(prd?.architecture || "");
  const [editDatabaseSchema, setEditDatabaseSchema] = useState(formatDbSchemaToString(prd?.databaseSchema));
  const [editTechStack, setEditTechStack] = useState(formatTechStackToString(prd?.techStack));
  const [editExtraSections, setEditExtraSections] = useState<PRDExtraSection[]>(prd?.additionalSections || []);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const updateExtraSection = (idx: number, patch: Partial<PRDExtraSection>) =>
    setEditExtraSections((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const addExtraSection = () =>
    setEditExtraSections((prev) => [...prev, { number: 8 + prev.length, title: "", content: "" }]);

  const removeExtraSection = (idx: number) =>
    setEditExtraSections((prev) => prev.filter((_, i) => i !== idx));

  // Synchronize edit states when PRD is updated
  useEffect(() => {
    if (prd) {
      setEditOverview(prd.overview || "");
      setEditRequirements(formatRequirementsToString(prd.requirements));
      setEditUserFlow(prd.userFlow || "");
      setEditArchitecture(prd.architecture || "");
      setEditDatabaseSchema(formatDbSchemaToString(prd.databaseSchema));
      setEditTechStack(formatTechStackToString(prd.techStack));
      setEditExtraSections(prd.additionalSections || []);
    }
  }, [prd]);

  const handleGeneratePRD = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const res = await fetch("/api/generate-prd", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: session.input.title || session.title || "Aplikasi AI",
          plan: session.plan,
          llmConfig: session.llmConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat PRD.");

      const generatedPrd: PRDData = data;
      onUpdateSession({
        prd: generatedPrd,
      });
    } catch (err: any) {
      setErrorMessage(err.message || "Terjadi kesalahan saat menghasilkan PRD.");
    } finally {
      setLoading(false);
    }
  };

  const handleSavePrdOverviewEdits = () => {
    if (!prd) return;

    // Bidang terstruktur hanya diganti kalau teksnya benar-benar berubah. Kalau
    // tidak disentuh, data asli dari LLM dibiarkan utuh — sebelumnya struktur itu
    // selalu diruntuhkan jadi satu entri palsu meski pengguna tidak mengedit.
    const keepOrReplace = <T,>(edited: string, original: T, serialized: string): T | string =>
      edited.trim() === serialized.trim() ? original : edited;

    const updatedPrd: PRDData = {
      ...prd,
      overview: editOverview,
      userFlow: editUserFlow,
      architecture: editArchitecture,
      requirements: keepOrReplace(
        editRequirements,
        prd.requirements,
        formatRequirementsToString(prd.requirements)
      ),
      databaseSchema: keepOrReplace(
        editDatabaseSchema,
        prd.databaseSchema,
        formatDbSchemaToString(prd.databaseSchema)
      ),
      techStack: keepOrReplace(editTechStack, prd.techStack, formatTechStackToString(prd.techStack)),
      // Poin kosong dibuang, sisanya dinomori ulang berurutan dari 8.
      additionalSections: editExtraSections
        .filter((s) => s.title.trim() !== "" || s.content.trim() !== "")
        .map((s, idx) => ({
          number: 8 + idx,
          title: s.title.trim() || `Poin Tambahan ${8 + idx}`,
          content: s.content,
        })),
    };

    // Ekspor .md membaca fullMarkdownText. Tanpa dibangun ulang, Download/Copy MD
    // akan mengekspor versi sebelum diedit.
    updatedPrd.fullMarkdownText = buildPrdMarkdown(updatedPrd);

    onUpdateSession({ prd: updatedPrd });
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2500);
  };

  const handleDownloadMarkdown = () => {
    if (!prd?.fullMarkdownText) return;
    const blob = new Blob([prd.fullMarkdownText], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `PRD_${(session.input.title || "Proyek").toLowerCase().replace(/[^a-z0-9]/g, "_")}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleCopyMarkdown = () => {
    if (!prd?.fullMarkdownText) return;
    navigator.clipboard.writeText(prd.fullMarkdownText);
    setCopiedMd(true);
    setTimeout(() => setCopiedMd(false), 2000);
  };

  return (
    <div className="space-y-8 pb-12">
      {/* Page heading */}
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">Product Requirement Document</h2>
        <p className="text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          Tujuh poin baku — Overview, Requirements, Core Features, User Flow, Architecture, Database Schema, Tech Stack —
          dan poin tambahan bila analisis menuntutnya. Bisa Anda tinjau dan ubah sebelum dipecah jadi task.
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 rounded-2xl text-sm">
          <strong>Error:</strong> {errorMessage}
        </div>
      )}

      {/* Generate Action Card if no PRD */}
      {!prd ? (
        <div className="bg-white dark:bg-[#2f3546] rounded-2xl border border-slate-200 dark:border-[#3f4557] p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-300 rounded-2xl mx-auto flex items-center justify-center">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-lg">Siap Membuat PRD 7 Poin Otomatis?</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
              {session.plan
                ? "Sistem akan mengekstrak data dari Project Plan & Arsitektur yang telah disetujui untuk menyusun PRD 7 poin."
                : "Langsung buat PRD berdasarkan deskripsi proyek yang dimasukkan."}
            </p>
          </div>
          <button
            onClick={handleGeneratePRD}
            disabled={loading}
            className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 inline-flex items-center gap-2"
          >
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Menyusun PRD 7 Poin & Diagram Horizontal...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                Generate PRD 7 Poin
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* PRD Header & Toolbar */}
          <div className="bg-white dark:bg-[#2f3546] rounded-2xl ring-1 ring-slate-200 dark:ring-[#3f4557] p-6 flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-2">
                <CheckCircle2 className="w-4 h-4" /> PRD tersusun
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{prd.projectTitle || session.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-1.5 max-w-xl line-clamp-2 leading-relaxed">
                {prd.overview || prd.executiveSummary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1.5 px-3 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-colors"
              >
                {copiedMd ? <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedMd ? "Tersalin" : "Copy MD"}
              </button>

              <button
                onClick={handleDownloadMarkdown}
                className="flex items-center gap-1.5 px-3 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-colors"
              >
                <Download className="w-4 h-4" />
                Download .md
              </button>

              <button
                onClick={onGoToNextStep}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg text-sm transition-colors"
              >
                Lanjut ke task
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 dark:border-[#3f4557] pb-3 gap-3">
            <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-700/50 p-1 rounded-2xl">
              <button
                onClick={() => setActiveTab("7point")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "7point" ? "bg-white dark:bg-[#2f3546] text-indigo-900 dark:text-indigo-200 shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <ListOrdered className="w-4 h-4" />
                1. Tampilan PRD {7 + extraSections.length} Poin
              </button>

              <button
                onClick={() => setActiveTab("overview_edit")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "overview_edit" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <Edit3 className="w-4 h-4" />
                2. Overview & Edit Sebelum Build Task
              </button>

              <button
                onClick={() => setActiveTab("markdown")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "markdown" ? "bg-white dark:bg-[#2f3546] text-indigo-900 dark:text-indigo-200 shadow-xs" : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100"
                }`}
              >
                <FileCode className="w-4 h-4" />
                3. Raw Markdown Document
              </button>
            </div>

            <button
              onClick={handleGeneratePRD}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#2f3546] border border-slate-200 dark:border-[#3f4557] hover:bg-slate-50 dark:hover:bg-slate-700/40 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-medium transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Regenerate PRD
            </button>
          </div>

          {/* TAB 1: 7-POINT STRUCTURED PRD DISPLAY */}
          {activeTab === "7point" && (
            <div className="space-y-8">
              {/* 1. Overview */}
              <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">1</span>
                  Overview
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed">{prd.overview}</p>
              </div>

              {/* 2. Requirements */}
              <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">2</span>
                  Requirements (Kebutuhan Fungsional & Non-Fungsional)
                </h4>
                <ul className="space-y-2 text-slate-700 dark:text-slate-200">
                  {getRequirementsList(prd.requirements).map((req, idx) => (
                    <li key={idx} className="flex gap-2.5">
                      <span className="text-slate-300 dark:text-slate-600 shrink-0">&middot;</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 3. Core Features by Phase */}
              <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-4">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">3</span>
                  Core Features (Tahapan Fase 1, 2, 3+)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6">
                  {(
                    [
                      ["Fase 1", "MVP utama", "fase1"],
                      ["Fase 2", "Pengayaan", "fase2"],
                      ["Fase 3+", "Tingkat lanjut", "fase3Plus"],
                    ] as const
                  ).map(([label, caption, key]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-baseline gap-2 pb-2 border-b border-slate-100 dark:border-[#3f4557]">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{label}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{caption}</span>
                      </div>
                      <ul className="space-y-1.5 text-slate-700 dark:text-slate-200">
                        {getPhaseFeatures(prd.coreFeatures, key).map((f, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-slate-300 dark:text-slate-600 shrink-0">&middot;</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* 4. User Flow & Diagram Logika Horizontal */}
              <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-4">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">4</span>
                  User Flow & Horizontal Logic Diagram
                </h4>
                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed bg-slate-50 dark:bg-slate-700/40 p-4 rounded-2xl border border-slate-200 dark:border-[#3f4557]">
                  {prd.userFlow}
                </p>

                {prd.logicFlowMermaid && (
                  <MermaidViewer
                    chart={prd.logicFlowMermaid}
                    explanation={prd.logicFlowExplanation}
                    title={`User Flow & Logic Diagram: ${prd.projectTitle}`}
                  />
                )}
              </div>

              {/* 5. Architecture */}
              <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">5</span>
                  Architecture
                </h4>
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{prd.architecture}</p>
              </div>

              {/* 6. Database Schema */}
              <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">6</span>
                  Database Schema
                </h4>
                <div className="p-4 bg-slate-50 dark:bg-slate-700/40 rounded-2xl border border-slate-200 dark:border-[#3f4557] text-sm font-mono leading-relaxed whitespace-pre-wrap text-slate-800 dark:text-slate-200">
                  {formatDbSchemaToString(prd.databaseSchema)}
                </div>
              </div>

              {/* 7. Tech Stack */}
              <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-3">
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 font-semibold text-xs flex items-center justify-center">7</span>
                  Tech Stack
                </h4>
                <div className="p-4 bg-indigo-50/60 dark:bg-indigo-500/10 rounded-2xl border border-indigo-100 dark:border-indigo-500/30 text-sm text-indigo-950 dark:text-indigo-200 font-medium whitespace-pre-wrap">
                  {formatTechStackToString(prd.techStack)}
                </div>
              </div>

              {/* 8+. Poin tambahan yang dinilai perlu oleh AI setelah analisis */}
              {extraSections.map((section) => (
                <div
                  key={section.number}
                  className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-3"
                >
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                    <span className="w-6 h-6 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-semibold text-xs flex items-center justify-center">
                      {section.number}
                    </span>
                    {section.title}
                    <span className="ml-1 text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-500/30">
                      Poin Tambahan
                    </span>
                  </h4>
                  <div className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: OVERVIEW & EDITABLE REVIEW BEFORE TASK GENERATION */}
          {activeTab === "overview_edit" && (
            <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 border border-indigo-200 dark:border-indigo-500/30 shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#3f4557] pb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    Overview & Modifikasi PRD Sebelum Build Task
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Tinjau dan lakukan penyesuaian teks jika ada poin PRD yang kurang sesuai sebelum AI Agent memecahnya menjadi Kanban task coding.
                  </p>
                </div>

                {saveSuccess && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 dark:bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 rounded-xl text-xs font-semibold animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" /> Perubahan Disimpan!
                  </span>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">1. Overview Proyek</label>
                  <textarea
                    rows={3}
                    value={editOverview}
                    onChange={(e) => setEditOverview(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">
                    2. Requirements (Satu poin per baris)
                  </label>
                  <textarea
                    rows={4}
                    value={editRequirements}
                    onChange={(e) => setEditRequirements(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">4. User Flow</label>
                  <textarea
                    rows={3}
                    value={editUserFlow}
                    onChange={(e) => setEditUserFlow(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">5. Architecture</label>
                  <textarea
                    rows={3}
                    value={editArchitecture}
                    onChange={(e) => setEditArchitecture(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">6. Database Schema</label>
                  <textarea
                    rows={3}
                    value={editDatabaseSchema}
                    onChange={(e) => setEditDatabaseSchema(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200 mb-1.5">7. Tech Stack</label>
                  <textarea
                    rows={2}
                    value={editTechStack}
                    onChange={(e) => setEditTechStack(e.target.value)}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] rounded-2xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Poin 8+ : bisa diubah, dihapus, atau ditambah sendiri */}
                <div className="pt-4 border-t border-slate-100 dark:border-[#3f4557] space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">Poin Tambahan (8 dan seterusnya)</label>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Poin di luar tujuh poin wajib. Nomornya diurutkan ulang otomatis saat disimpan.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addExtraSection}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#2f3546] border border-purple-200 text-purple-700 dark:text-purple-300 hover:bg-purple-50 rounded-xl text-xs font-semibold transition-all"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Tambah Poin
                    </button>
                  </div>

                  {editExtraSections.length === 0 ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-700/40 border border-dashed border-slate-200 dark:border-[#3f4557] rounded-2xl p-3">
                      Belum ada poin tambahan. AI akan menambahkannya sendiri bila analisis menuntut, atau Anda bisa
                      menambahkan manual.
                    </p>
                  ) : (
                    editExtraSections.map((section, idx) => (
                      <div key={idx} className="p-3.5 bg-purple-50/40 dark:bg-purple-500/10 border border-purple-100 dark:border-purple-500/30 rounded-2xl space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 shrink-0 rounded-lg bg-purple-100 dark:bg-purple-500/20 text-purple-700 dark:text-purple-300 font-semibold text-xs flex items-center justify-center">
                            {8 + idx}
                          </span>
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => updateExtraSection(idx, { title: e.target.value })}
                            placeholder="Judul poin, misal: Rencana Pengujian"
                            className="flex-1 min-w-0 px-3 py-2 bg-white dark:bg-[#2f3546] border border-slate-200 dark:border-[#3f4557] rounded-xl text-xs font-semibold text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                          />
                          <button
                            type="button"
                            onClick={() => removeExtraSection(idx)}
                            className="p-2 text-slate-400 dark:text-slate-500 hover:text-rose-600 hover:bg-white rounded-xl transition-all shrink-0"
                            title="Hapus poin ini"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={section.content}
                          onChange={(e) => updateExtraSection(idx, { content: e.target.value })}
                          placeholder="Isi poin ini..."
                          className="w-full p-3 bg-white dark:bg-[#2f3546] border border-slate-200 dark:border-[#3f4557] rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-purple-500 dark:focus:ring-purple-400"
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between pt-4 border-t border-slate-100 dark:border-[#3f4557] gap-3">
                <button
                  onClick={handleSavePrdOverviewEdits}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Simpan Perubahan PRD
                </button>

                <button
                  onClick={onGoToNextStep}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-semibold text-sm transition-all shadow-md flex items-center gap-2"
                >
                  Setujui & Lanjut ke Step 3: Task Agent
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: RAW MARKDOWN DOCUMENT */}
          {activeTab === "markdown" && (
            <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] prose prose-slate max-w-none text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prd.fullMarkdownText}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
