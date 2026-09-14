import React, { useState, useEffect, useRef } from "react";
import { ProjectSession, FollowUpQuestion, ProjectPlan, FeatureSpec } from "../types";
import { MermaidViewer, PlanCanvas } from "./lazy";
import { FeatureEditor } from "./FeatureEditor";
import { GenerationProgress } from "./GenerationProgress";
import { SAMPLE_PROJECTS, SampleProject, sampleText } from "../lib/sampleData";
import { generatePrd, isAbort } from "../lib/generate";
import { GenerationDialog } from "./GenerationDialog";
import {
  Network,
  Compass,
  Sparkles,
  HelpCircle,
  ArrowRight,
  Layers,
  Clock,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Wand2,
  ListTodo,
  Cpu,
  Zap,
  Edit3,
  Check,
  Eye,
  Undo2,
} from "lucide-react";
import { useT } from "../lib/i18n";

interface Step1PlanProps {
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onGoToNextStep: () => void;
  onSelectSample: (sample: SampleProject) => void;
}

const sectionTitle = "font-semibold text-ink text-sm flex items-center gap-2";

// Kalau kolom judul dibiarkan kosong, riwayat masih perlu sesuatu untuk
// ditampilkan sebelum AI mengusulkan nama. Potongan awal ide dipakai sementara.
const provisionalTitle = (idea: string): string => {
  const firstLine = idea.trim().split("\n")[0].trim();
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57).trimEnd() + "...";
};

export const Step1Plan: React.FC<Step1PlanProps> = ({
  session,
  onUpdateSession,
  onGoToNextStep,
  onSelectSample,
}) => {
  const { t, lang } = useT();
  const [title, setTitle] = useState(session.input.title || "");
  const [description, setDescription] = useState(session.input.description || "");
  const [targetAudience, setTargetAudience] = useState(session.input.targetAudience || "");
  const [techStackPreference, setTechStackPreference] = useState(session.input.techStackPreference || "");

  const [answers, setAnswers] = useState<Record<string, string>>(session.input.answersToFollowUp || {});
  const [customAnswerActive, setCustomAnswerActive] = useState<Record<string, boolean>>({});

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingFeatures, setEditingFeatures] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const [generatingPrd, setGeneratingPrd] = useState(false);
  const prdAbort = useRef<AbortController | null>(null);

  // Suntingan fitur langsung mengubah sesi, jadi menghapus fitur secara keliru
  // tidak bisa dibatalkan tanpa salinan. Ini dipotret saat masuk mode edit dan
  // dikembalikan utuh kalau pengguna membatalkan — termasuk penanda tidak
  // sinkron, yang kalau tidak ikut dipulihkan akan menyisakan peringatan
  // "selaraskan ulang" untuk perubahan yang sudah dibuang.
  const [featuresBackup, setFeaturesBackup] = useState<{
    features: FeatureSpec[];
    wasEdited: boolean;
  } | null>(null);

  const startEditingFeatures = () => {
    if (!session.plan) return;
    setFeaturesBackup({
      features: JSON.parse(JSON.stringify(session.plan.specs.coreFeatures)),
      wasEdited: Boolean(session.planFeaturesEdited),
    });
    setEditingFeatures(true);
  };

  const finishEditingFeatures = () => {
    setFeaturesBackup(null);
    setEditingFeatures(false);
  };

  const cancelEditingFeatures = () => {
    if (featuresBackup && session.plan) {
      onUpdateSession({
        plan: { ...session.plan, specs: { ...session.plan.specs, coreFeatures: featuresBackup.features } },
        planFeaturesEdited: featuresBackup.wasEdited,
      });
    }
    finishEditingFeatures();
  };

  // Tiga tahap di dalam Step 1, masing-masing halamannya sendiri: isi data ->
  // jawab pertanyaan klarifikasi -> tinjau arsitektur.
  const initialSubView = (): "form" | "clarify" | "plan_review" => {
    if (session.plan) return "plan_review";
    if (session.followUps.length > 0) return "clarify";
    return "form";
  };
  const [subView, setSubView] = useState<"form" | "clarify" | "plan_review">(initialSubView);

  // Sesi bisa berganti dari luar (buka riwayat, proyek baru, contoh template)
  // sementara komponen ini tetap ter-mount, sehingga state form harus mengikuti.
  // Dikunci ke session.id supaya tidak menimpa apa yang sedang diketik pengguna.
  useEffect(() => {
    setTitle(session.input.title || "");
    setDescription(session.input.description || "");
    setTargetAudience(session.input.targetAudience || "");
    setTechStackPreference(session.input.techStackPreference || "");
    setAnswers(session.input.answersToFollowUp || {});
    setCustomAnswerActive({});
    setErrorMessage(null);
    setEditingFeatures(false);
    setFeaturesBackup(null);
    setSubView(initialSubView());
  }, [session.id]);

  // Klarifikasi bertahap: ronde pertama memulai dari nol, ronde lanjutan
  // mengirim jawaban yang sudah ada agar LLM bisa menilai apa yang masih kurang
  // dan menambah pertanyaan hanya jika benar-benar masih ragu.
  const requestFollowUps = async (isFirstRound: boolean) => {
    if (!description.trim()) {
      setErrorMessage(t("Enter a project description first."));
      return;
    }

    setErrorMessage(null);
    setLoadingQuestions(true);

    try {
      const nextRound = isFirstRound ? 1 : (session.clarificationRound || 1) + 1;

      const res = await fetch("/api/followup-questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || provisionalTitle(description),
          description,
          targetAudience,
          techStackPreference,
          previousAnswers: isFirstRound ? {} : answers,
          round: nextRound,
          llmConfig: session.llmConfig,
          language: lang,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("Failed to generate the follow-up questions."));

      const newQuestions: FollowUpQuestion[] = data.questions || [];

      // Jawaban lama dipertahankan; hanya pertanyaan baru yang diberi nilai awal.
      const mergedAnswers: Record<string, string> = isFirstRound ? {} : { ...answers };
      newQuestions.forEach((q) => {
        if (mergedAnswers[q.question] !== undefined) return;
        if (q.options && q.options.length > 0) {
          mergedAnswers[q.question] = q.options[0];
        } else if (q.suggestedAnswer) {
          mergedAnswers[q.question] = q.suggestedAnswer;
        }
      });

      const mergedQuestions = isFirstRound ? newQuestions : [...session.followUps, ...newQuestions];

      setAnswers(mergedAnswers);
      onUpdateSession({
        input: {
          title,
          description,
          targetAudience,
          techStackPreference,
          answersToFollowUp: mergedAnswers,
        },
        followUps: mergedQuestions,
        clarificationRound: nextRound,
        clarificationComplete: data.needsMoreInfo === false,
        readinessNote: data.readinessNote || "",
      });

      // Pertanyaan punya halamannya sendiri, jadi pindah setelah ronde pertama.
      if (isFirstRound) setSubView("clarify");
    } catch (err: any) {
      setErrorMessage(err.message || t("Something went wrong talking to the LLM."));
    } finally {
      setLoadingQuestions(false);
    }
  };

  const handleAnalyzeQuestions = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    requestFollowUps(true);
  };

  // Generate full Project Plan
  const handleGeneratePlan = async () => {
    setErrorMessage(null);
    setLoadingPlan(true);

    try {
      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || provisionalTitle(description),
          description,
          targetAudience,
          techStackPreference,
          answers,
          llmConfig: session.llmConfig,
          language: lang,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("Failed to generate the project plan."));

      const plan: ProjectPlan = data;
      // Judul dari pengguna selalu menang. Usulan AI hanya mengisi kalau kolom
      // judul dibiarkan kosong.
      const resolvedTitle =
        title.trim() || (data.suggestedTitle || "").trim() || provisionalTitle(description);
      onUpdateSession({
        title: resolvedTitle,
        input: {
          title: resolvedTitle,
          description,
          targetAudience,
          techStackPreference,
          answersToFollowUp: answers,
        },
        plan,
        planFeaturesEdited: false,
      });

      // Switch sub-view directly to Architecture & Diagram review page!
      setSubView("plan_review");
    } catch (err: any) {
      setErrorMessage(err.message || t("Failed to generate the project plan."));
    } finally {
      setLoadingPlan(false);
    }
  };

  // Fitur adalah sumber kebenaran; arsitektur, diagram, roadmap, dan estimasi
  // adalah turunannya. Menyunting fitur karena itu menandai plan tidak sinkron
  // sampai diselaraskan ulang, bukan langsung menambal bagian turunannya.
  const handleFeaturesChange = (coreFeatures: FeatureSpec[]) => {
    if (!session.plan) return;
    onUpdateSession({
      plan: { ...session.plan, specs: { ...session.plan.specs, coreFeatures } },
      planFeaturesEdited: true,
    });
  };

  const handleResyncPlan = async () => {
    if (!session.plan) return;

    setErrorMessage(null);
    setResyncing(true);

    try {
      const lockedFeatures = session.plan.specs.coreFeatures;

      const res = await fetch("/api/generate-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || provisionalTitle(description),
          description,
          targetAudience,
          techStackPreference,
          answers,
          lockedFeatures,
          llmConfig: session.llmConfig,
          language: lang,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("Failed to re-sync the plan."));

      // coreFeatures tidak perlu dipasang ulang di sini: saat lockedFeatures
      // dikirim, server yang menempelkannya kembali (sudah dinormalkan), bukan
      // model yang menyusunnya.
      onUpdateSession({ plan: data as ProjectPlan, planFeaturesEdited: false });
      finishEditingFeatures();
    } catch (err: any) {
      setErrorMessage(err.message || t("Failed to re-sync the plan."));
    } finally {
      setResyncing(false);
    }
  };

  // Pindah ke halaman PRD hanya setelah PRD-nya benar-benar ada. Kalau
  // dibalik, pengguna mendarat di halaman kosong dan menunggu di sana; di sini
  // ia menunggu di halaman yang sudah dikenalnya, dan bisa membatalkan dengan
  // tetap tinggal. PRD yang sudah ada tidak dibuat ulang diam-diam.
  const handleContinueToPrd = async () => {
    if (session.prd) {
      onGoToNextStep();
      return;
    }

    setErrorMessage(null);
    setGeneratingPrd(true);
    const controller = new AbortController();
    prdAbort.current = controller;

    try {
      const prd = await generatePrd(session, lang, controller.signal);
      onUpdateSession({ prd });
      onGoToNextStep();
    } catch (err: any) {
      // Pembatalan adalah keputusan pengguna, bukan kegagalan: tidak ada yang
      // perlu dilaporkan selain kembali ke halaman apa adanya.
      if (!isAbort(err)) {
        setErrorMessage(err.message || t("Something went wrong while generating the PRD."));
      }
    } finally {
      prdAbort.current = null;
      setGeneratingPrd(false);
    }
  };

  const handleSelectOption = (questionStr: string, selectedOption: string) => {
    setAnswers((prev) => ({ ...prev, [questionStr]: selectedOption }));
    setCustomAnswerActive((prev) => ({ ...prev, [questionStr]: false }));
  };

  const handleFillAllSuggested = () => {
    const updated: Record<string, string> = { ...answers };
    session.followUps.forEach((q) => {
      if (q.options && q.options.length > 0) {
        updated[q.question] = q.options[0];
      } else {
        updated[q.question] = q.suggestedAnswer;
      }
    });
    setAnswers(updated);
  };

  const plan = session.plan;

  return (
    <div className="space-y-6 pb-12">
      {/* Page heading */}
      <div className="space-y-4">
        <div className="max-w-2xl">
          <h2 className="text-xl font-semibold tracking-tight text-ink">
            {t("Clarify the idea, architecture, and logic diagram")}
          </h2>
          <p className="text-muted mt-1.5 leading-relaxed">
            {t(
              "Start from a rough idea. The AI asks clarifying questions until it is confident enough, then drafts an architecture and diagram for you to review before the PRD."
            )}
          </p>
        </div>

        {/* Penanda tahap. Hanya tahap yang sudah tersedia bisa diklik. */}
        {(session.followUps.length > 0 || plan) && (
          <div className="inline-flex items-center gap-1 p-1 bg-subtle rounded-lg">
            {(
              [
                { id: "form", label: t("Project data"), icon: Edit3, available: true },
                {
                  id: "clarify",
                  label: t("Clarification"),
                  icon: HelpCircle,
                  available: session.followUps.length > 0,
                },
                { id: "plan_review", label: t("Architecture review"), icon: Eye, available: Boolean(plan) },
              ] as const
            ).map(({ id, label, icon: Icon, available }) => (
              <button
                key={id}
                onClick={() => available && setSubView(id)}
                disabled={!available}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                  subView === id
                    ? "bg-surface text-ink shadow-xs"
                    : available
                      ? "text-muted hover:text-ink"
                      : "text-faint cursor-not-allowed"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="max-w-3xl p-4 bg-danger-soft border border-danger/30 text-danger-ink rounded-xl text-sm flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-danger shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">{t("Something went wrong")}</strong>
            {errorMessage}
          </div>
        </div>
      )}

      {/* SUBVIEW 1: DATA PROYEK */}
      {subView === "form" && (
        // Formulir sendirian menyisakan kolom kosong lebar di kanan. Ruang itu
        // diisi hal yang memang dibutuhkan tepat di layar ini: jalan pintas
        // template, dan penjelasan apa yang membuat deskripsi cukup baik —
        // deskripsi adalah satu-satunya isian wajib dan penentu mutu keluaran.
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start max-w-6xl">
        <form onSubmit={handleAnalyzeQuestions} className="card p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="field-label">{t("Project title")}</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={t("e.g. AI Code Reviewer Bot")}
                className="field"
              />
              <p className="field-hint">{t("Leave empty and the AI proposes a title.")}</p>
            </div>

            <div>
              <label className="field-label">{t("Target users")}</label>
              <input
                type="text"
                value={targetAudience}
                onChange={(e) => setTargetAudience(e.target.value)}
                placeholder={t("e.g. tech leads, students, shop cashiers")}
                className="field"
              />
              <p className="field-hint">{t("Optional.")}</p>
            </div>
          </div>

          <div>
            <label className="field-label">
              {t("Detailed project description")} <span className="text-danger">*</span>
            </label>
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t(
                "Describe your idea: the problem it solves, the main features you picture, and how it works."
              )}
              className="field leading-relaxed resize-y"
            />
          </div>

          <div>
            <label className="field-label">{t("Preferred tech stack")}</label>
            <input
              type="text"
              value={techStackPreference}
              onChange={(e) => setTechStackPreference(e.target.value)}
              placeholder={t("e.g. React, Node.js, PostgreSQL")}
              className="field"
            />
            <p className="field-hint">{t("Optional. Leave empty and the AI recommends one.")}</p>
          </div>

          {/* Bilah aksi dibuat full-bleed dengan margin negatif agar garis
              pemisahnya menyentuh tepi kartu. */}
          <div className="flex flex-wrap items-center justify-between gap-3 -mx-6 -mb-6 px-6 py-4 border-t border-line">
            <span className="text-xs text-faint truncate">
              {session.llmConfig.provider} · {session.llmConfig.modelName || t("default model")}
            </span>

            <button
              type="submit"
              disabled={loadingQuestions || !description.trim()}
              className="btn-primary shrink-0"
            >
              {loadingQuestions ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t("Analysing...")}
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" />
                  {t("Analyse the idea & draft questions")}
                </>
              )}
            </button>
          </div>
        </form>

        <aside className="space-y-4">
          <GenerationProgress
            active={loadingQuestions}
            label={t("Analysing your idea...")}
            expectedMs={15000}
          />

          <div className="card p-5 space-y-3">
            <h3 className={sectionTitle}>
              <Layers className="w-4 h-4 text-faint" />
              {t("Start from a template")}
            </h3>
            <p className="text-xs text-faint leading-relaxed">
              {t("Fills the form with a worked example you can edit.")}
            </p>
            <div className="space-y-1.5">
              {SAMPLE_PROJECTS.map((sample) => {
                const copy = sampleText(sample, lang);
                return (
                  <button
                    key={sample.id}
                    type="button"
                    onClick={() => onSelectSample(sample)}
                    className="w-full text-left p-3 rounded-lg border border-line hover:bg-subtle transition-colors"
                  >
                    <span className="block text-xs font-medium text-ink">{copy.name}</span>
                    <span className="block text-xs text-faint leading-relaxed mt-0.5">{copy.tagline}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card p-5 space-y-3">
            <h3 className={sectionTitle}>
              <Wand2 className="w-4 h-4 text-faint" />
              {t("What makes a good description")}
            </h3>
            <ul className="space-y-2 text-xs text-muted leading-relaxed">
              {[
                t("Name the problem it solves, and who runs into it."),
                t("List the features you already picture, even roughly."),
                t("Mention hard constraints: an existing stack, a deadline, something you must not use."),
                t("The more you put here, the fewer clarification rounds the AI needs."),
              ].map((tip) => (
                <li key={tip} className="flex gap-2">
                  <span className="text-faint shrink-0">&middot;</span>
                  {tip}
                </li>
              ))}
            </ul>
          </div>
        </aside>
        </div>
      )}

      {/* SUBVIEW 2: HALAMAN KLARIFIKASI */}
      {subView === "clarify" && session.followUps.length > 0 && (
        // Sama seperti halaman data proyek: kolom kanan diisi konteks yang
        // dibutuhkan sambil menjawab — apa yang tadi ditulis, dan jalan pintas
        // untuk memperbaikinya.
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start max-w-6xl">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h3 className={sectionTitle}>
                <HelpCircle className="w-4 h-4 text-faint" />
                {t("Clarification from the AI")}
              </h3>
              <p className="text-xs text-faint mt-1">
                {t("Pick one of the options, or write your own if none of them fit.")}
              </p>
            </div>

            <button onClick={handleFillAllSuggested} className="btn-outline text-xs">
              <Zap className="w-3.5 h-3.5 text-faint" />
              {t("Use the AI recommendations")}
            </button>
          </div>

          {/* Penilaian kesiapan dari LLM pada ronde klarifikasi terakhir */}
          {session.readinessNote && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                session.clarificationComplete
                  ? "bg-ok-soft border-ok/30 text-ok-ink"
                  : "bg-warn-soft border-warn/30 text-warn-ink"
              }`}
            >
              {session.clarificationComplete ? (
                <CheckCircle2 className="w-4 h-4 text-ok shrink-0 mt-0.5" />
              ) : (
                <HelpCircle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
              )}
              <div className="leading-relaxed">
                <strong className="font-semibold block mb-0.5">
                  {session.clarificationComplete
                    ? t("Round {round}: the AI considers the information sufficient.", {
                        round: session.clarificationRound ?? 1,
                      })
                    : t("Round {round}: the AI still has questions.", {
                        round: session.clarificationRound ?? 1,
                      })}
                </strong>
                {session.readinessNote}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {session.followUps.map((q, idx) => {
              const currentAnswer = answers[q.question] || "";
              const isCustom = customAnswerActive[q.question] || false;
              const questionOptions = q.options && q.options.length > 0 ? q.options : [q.suggestedAnswer];

              return (
                <div key={q.id || idx} className="card p-5 space-y-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-block px-1.5 py-0.5 rounded bg-accent-soft text-accent-ink text-[11px] font-semibold uppercase tracking-wider">
                        {q.category}
                      </span>
                      {q.round && q.round > 1 && (
                        <span className="inline-block px-1.5 py-0.5 rounded bg-subtle text-muted text-[11px] font-semibold uppercase tracking-wider">
                          {t("Round {round}", { round: q.round })}
                        </span>
                      )}
                    </div>
                    <h4 className="font-semibold text-ink text-sm">{q.question}</h4>
                    <p className="text-xs text-faint leading-relaxed">{q.explanation}</p>
                  </div>

                  {/* Options Pills */}
                  <div className="flex flex-wrap gap-2">
                    {questionOptions.map((opt, oIdx) => {
                      const isSelected = !isCustom && currentAnswer === opt;
                      return (
                        <button
                          key={oIdx}
                          type="button"
                          onClick={() => handleSelectOption(q.question, opt)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border text-left transition-colors flex items-center gap-2 ${
                            isSelected
                              ? "bg-accent text-accent-fg border-accent"
                              : "bg-subtle text-muted border-line hover:text-ink"
                          }`}
                        >
                          {isSelected ? (
                            <Check className="w-3.5 h-3.5 shrink-0" />
                          ) : (
                            <span className="w-1.5 h-1.5 rounded-full bg-strong shrink-0" />
                          )}
                          <span>{opt}</span>
                        </button>
                      );
                    })}

                    {/* Custom Manual Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomAnswerActive((prev) => ({ ...prev, [q.question]: true }));
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border text-left transition-colors flex items-center gap-2 ${
                        isCustom
                          ? "bg-ink text-canvas border-ink"
                          : "bg-surface text-muted border-line hover:text-ink"
                      }`}
                    >
                      <Edit3 className="w-3.5 h-3.5 shrink-0" />
                      <span>{t("My own answer")}</span>
                    </button>
                  </div>

                  {/* Custom Input Field if Active */}
                  {isCustom && (
                    <input
                      type="text"
                      value={currentAnswer}
                      onChange={(e) => setAnswers({ ...answers, [q.question]: e.target.value })}
                      placeholder={t("Type your own answer here...")}
                      className="field animate-in fade-in"
                    />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              onClick={() => requestFollowUps(false)}
              disabled={loadingQuestions || loadingPlan}
              className="btn-outline"
              title={t("Send the current answers so the AI can judge whether anything is still missing")}
            >
              {loadingQuestions ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t("Reviewing your answers...")}
                </>
              ) : (
                <>
                  <HelpCircle className="w-4 h-4" />
                  {t("Continue clarifying (round {round})", { round: (session.clarificationRound || 1) + 1 })}
                </>
              )}
            </button>

            <button onClick={handleGeneratePlan} disabled={loadingPlan || loadingQuestions} className="btn-primary">
              {loadingPlan ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  {t("Drafting the architecture & diagram...")}
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  {t("Generate project plan")}
                </>
              )}
            </button>
          </div>
        </div>

        <aside className="space-y-4">
          <GenerationProgress
            active={loadingQuestions || loadingPlan}
            label={loadingPlan ? t("Drafting the architecture & diagram...") : t("Reviewing your answers...")}
            expectedMs={loadingPlan ? 40000 : 18000}
          />

          <div className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <h3 className={sectionTitle}>
                <Edit3 className="w-4 h-4 text-faint" />
                {t("Your project")}
              </h3>
              <button onClick={() => setSubView("form")} className="btn-ghost !py-1 !px-2 text-xs shrink-0">
                {t("Edit")}
              </button>
            </div>

            <div>
              <p className="text-xs font-medium text-faint mb-0.5">{t("Project title")}</p>
              <p className="text-xs text-ink">{title || t("Untitled project")}</p>
            </div>

            <div>
              <p className="text-xs font-medium text-faint mb-0.5">{t("Detailed project description")}</p>
              <p className="text-xs text-muted leading-relaxed max-h-40 overflow-y-auto">{description}</p>
            </div>

            {targetAudience && (
              <div>
                <p className="text-xs font-medium text-faint mb-0.5">{t("Target users")}</p>
                <p className="text-xs text-muted">{targetAudience}</p>
              </div>
            )}

            {techStackPreference && (
              <div>
                <p className="text-xs font-medium text-faint mb-0.5">{t("Preferred tech stack")}</p>
                <p className="text-xs text-muted">{techStackPreference}</p>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-2">
            <h3 className={sectionTitle}>
              <HelpCircle className="w-4 h-4 text-faint" />
              {t("What happens next")}
            </h3>
            <p className="text-xs text-muted leading-relaxed">
              {t(
                "Answer what you can, then generate the plan. If the AI still has gaps it will say so above, and one more round costs you nothing but a minute."
              )}
            </p>
          </div>
        </aside>
        </div>
      )}

      {/* SUBVIEW 3: REVIEW ARSITEKTUR & DIAGRAM */}
      {subView === "plan_review" && plan && (
        <div className="space-y-4 animate-in fade-in duration-300">
          {/* Plan summary & primary actions */}
          <div className="card p-5 flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-ok text-xs font-medium mb-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("Plan & architecture ready")}
              </div>
              <h3 className="text-base font-semibold text-ink">{session.input.title || session.title}</h3>
              <p className="text-muted mt-1 max-w-2xl leading-relaxed">{plan.summary}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => setSubView("form")} className="btn-ghost">
                <Edit3 className="w-3.5 h-3.5" /> {t("Edit input")}
              </button>

              <button onClick={handleContinueToPrd} disabled={generatingPrd} className="btn-primary">
                {t("Continue to the PRD")}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Fitur sudah disunting tapi bagian turunannya belum mengikuti. */}
          {session.planFeaturesEdited && (
            <div className="p-4 bg-warn-soft border border-warn/30 rounded-xl flex flex-wrap items-start justify-between gap-4">
              <div className="flex items-start gap-3 min-w-0">
                <AlertTriangle className="w-4 h-4 text-warn shrink-0 mt-0.5" />
                <div className="text-warn-ink leading-relaxed">
                  <strong className="font-semibold block mb-0.5">
                    {t("Features changed; the rest has not caught up.")}
                  </strong>
                  {t(
                    "The architecture, diagram, roadmap and estimate still describe the version before your edit. Re-sync so the PRD does not inherit parts that no longer apply."
                  )}
                </div>
              </div>

              <button
                onClick={handleResyncPlan}
                disabled={resyncing}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-warn text-white text-sm font-medium hover:brightness-110 transition-all disabled:opacity-50 shrink-0"
              >
                <RefreshCw className={`w-4 h-4 ${resyncing ? "animate-spin" : ""}`} />
                {resyncing ? t("Re-syncing...") : t("Re-sync")}
              </button>
            </div>
          )}

          <GenerationProgress active={resyncing} label={t("Re-syncing the plan...")} expectedMs={40000} />

          {/* Kanvas struktur: Perencanaan -> Fitur -> Sub Fitur */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className={sectionTitle}>
                <Network className="w-4 h-4 text-faint" />
                {t("Feature structure")}
              </h4>
              <div className="flex items-center gap-3">
                <span className="text-xs text-faint">
                  {t("{features} features · {subs} sub features", {
                    features: plan.specs.coreFeatures.length,
                    subs: plan.specs.coreFeatures.reduce((n, f) => n + (f.subFeatures?.length || 0), 0),
                  })}
                </span>
                {editingFeatures ? (
                  <div className="flex items-center gap-1">
                    <button onClick={cancelEditingFeatures} className="btn-ghost">
                      <Undo2 className="w-3.5 h-3.5" />
                      {t("Cancel edit")}
                    </button>
                    <button onClick={finishEditingFeatures} className="btn-ghost">
                      <Check className="w-3.5 h-3.5" />
                      {t("Done editing")}
                    </button>
                  </div>
                ) : (
                  <button onClick={startEditingFeatures} className="btn-ghost">
                    <Edit3 className="w-3.5 h-3.5" />
                    {t("Edit features")}
                  </button>
                )}
              </div>
            </div>

            <PlanCanvas title={session.input.title || session.title || t("Planning")} features={plan.specs.coreFeatures} />

            {/* Kanvas di atas ikut berubah begitu daftar fitur disunting. */}
            {editingFeatures && <FeatureEditor features={plan.specs.coreFeatures} onChange={handleFeaturesChange} />}
          </div>

          {/* Dedicated Horizontal Logic Diagram Section */}
          {plan.architectureDraft.diagramMermaid && (
            <div className="space-y-2.5 pt-2">
              <h4 className={sectionTitle}>
                <Layers className="w-4 h-4 text-faint" />
                {t("System logic & architecture diagram")}
              </h4>

              <MermaidViewer
                chart={plan.architectureDraft.diagramMermaid}
                explanation={plan.architectureDraft.dataFlow}
title={t("System architecture: {title}", { title: session.input.title || session.title })}
              />
            </div>
          )}

          {/* Grid Core Features & Tech Stack */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 pt-2">
            {/* Core Features */}
            <div className="card p-5 space-y-3">
              <h4 className={`${sectionTitle} border-b border-line pb-3`}>
                <ListTodo className="w-4 h-4 text-faint" />
                {t("Core feature priorities")}
              </h4>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {plan.specs.coreFeatures.map((feat, idx) => (
                  <div key={idx} className="p-3 bg-subtle rounded-lg space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink text-xs">{feat.name}</span>
                      <span
                        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${
                          feat.priority === "P0"
                            ? "bg-danger-soft text-danger-ink"
                            : feat.priority === "P1"
                              ? "bg-warn-soft text-warn-ink"
                              : "bg-surface text-muted"
                        }`}
                      >
                        {feat.priority} {feat.priority === "P0" ? t("(MVP)") : ""}
                      </span>
                    </div>
                    <p className="text-muted leading-relaxed">{feat.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tech Stack */}
            <div className="card p-5 space-y-3">
              <h4 className={`${sectionTitle} border-b border-line pb-3`}>
                <Cpu className="w-4 h-4 text-faint" />
                {t("Recommended tech stack")}
              </h4>
              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {plan.specs.techStack.map((tech, idx) => (
                  <div key={idx} className="p-3 bg-subtle rounded-lg space-y-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-accent-soft text-accent-ink">
                        {tech.layer}
                      </span>
                      <span className="font-semibold text-ink text-xs">{tech.technology}</span>
                    </div>
                    <p className="text-muted leading-relaxed">{tech.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Draf Arsitektur Details */}
          <div className="card p-5 space-y-5">
            <h4 className={sectionTitle}>
              <Layers className="w-4 h-4 text-faint" />
              {t("Component & security detail")}
            </h4>

            <div>
              <p className="text-xs font-medium text-faint mb-1.5">{t("Architecture overview")}</p>
              <p className="text-muted leading-relaxed max-w-4xl">{plan.architectureDraft.overview}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-faint">{t("Main components")}</p>
                <ul className="space-y-2">
                  {plan.architectureDraft.components.map((comp, idx) => (
                    <li key={idx} className="bg-subtle p-3 rounded-lg">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-ink">{comp.name}</span>
                        <span className="text-xs text-faint font-mono shrink-0">{comp.type}</span>
                      </div>
                      <div className="text-muted mt-0.5">{comp.purpose}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-faint mb-1.5">{t("Data flow")}</p>
                  <p className="text-muted leading-relaxed">{plan.architectureDraft.dataFlow}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-faint mb-1.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> {t("Security & authentication")}
                  </p>
                  <p className="text-muted leading-relaxed">{plan.architectureDraft.securityAndAuth}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Roadmap & Estimasi */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 card p-5 space-y-4">
              <h4 className={sectionTitle}>
                <Compass className="w-4 h-4 text-faint" />
                {t("Delivery roadmap")}
              </h4>
              <ol className="space-y-4">
                {plan.roadmap.map((phase, idx) => (
                  <li key={idx} className="flex gap-3">
                    <span className="w-5 h-5 shrink-0 rounded-md bg-subtle text-muted text-[11px] font-semibold grid place-items-center">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2.5">
                        <span className="font-medium text-ink">{phase.title}</span>
                        <span className="text-xs text-faint">{phase.duration}</span>
                      </div>
                      <ul className="mt-1 space-y-1 text-muted">
                        {phase.deliverables.map((deliv, dIdx) => (
                          <li key={dIdx} className="flex gap-2">
                            <span className="text-faint">&middot;</span>
                            {deliv}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="card p-5 space-y-4">
              <h4 className={sectionTitle}>
                <Clock className="w-4 h-4 text-faint" />
                {t("Estimate & resources")}
              </h4>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-subtle rounded-lg p-3">
                  <p className="text-xs font-medium text-faint">{t("Total estimate")}</p>
                  <p className="text-base font-semibold text-ink mt-0.5">{plan.estimation.totalTimeWeeks}</p>
                </div>
                <div className="bg-subtle rounded-lg p-3">
                  <p className="text-xs font-medium text-faint">{t("Complexity")}</p>
                  <p className="text-base font-semibold text-ink mt-0.5">{plan.estimation.complexityLevel}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-faint mb-1.5">{t("Resources needed")}</p>
                <ul className="space-y-1 text-muted">
                  {plan.estimation.requiredResources.map((res, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="text-faint">&middot;</span>
                      {res}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
      <GenerationDialog
        open={generatingPrd}
        title={t("Preparing the PRD")}
        label={t("Assembling the PRD & diagram...")}
        expectedMs={45000}
        onCancel={() => prdAbort.current?.abort()}
      />

    </div>
  );
};
