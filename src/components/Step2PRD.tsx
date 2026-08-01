import React, { useState, useEffect } from "react";
import { ProjectSession, PRDData } from "../types";
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
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Synchronize edit states when PRD is updated
  useEffect(() => {
    if (prd) {
      setEditOverview(prd.overview || "");
      setEditRequirements(formatRequirementsToString(prd.requirements));
      setEditUserFlow(prd.userFlow || "");
      setEditArchitecture(prd.architecture || "");
      setEditDatabaseSchema(formatDbSchemaToString(prd.databaseSchema));
      setEditTechStack(formatTechStackToString(prd.techStack));
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

    const reqLines = editRequirements
      .split("\n")
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const updatedPrd: PRDData = {
      ...prd,
      overview: editOverview,
      userFlow: editUserFlow,
      architecture: editArchitecture,
      requirements: {
        functional: reqLines.map((line, idx) => ({
          id: `FR-${idx + 1}`,
          title: line,
          description: line,
          priority: "P0",
        })),
        nonFunctional: [],
      },
      databaseSchema: [
        {
          name: "CustomSchema",
          description: editDatabaseSchema,
          fields: [],
        },
      ],
      techStack: [
        {
          layer: "Core Stack",
          technology: editTechStack,
          rationale: "Kustomisasi Pengguna",
        },
      ],
    };

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
      {/* Introduction Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-4 border border-indigo-500/30">
            <FileText className="w-3.5 h-3.5" />
            Part 2: Bikin PRD 7 Poin & Overview
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
            Product Requirement Document (7 Poin Standar)
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            AI menyusun PRD lengkap dengan 7 Poin Standar: Overview, Requirements, Core Features (Fase 1-3+), User Flow,
            Architecture, Database Schema, & Tech Stack. Tujuh poin itu adalah minimum — jika analisis menilai ada aspek
            penting di luarnya, AI menambahkannya sebagai poin 8 dan seterusnya. Anda dapat meninjau & mengedit sebelum
            memproses ke Task AI Agent.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs sm:text-sm">
          <strong>Error:</strong> {errorMessage}
        </div>
      )}

      {/* Generate Action Card if no PRD */}
      {!prd ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-2xl mx-auto flex items-center justify-center">
            <Sparkles className="w-8 h-8" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="font-bold text-slate-900 text-lg">Siap Membuat PRD 7 Poin Otomatis?</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {session.plan
                ? "Sistem akan mengekstrak data dari Project Plan & Arsitektur yang telah disetujui untuk menyusun PRD 7 poin."
                : "Langsung buat PRD berdasarkan deskripsi proyek yang dimasukkan."}
            </p>
          </div>
          <button
            onClick={handleGeneratePRD}
            disabled={loading}
            className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md hover:shadow-lg disabled:opacity-50 inline-flex items-center gap-2"
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
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 border border-slate-800 shadow-xl">
            <div>
              <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-1">
                <FileText className="w-4 h-4" /> Product Requirement Document (PRD 7-Point)
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">{prd.projectTitle || session.title}</h3>
              <p className="text-slate-300 text-xs mt-1 max-w-xl line-clamp-2">{prd.overview || prd.executiveSummary}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-semibold transition-all"
              >
                {copiedMd ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                {copiedMd ? "Tersalin!" : "Copy MD"}
              </button>

              <button
                onClick={handleDownloadMarkdown}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-all shadow-xs"
              >
                <Download className="w-4 h-4" />
                Download .md
              </button>

              <button
                onClick={onGoToNextStep}
                className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs sm:text-sm transition-all shadow-md ml-1"
              >
                Setujui & Lanjut ke Task Agent
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-3">
            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-2xl">
              <button
                onClick={() => setActiveTab("7point")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "7point" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <ListOrdered className="w-4 h-4" />
                1. Tampilan PRD {7 + extraSections.length} Poin
              </button>

              <button
                onClick={() => setActiveTab("overview_edit")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "overview_edit" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Edit3 className="w-4 h-4" />
                2. Overview & Edit Sebelum Build Task
              </button>

              <button
                onClick={() => setActiveTab("markdown")}
                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                  activeTab === "markdown" ? "bg-white text-indigo-900 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <FileCode className="w-4 h-4" />
                3. Raw Markdown Document
              </button>
            </div>

            <button
              onClick={handleGeneratePRD}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-medium transition-all"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Regenerate PRD
            </button>
          </div>

          {/* TAB 1: 7-POINT STRUCTURED PRD DISPLAY */}
          {activeTab === "7point" && (
            <div className="space-y-8">
              {/* 1. Overview */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">1</span>
                  Overview
                </h4>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed">{prd.overview}</p>
              </div>

              {/* 2. Requirements */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">2</span>
                  Requirements (Kebutuhan Fungsional & Non-Fungsional)
                </h4>
                <ul className="space-y-2">
                  {getRequirementsList(prd.requirements).map((req, idx) => (
                    <li key={idx} className="flex items-start gap-2.5 text-xs text-slate-700 p-2.5 bg-slate-50 rounded-xl border border-slate-200/60">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* 3. Core Features by Phase */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-4">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">3</span>
                  Core Features (Tahapan Fase 1, 2, 3+)
                </h4>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200/80 space-y-2">
                    <div className="font-bold text-emerald-900 text-xs flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-emerald-600 text-white rounded text-[10px]">Fase 1</span>
                      Fase MVP Utama
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                      {getPhaseFeatures(prd.coreFeatures, "fase1").map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-200/80 space-y-2">
                    <div className="font-bold text-indigo-900 text-xs flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-indigo-600 text-white rounded text-[10px]">Fase 2</span>
                      Fitur Pengayaan
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                      {getPhaseFeatures(prd.coreFeatures, "fase2").map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="p-4 bg-purple-50/50 rounded-2xl border border-purple-200/80 space-y-2">
                    <div className="font-bold text-purple-900 text-xs flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-purple-600 text-white rounded text-[10px]">Fase 3+</span>
                      Pengembangan Tingkat Lanjut
                    </div>
                    <ul className="space-y-1.5 text-xs text-slate-700 list-disc list-inside">
                      {getPhaseFeatures(prd.coreFeatures, "fase3Plus").map((f, idx) => (
                        <li key={idx}>{f}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* 4. User Flow & Diagram Logika Horizontal */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-4">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">4</span>
                  User Flow & Horizontal Logic Diagram
                </h4>
                <p className="text-xs sm:text-sm text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-2xl border border-slate-200">
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
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">5</span>
                  Architecture
                </h4>
                <div className="p-4 bg-slate-900 text-slate-100 rounded-2xl text-xs sm:text-sm leading-relaxed border border-slate-800 font-mono">
                  {prd.architecture}
                </div>
              </div>

              {/* 6. Database Schema */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">6</span>
                  Database Schema
                </h4>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs sm:text-sm font-mono leading-relaxed whitespace-pre-wrap text-slate-800">
                  {formatDbSchemaToString(prd.databaseSchema)}
                </div>
              </div>

              {/* 7. Tech Stack */}
              <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-3">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                  <span className="w-6 h-6 rounded-lg bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center">7</span>
                  Tech Stack
                </h4>
                <div className="p-4 bg-indigo-50/60 rounded-2xl border border-indigo-100 text-xs sm:text-sm text-indigo-950 font-medium whitespace-pre-wrap">
                  {formatTechStackToString(prd.techStack)}
                </div>
              </div>

              {/* 8+. Poin tambahan yang dinilai perlu oleh AI setelah analisis */}
              {extraSections.map((section) => (
                <div
                  key={section.number}
                  className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-3"
                >
                  <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span className="w-6 h-6 rounded-lg bg-purple-100 text-purple-700 font-bold text-xs flex items-center justify-center">
                      {section.number}
                    </span>
                    {section.title}
                    <span className="ml-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-50 text-purple-700 border border-purple-100">
                      Poin Tambahan
                    </span>
                  </h4>
                  <div className="text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {section.content}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 2: OVERVIEW & EDITABLE REVIEW BEFORE TASK GENERATION */}
          {activeTab === "overview_edit" && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-indigo-200 shadow-md space-y-6">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <SlidersHorizontal className="w-5 h-5 text-indigo-600" />
                    Overview & Modifikasi PRD Sebelum Build Task
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Tinjau dan lakukan penyesuaian teks jika ada poin PRD yang kurang sesuai sebelum AI Agent memecahnya menjadi Kanban task coding.
                  </p>
                </div>

                {saveSuccess && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold animate-in fade-in">
                    <Check className="w-4 h-4 text-emerald-600" /> Perubahan Disimpan!
                  </span>
                )}
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">1. Overview Proyek</label>
                  <textarea
                    rows={3}
                    value={editOverview}
                    onChange={(e) => setEditOverview(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    2. Requirements (Satu poin per baris)
                  </label>
                  <textarea
                    rows={4}
                    value={editRequirements}
                    onChange={(e) => setEditRequirements(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">4. User Flow</label>
                  <textarea
                    rows={3}
                    value={editUserFlow}
                    onChange={(e) => setEditUserFlow(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">5. Architecture</label>
                  <textarea
                    rows={3}
                    value={editArchitecture}
                    onChange={(e) => setEditArchitecture(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">6. Database Schema</label>
                  <textarea
                    rows={3}
                    value={editDatabaseSchema}
                    onChange={(e) => setEditDatabaseSchema(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">7. Tech Stack</label>
                  <textarea
                    rows={2}
                    value={editTechStack}
                    onChange={(e) => setEditTechStack(e.target.value)}
                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between pt-4 border-t border-slate-100 gap-3">
                <button
                  onClick={handleSavePrdOverviewEdits}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  Simpan Perubahan PRD
                </button>

                <button
                  onClick={onGoToNextStep}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md flex items-center gap-2"
                >
                  Setujui & Lanjut ke Step 3: Task Agent
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: RAW MARKDOWN DOCUMENT */}
          {activeTab === "markdown" && (
            <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs prose prose-slate max-w-none text-xs sm:text-sm leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{prd.fullMarkdownText}</ReactMarkdown>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
