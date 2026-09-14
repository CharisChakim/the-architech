import React, { useState, useEffect, useRef } from "react";
import { ProjectSession, PRDData, PRDExtraSection } from "../types";
import { MermaidViewer, Markdown } from "./lazy";
import { GenerationProgress } from "./GenerationProgress";
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
import { useT, TFunction } from "../lib/i18n";
import { generatePrd, generateTasks, isAbort } from "../lib/generate";
import { GenerationDialog } from "./GenerationDialog";

interface Step2PRDProps {
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onGoToNextStep: () => void;
}

// Helpers for safe rendering & formatting
// Label struktural di bawah ini sengaja tidak ikut bahasa UI. keepOrReplace
// membandingkan hasil serialisasi ini dengan teks yang sedang diedit untuk
// menebak apakah pengguna mengubahnya; kalau labelnya bisa berganti bahasa,
// mengganti bahasa akan terbaca sebagai suntingan dan meruntuhkan data
// terstruktur dari LLM menjadi satu string datar.
const formatRequirementsToString = (reqs: any): string => {
  if (!reqs) return "";
  if (typeof reqs === "string") return reqs;
  if (Array.isArray(reqs)) {
    return reqs.map((r) => (typeof r === "string" ? r : r.title || r.description || JSON.stringify(r))).join("\n");
  }
  if (typeof reqs === "object") {
    const fn = (reqs.functional || []).map((f: any) => `[Functional] ${f.title || f.description || f}`);
    const nfn = (reqs.nonFunctional || []).map((nf: any) => `[Non-functional] ${nf.category ? `${nf.category}: ` : ""}${nf.description || nf}`);
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
        return `Table: ${entity.name}\n${entity.description ? `Description: ${entity.description}\n` : ""}${fields}`;
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
    ["Phase 1", "fase1"],
    ["Phase 2", "fase2"],
    ["Phase 3+", "fase3Plus"],
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

// Ketujuh poin baku dan poin tambahan memakai kerangka kartu yang sama; hanya
// nomor, judul, dan isinya yang berbeda.
const PrdSection: React.FC<{
  number: number;
  title: string;
  isExtra?: boolean;
  t: TFunction;
  children: React.ReactNode;
}> = ({ number, title, isExtra, t, children }) => (
  <section className="card p-6 space-y-3">
    <h4 className="font-semibold text-ink text-sm flex flex-wrap items-center gap-2 border-b border-line pb-3">
      <span className="w-5 h-5 shrink-0 rounded-md bg-accent-soft text-accent-ink font-semibold text-[11px] grid place-items-center">
        {number}
      </span>
      {title}
      {isExtra && (
        <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-subtle text-muted">
          {t("Extra point")}
        </span>
      )}
    </h4>
    {children}
  </section>
);

export const Step2PRD: React.FC<Step2PRDProps> = ({ session, onUpdateSession, onGoToNextStep }) => {
  const { t, lang } = useT();
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
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const tasksAbort = useRef<AbortController | null>(null);

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
      onUpdateSession({ prd: await generatePrd(session, lang) });
    } catch (err: any) {
      setErrorMessage(err.message || t("Something went wrong while generating the PRD."));
    } finally {
      setLoading(false);
    }
  };

  // Sama seperti transisi Step 1 -> Step 2: task disusun dulu sambil menunggu
  // di halaman ini, baru pindah. Task yang sudah ada tidak dibuat ulang.
  const handleContinueToTasks = async () => {
    if (session.tasks && session.tasks.length > 0) {
      onGoToNextStep();
      return;
    }

    setErrorMessage(null);
    setGeneratingTasks(true);
    const controller = new AbortController();
    tasksAbort.current = controller;

    try {
      const tasks = await generateTasks(session, lang, controller.signal);
      onUpdateSession({ tasks });
      onGoToNextStep();
    } catch (err: any) {
      if (!isAbort(err)) {
        setErrorMessage(err.message || t("Something went wrong while generating the agent tasks."));
      }
    } finally {
      tasksAbort.current = null;
      setGeneratingTasks(false);
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
    link.download = `PRD_${(session.input.title || "project").toLowerCase().replace(/[^a-z0-9]/g, "_")}.md`;
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
    <div className="max-w-4xl space-y-6 pb-12">
      {/* Page heading */}
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{t("Product Requirement Document")}</h2>
        <p className="text-muted mt-1.5 leading-relaxed">
          {t(
            "Seven standard points — Overview, Requirements, Core Features, User Flow, Architecture, Database Schema, Tech Stack — plus extra points when the analysis calls for them. Review and edit before it is broken into tasks."
          )}
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-danger-soft border border-danger/30 text-danger-ink rounded-xl">
          <strong className="font-semibold">{t("Error")}:</strong> {errorMessage}
        </div>
      )}

      <GenerationProgress
        active={loading}
        label={t("Assembling the PRD & diagram...")}
        expectedMs={45000}
      />

      {/* Generate Action Card if no PRD */}
      {!prd ? (
        <div className="card p-10 text-center space-y-4">
          <div className="w-12 h-12 bg-accent-soft text-accent-ink rounded-xl mx-auto flex items-center justify-center">
            <Sparkles className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="font-semibold text-ink text-base">{t("Generate the 7-point PRD automatically")}</h3>
            <p className="text-muted leading-relaxed">
              {session.plan
                ? t("The system pulls from the approved project plan and architecture to assemble the seven points.")
                : t("Build the PRD straight from the project description you entered.")}
            </p>
          </div>
          <button onClick={handleGeneratePRD} disabled={loading} className="btn-primary mx-auto">
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {t("Assembling the PRD & diagram...")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t("Generate 7-point PRD")}
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* PRD Header & Toolbar */}
          <div className="card p-5 flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-ok text-xs font-medium mb-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("PRD ready")}
              </div>
              <h3 className="text-base font-semibold text-ink">{prd.projectTitle || session.title}</h3>
              <p className="text-muted mt-1 max-w-xl line-clamp-2 leading-relaxed">
                {prd.overview || prd.executiveSummary}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button onClick={handleCopyMarkdown} className="btn-ghost">
                {copiedMd ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
                {copiedMd ? t("Copied") : t("Copy MD")}
              </button>

              <button onClick={handleDownloadMarkdown} className="btn-ghost">
                <Download className="w-4 h-4" />
                {t("Download .md")}
              </button>

              <button onClick={handleContinueToTasks} disabled={generatingTasks} className="btn-primary">
                {t("Continue to tasks")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* View Mode Tabs */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 bg-subtle p-1 rounded-lg">
              {(
                [
                  {
                    id: "7point",
                    label: t("{count}-point PRD", { count: 7 + extraSections.length }),
                    icon: ListOrdered,
                  },
                  { id: "overview_edit", label: t("Review & edit"), icon: Edit3 },
                  { id: "markdown", label: t("Raw markdown"), icon: FileCode },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    activeTab === id ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <button onClick={handleGeneratePRD} disabled={loading} className="btn-outline text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {t("Regenerate PRD")}
            </button>
          </div>

          {/* TAB 1: 7-POINT STRUCTURED PRD DISPLAY */}
          {activeTab === "7point" && (
            <div className="space-y-4">
              <PrdSection t={t} number={1} title={t("Overview")}>
                <p className="text-muted leading-relaxed">{prd.overview}</p>
              </PrdSection>

              <PrdSection t={t} number={2} title={t("Requirements (functional & non-functional)")}>
                <ul className="space-y-1.5 text-muted">
                  {getRequirementsList(prd.requirements).map((req, idx) => (
                    <li key={idx} className="flex gap-2.5">
                      <span className="text-faint shrink-0">&middot;</span>
                      <span>{req}</span>
                    </li>
                  ))}
                </ul>
              </PrdSection>

              <PrdSection t={t} number={3} title={t("Core features (phase 1, 2, 3+)")}>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
                  {(
                    [
                      [t("Phase 1"), t("Core MVP"), "fase1"],
                      [t("Phase 2"), t("Enrichment"), "fase2"],
                      [t("Phase 3+"), t("Advanced"), "fase3Plus"],
                    ] as const
                  ).map(([label, caption, key]) => (
                    <div key={key} className="space-y-2">
                      <div className="flex items-baseline gap-2 pb-2 border-b border-line">
                        <span className="font-medium text-ink">{label}</span>
                        <span className="text-xs text-faint">{caption}</span>
                      </div>
                      <ul className="space-y-1.5 text-muted">
                        {getPhaseFeatures(prd.coreFeatures, key).map((f, idx) => (
                          <li key={idx} className="flex gap-2">
                            <span className="text-faint shrink-0">&middot;</span>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </PrdSection>

              <PrdSection t={t} number={4} title={t("User flow & logic diagram")}>
                <p className="text-muted leading-relaxed">{prd.userFlow}</p>

                {prd.logicFlowMermaid && (
                  <MermaidViewer
                    chart={prd.logicFlowMermaid}
                    explanation={prd.logicFlowExplanation}
                    title={t("User flow & logic diagram: {title}", { title: prd.projectTitle })}
                  />
                )}
              </PrdSection>

              <PrdSection t={t} number={5} title={t("Architecture")}>
                <p className="text-muted leading-relaxed">{prd.architecture}</p>
              </PrdSection>

              <PrdSection t={t} number={6} title={t("Database schema")}>
                <div className="p-4 bg-code text-code-ink rounded-lg text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto">
                  {formatDbSchemaToString(prd.databaseSchema)}
                </div>
              </PrdSection>

              <PrdSection t={t} number={7} title={t("Tech stack")}>
                <div className="p-4 bg-accent-soft text-accent-ink rounded-lg font-medium whitespace-pre-wrap">
                  {formatTechStackToString(prd.techStack)}
                </div>
              </PrdSection>

              {/* 8+. Poin tambahan yang dinilai perlu oleh AI setelah analisis */}
              {extraSections.map((section) => (
                <PrdSection t={t} key={section.number} number={section.number} title={section.title} isExtra>
                  <div className="text-muted leading-relaxed whitespace-pre-wrap">{section.content}</div>
                </PrdSection>
              ))}
            </div>
          )}

          {/* TAB 2: OVERVIEW & EDITABLE REVIEW BEFORE TASK GENERATION */}
          {activeTab === "overview_edit" && (
            <div className="card p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
                <div>
                  <h3 className="font-semibold text-ink text-sm flex items-center gap-2">
                    <SlidersHorizontal className="w-4 h-4 text-faint" />
                    {t("Review & edit the PRD before it becomes tasks")}
                  </h3>
                  <p className="text-xs text-faint mt-1">
                    {t("Adjust anything that reads wrong here; the AI agent works from this version when it builds the Kanban tasks.")}
                  </p>
                </div>

                {saveSuccess && (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-ok-soft text-ok-ink rounded-lg text-xs font-medium animate-in fade-in">
                    <Check className="w-3.5 h-3.5" /> {t("Changes saved")}
                  </span>
                )}
              </div>

              <div className="space-y-4">
                <div>
                  <label className="field-label">{t("1. Project overview")}</label>
                  <textarea
                    rows={3}
                    value={editOverview}
                    onChange={(e) => setEditOverview(e.target.value)}
                    className="field resize-y"
                  />
                </div>

                <div>
                  <label className="field-label">{t("2. Requirements (one per line)")}</label>
                  <textarea
                    rows={4}
                    value={editRequirements}
                    onChange={(e) => setEditRequirements(e.target.value)}
                    className="field resize-y"
                  />
                </div>

                <div>
                  <label className="field-label">{t("4. User flow")}</label>
                  <textarea
                    rows={3}
                    value={editUserFlow}
                    onChange={(e) => setEditUserFlow(e.target.value)}
                    className="field resize-y"
                  />
                </div>

                <div>
                  <label className="field-label">{t("5. Architecture")}</label>
                  <textarea
                    rows={3}
                    value={editArchitecture}
                    onChange={(e) => setEditArchitecture(e.target.value)}
                    className="field resize-y font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="field-label">{t("6. Database schema")}</label>
                  <textarea
                    rows={4}
                    value={editDatabaseSchema}
                    onChange={(e) => setEditDatabaseSchema(e.target.value)}
                    className="field resize-y font-mono text-xs"
                  />
                </div>

                <div>
                  <label className="field-label">{t("7. Tech stack")}</label>
                  <textarea
                    rows={2}
                    value={editTechStack}
                    onChange={(e) => setEditTechStack(e.target.value)}
                    className="field resize-y"
                  />
                </div>

                {/* Poin 8+ : bisa diubah, dihapus, atau ditambah sendiri */}
                <div className="pt-4 border-t border-line space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="block text-xs font-medium text-muted">{t("Extra points (8 onwards)")}</span>
                      <p className="text-xs text-faint mt-0.5">
                        {t("Points beyond the seven required ones. They are renumbered automatically on save.")}
                      </p>
                    </div>
                    <button type="button" onClick={addExtraSection} className="btn-outline text-xs">
                      <Plus className="w-3.5 h-3.5" />
                      {t("Add point")}
                    </button>
                  </div>

                  {editExtraSections.length === 0 ? (
                    <p className="text-xs text-faint border border-dashed border-line rounded-lg p-3">
                      {t("No extra points yet. The AI adds them when its analysis calls for it, or you can add your own.")}
                    </p>
                  ) : (
                    editExtraSections.map((section, idx) => (
                      <div key={idx} className="p-3 bg-subtle rounded-lg space-y-2">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 shrink-0 rounded-md bg-accent-soft text-accent-ink font-semibold text-[11px] grid place-items-center">
                            {8 + idx}
                          </span>
                          <input
                            type="text"
                            value={section.title}
                            onChange={(e) => updateExtraSection(idx, { title: e.target.value })}
                            placeholder={t("Point title, e.g. Test plan")}
                            className="field flex-1 min-w-0 font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => removeExtraSection(idx)}
                            className="p-2 shrink-0 text-faint hover:text-danger rounded-lg transition-colors"
                            title={t("Delete this point")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={section.content}
                          onChange={(e) => updateExtraSection(idx, { content: e.target.value })}
                          placeholder={t("Content for this point...")}
                          className="field resize-y"
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 -mx-6 -mb-6 px-6 py-4 border-t border-line">
                <button onClick={handleSavePrdOverviewEdits} className="btn-outline">
                  <Check className="w-4 h-4" />
                  {t("Save changes")}
                </button>

                <button onClick={handleContinueToTasks} disabled={generatingTasks} className="btn-primary">
                  {t("Approve & continue to tasks")}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: RAW MARKDOWN DOCUMENT */}
          {activeTab === "markdown" && (
            <div className="card p-6 markdown-body">
              <Markdown>{prd.fullMarkdownText}</Markdown>
            </div>
          )}
        </div>
      )}
      <GenerationDialog
        open={generatingTasks}
        title={t("Preparing the agent tasks")}
        label={t("Building the task board...")}
        expectedMs={45000}
        onCancel={() => tasksAbort.current?.abort()}
      />

    </div>
  );
};
