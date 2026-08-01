import React, { useState } from "react";
import { ProjectSession, FollowUpQuestion, ProjectPlan } from "../types";
import { MermaidViewer } from "./MermaidViewer";
import {
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
} from "lucide-react";

interface Step1PlanProps {
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onGoToNextStep: () => void;
}

export const Step1Plan: React.FC<Step1PlanProps> = ({ session, onUpdateSession, onGoToNextStep }) => {
  const [title, setTitle] = useState(session.input.title || "");
  const [description, setDescription] = useState(session.input.description || "");
  const [targetAudience, setTargetAudience] = useState(session.input.targetAudience || "");
  const [techStackPreference, setTechStackPreference] = useState(session.input.techStackPreference || "");

  const [answers, setAnswers] = useState<Record<string, string>>(session.input.answersToFollowUp || {});
  const [customAnswerActive, setCustomAnswerActive] = useState<Record<string, boolean>>({});

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sub-view in Step 1: 'form' (Form & Questions) or 'plan_review' (Architecture & Diagram Review Page)
  const [subView, setSubView] = useState<"form" | "plan_review">(session.plan ? "plan_review" : "form");

  // Klarifikasi bertahap: ronde pertama memulai dari nol, ronde lanjutan
  // mengirim jawaban yang sudah ada agar LLM bisa menilai apa yang masih kurang
  // dan menambah pertanyaan hanya jika benar-benar masih ragu.
  const requestFollowUps = async (isFirstRound: boolean) => {
    if (!description.trim()) {
      setErrorMessage("Silakan masukkan deskripsi proyek terlebih dahulu.");
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
          title: title || "Aplikasi AI",
          description,
          targetAudience,
          techStackPreference,
          previousAnswers: isFirstRound ? {} : answers,
          round: nextRound,
          llmConfig: session.llmConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat pertanyaan follow-up.");

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
    } catch (err: any) {
      setErrorMessage(err.message || "Terjadi kesalahan saat berkomunikasi dengan LLM.");
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
          title: title || "Aplikasi AI Baru",
          description,
          targetAudience,
          techStackPreference,
          answers,
          llmConfig: session.llmConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat Project Plan.");

      const plan: ProjectPlan = data;
      onUpdateSession({
        title: title || "Aplikasi AI Baru",
        input: {
          title,
          description,
          targetAudience,
          techStackPreference,
          answersToFollowUp: answers,
        },
        plan,
      });

      // Switch sub-view directly to Architecture & Diagram review page!
      setSubView("plan_review");
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal membuat Project Plan.");
    } finally {
      setLoadingPlan(false);
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
    <div className="space-y-8 pb-12">
      {/* Introduction Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-indigo-500/20 relative overflow-hidden">
        <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none"></div>
        <div className="relative z-10 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-xs font-semibold mb-4 border border-indigo-500/30">
            <Compass className="w-3.5 h-3.5" />
            Part 1: Bikin Plan & Spec Arsitektur
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white mb-3">
            Klarifikasi Ide, Arsitektur, & Diagram Logika
          </h2>
          <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
            Mulai dari ide kasar, AI akan memberikan pilihan klarifikasi cepat. Setelah disetujui, Anda akan diarahkan ke halaman tinjauan arsitektur & diagram logika horizontal sebelum masuk ke PRD.
          </p>

          {/* Sub-view switcher pill */}
          {plan && (
            <div className="mt-5 inline-flex items-center gap-1.5 p-1 bg-slate-800/80 rounded-2xl border border-slate-700">
              <button
                onClick={() => setSubView("form")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  subView === "form" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-300 hover:text-white"
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" /> Form & Klarifikasi Ide
              </button>
              <button
                onClick={() => setSubView("plan_review")}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  subView === "plan_review" ? "bg-indigo-600 text-white shadow-xs" : "text-slate-300 hover:text-white"
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Review Arsitektur & Diagram Logika
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs sm:text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">Terjadi Kendala:</strong>
            {errorMessage}
          </div>
        </div>
      )}

      {/* SUBVIEW 1: FORM & FOLLOW UP QUESTIONS */}
      {subView === "form" && (
        <div className="space-y-8">
          {/* Input Form */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-xs p-6 sm:p-8">
            <form onSubmit={handleAnalyzeQuestions} className="space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-extrabold">
                    1
                  </span>
                  Input Deskripsi Proyek
                </h3>
                <span className="text-xs text-slate-500 font-medium">LLM: {session.llmConfig.provider.toUpperCase()}</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Judul Proyek</label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="misal: AI Code Reviewer Bot, Smart LMS POS..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">Target Pengguna (Opsional)</label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="misal: Tech Lead, Mahasiswa, UMKM Kasir..."
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Deskripsi Detail Proyek <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan ide aplikasi Anda secara mendalam. Apa masalah yang diselesaikan? Fitur utama apa saja yang dibayangkan? Bagaimana ekspektasi cara kerjanya?"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Ekspektasi Tech Stack (Opsional)</label>
                <input
                  type="text"
                  value={techStackPreference}
                  onChange={(e) => setTechStackPreference(e.target.value)}
                  placeholder="misal: React, Node.js, PostgreSQL, Gemini API..."
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loadingQuestions || !description.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  {loadingQuestions ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menganalisis Proyek dengan AI...
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-4 h-4" />
                      Analisis Ide & Hasilkan Pertanyaan Follow-up
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Follow-up Questions with Options + 1 Custom Field */}
          {session.followUps.length > 0 && (
            <div className="bg-gradient-to-b from-slate-50 to-indigo-50/30 rounded-3xl border border-indigo-100 p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                    <HelpCircle className="w-5 h-5 text-indigo-600" />
                    Klarifikasi Pilihan AI & Jawaban Kustom
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Pilih salah satu opsi jawaban atau tulis jawaban manual di kolom kustom jika tidak ada di pilihan.
                  </p>
                </div>

                <button
                  onClick={handleFillAllSuggested}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl text-xs font-semibold transition-all shadow-2xs"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-500" />
                  Gunakan Rekomendasi Pertama AI
                </button>
              </div>

              {/* Penilaian kesiapan dari LLM pada ronde klarifikasi terakhir */}
              {session.readinessNote && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                    session.clarificationComplete
                      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
                      : "bg-amber-50 border-amber-200 text-amber-900"
                  }`}
                >
                  {session.clarificationComplete ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <HelpCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="leading-relaxed">
                    <strong className="font-semibold block mb-0.5">
                      {session.clarificationComplete
                        ? `Ronde ${session.clarificationRound}: AI menilai informasi sudah cukup.`
                        : `Ronde ${session.clarificationRound}: AI masih punya pertanyaan.`}
                    </strong>
                    {session.readinessNote}
                  </div>
                </div>
              )}

              <div className="space-y-5">
                {session.followUps.map((q, idx) => {
                  const currentAnswer = answers[q.question] || "";
                  const isCustom = customAnswerActive[q.question] || false;
                  const questionOptions = q.options && q.options.length > 0 ? q.options : [q.suggestedAnswer];

                  return (
                    <div key={q.id || idx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[10px] font-bold uppercase tracking-wider">
                              {q.category}
                            </span>
                            {q.round && q.round > 1 && (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold uppercase tracking-wider">
                                Ronde {q.round}
                              </span>
                            )}
                          </div>
                          <h4 className="font-semibold text-slate-900 text-xs sm:text-sm">{q.question}</h4>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 italic bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        💡 {q.explanation}
                      </p>

                      {/* Options Pills */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-bold text-slate-700 block">Pilih Opsi Jawaban:</label>
                        <div className="flex flex-wrap gap-2">
                          {questionOptions.map((opt, oIdx) => {
                            const isSelected = !isCustom && currentAnswer === opt;
                            return (
                              <button
                                key={oIdx}
                                type="button"
                                onClick={() => handleSelectOption(q.question, opt)}
                                className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-all flex items-center gap-2 ${
                                  isSelected
                                    ? "bg-indigo-600 text-white border-indigo-600 shadow-xs"
                                    : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                                }`}
                              >
                                {isSelected ? <Check className="w-3.5 h-3.5 shrink-0" /> : <div className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />}
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
                            className={`px-3 py-2 rounded-xl text-xs font-medium border text-left transition-all flex items-center gap-2 ${
                              isCustom
                                ? "bg-amber-600 text-white border-amber-600 shadow-xs"
                                : "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100"
                            }`}
                          >
                            <Edit3 className="w-3.5 h-3.5 shrink-0" />
                            <span>Jawaban Manual / Kustom</span>
                          </button>
                        </div>

                        {/* Custom Input Field if Active */}
                        {isCustom && (
                          <div className="pt-2 animate-in fade-in">
                            <input
                              type="text"
                              value={currentAnswer}
                              onChange={(e) => setAnswers({ ...answers, [q.question]: e.target.value })}
                              placeholder="Ketik jawaban kustom Anda disini..."
                              className="w-full px-3.5 py-2.5 bg-amber-50/30 border border-amber-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  onClick={() => requestFollowUps(false)}
                  disabled={loadingQuestions || loadingPlan}
                  className="flex items-center gap-2 px-5 py-3.5 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl text-xs sm:text-sm font-semibold transition-all disabled:opacity-50"
                  title="Kirim jawaban saat ini agar AI menilai apakah masih ada yang perlu ditanyakan"
                >
                  {loadingQuestions ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menilai jawaban Anda...
                    </>
                  ) : (
                    <>
                      <HelpCircle className="w-4 h-4" />
                      Lanjutkan Klarifikasi (Ronde {(session.clarificationRound || 1) + 1})
                    </>
                  )}
                </button>

                <button
                  onClick={handleGeneratePlan}
                  disabled={loadingPlan || loadingQuestions}
                  className="flex items-center gap-2 px-7 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  {loadingPlan ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menyusun Arsitektur & Diagram Logika...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Project Plan & Pindah ke Page Review Diagram
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SUBVIEW 2: DEDICATED PLAN REVIEW & HORIZONTAL LOGIC DIAGRAM PAGE */}
      {subView === "plan_review" && plan && (
        <div className="space-y-8 animate-in fade-in duration-300">
          {/* Plan Header & Action Banner */}
          <div className="bg-slate-900 text-white rounded-3xl p-6 sm:p-8 flex flex-wrap items-center justify-between gap-4 border border-slate-800 shadow-lg">
            <div>
              <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
                <CheckCircle2 className="w-4 h-4" /> Plan & Arsitektur Berhasil Disusun
              </div>
              <h3 className="text-xl sm:text-2xl font-extrabold text-white">{session.input.title || title}</h3>
              <p className="text-slate-300 text-xs mt-1 max-w-2xl">{plan.summary}</p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setSubView("form")}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Input / Re-generate
              </button>

              <button
                onClick={onGoToNextStep}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl font-bold text-xs sm:text-sm transition-all shadow-md"
              >
                Lanjut ke Step 2: Bikin PRD
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Dedicated Horizontal Logic Diagram Section */}
          {plan.architectureDraft.diagramMermaid && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  Diagram Logika & Arsitektur Sistem (Horizontal)
                </h4>
                <span className="text-xs text-slate-500 font-mono">graph LR (Horizontal Orientation)</span>
              </div>

              <MermaidViewer
                chart={plan.architectureDraft.diagramMermaid}
                explanation={plan.architectureDraft.dataFlow}
                title={`Arsitektur System: ${title || session.title}`}
              />
            </div>
          )}

          {/* Grid Core Features & Tech Stack */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Core Features */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                <ListTodo className="w-4 h-4 text-indigo-600" />
                Prioritas Fitur Utama
              </h4>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {plan.specs.coreFeatures.map((feat, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 text-xs">{feat.name}</span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                          feat.priority === "P0"
                            ? "bg-rose-100 text-rose-800"
                            : feat.priority === "P1"
                            ? "bg-amber-100 text-amber-800"
                            : "bg-slate-200 text-slate-700"
                        }`}
                      >
                        {feat.priority} {feat.priority === "P0" ? "(MVP)" : ""}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed">{feat.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tech Stack */}
            <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                <Cpu className="w-4 h-4 text-indigo-600" />
                Rekomendasi Stack Teknologi
              </h4>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {plan.specs.techStack.map((tech, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-800">
                        {tech.layer}
                      </span>
                      <span className="font-semibold text-slate-900 text-xs">{tech.technology}</span>
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed mt-1">{tech.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Draf Arsitektur Details */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
            <h4 className="font-bold text-slate-900 text-base flex items-center gap-2 border-b border-slate-100 pb-4">
              <Layers className="w-5 h-5 text-indigo-600" />
              Detail Komponen & Keamanan
            </h4>

            <div className="bg-slate-900 text-slate-100 p-5 rounded-2xl text-xs sm:text-sm leading-relaxed border border-slate-800">
              <strong className="text-indigo-400 font-semibold block mb-1">Gambaran Umum Arsitektur:</strong>
              {plan.architectureDraft.overview}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <strong className="text-slate-800 text-xs font-bold block">Komponen Utama:</strong>
                <ul className="space-y-2">
                  {plan.architectureDraft.components.map((comp, idx) => (
                    <li key={idx} className="text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/60">
                      <div className="font-semibold text-slate-900 flex items-center justify-between">
                        <span>{comp.name}</span>
                        <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">{comp.type}</span>
                      </div>
                      <div className="text-slate-500 mt-0.5">{comp.purpose}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <strong className="text-slate-800 text-xs font-bold block mb-1">Alur Data (Data Flow):</strong>
                  <p className="text-xs text-slate-600 leading-relaxed">{plan.architectureDraft.dataFlow}</p>
                </div>

                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
                  <strong className="text-slate-800 text-xs font-bold block mb-1 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" /> Keamanan & Otentikasi:
                  </strong>
                  <p className="text-xs text-slate-600 leading-relaxed">{plan.architectureDraft.securityAndAuth}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Roadmap & Estimasi */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs space-y-4">
              <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2 border-b border-slate-100 pb-3">
                <Compass className="w-4 h-4 text-indigo-600" />
                Roadmap Tahapan Pengerjaan
              </h4>
              <div className="space-y-3">
                {plan.roadmap.map((phase, idx) => (
                  <div key={idx} className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-bold flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold text-slate-900 text-xs">{phase.title}</span>
                      </div>
                      <span className="text-xs font-semibold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
                        ⏱️ {phase.duration}
                      </span>
                    </div>
                    <ul className="list-disc list-inside text-xs text-slate-600 space-y-1 pl-2">
                      {phase.deliverables.map((deliv, dIdx) => (
                        <li key={dIdx}>{deliv}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900 text-white rounded-3xl p-6 border border-slate-800 shadow-md space-y-5">
              <h4 className="font-bold text-white text-sm flex items-center gap-2 border-b border-slate-800 pb-3">
                <Clock className="w-4 h-4 text-emerald-400" />
                Estimasi & Sumber Daya
              </h4>

              <div className="grid grid-cols-2 gap-3 text-center">
                <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Total Estimasi</span>
                  <span className="text-base font-extrabold text-emerald-400">{plan.estimation.totalTimeWeeks}</span>
                </div>
                <div className="p-3 bg-slate-800/80 rounded-2xl border border-slate-700">
                  <span className="text-[10px] text-slate-400 block uppercase font-semibold">Kompleksitas</span>
                  <span className="text-base font-extrabold text-amber-400">{plan.estimation.complexityLevel}</span>
                </div>
              </div>

              <div>
                <strong className="text-xs font-semibold text-slate-300 block mb-2">Sumber Daya Dibutuhkan:</strong>
                <ul className="space-y-1 text-xs text-slate-300">
                  {plan.estimation.requiredResources.map((res, idx) => (
                    <li key={idx} className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                      {res}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
