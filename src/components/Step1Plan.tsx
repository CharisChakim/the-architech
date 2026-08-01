import React, { useState, useEffect } from "react";
import { ProjectSession, FollowUpQuestion, ProjectPlan } from "../types";
import { MermaidViewer } from "./MermaidViewer";
import { PlanCanvas } from "./PlanCanvas";
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
} from "lucide-react";

interface Step1PlanProps {
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onGoToNextStep: () => void;
}

// Sampai AI mengusulkan judul, riwayat perlu sesuatu untuk ditampilkan. Potongan
// awal ide dipakai sebagai nama sementara.
const provisionalTitle = (idea: string): string => {
  const firstLine = idea.trim().split("\n")[0].trim();
  if (firstLine.length <= 60) return firstLine;
  return firstLine.slice(0, 57).trimEnd() + "...";
};

export const Step1Plan: React.FC<Step1PlanProps> = ({ session, onUpdateSession, onGoToNextStep }) => {
  const [description, setDescription] = useState(session.input.description || "");

  const [answers, setAnswers] = useState<Record<string, string>>(session.input.answersToFollowUp || {});
  const [customAnswerActive, setCustomAnswerActive] = useState<Record<string, boolean>>({});

  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sub-view in Step 1: 'form' (Form & Questions) or 'plan_review' (Architecture & Diagram Review Page)
  const [subView, setSubView] = useState<"form" | "plan_review">(session.plan ? "plan_review" : "form");

  // Sesi bisa berganti dari luar (buka riwayat, proyek baru, contoh template)
  // sementara komponen ini tetap ter-mount, sehingga state form harus mengikuti.
  // Dikunci ke session.id supaya tidak menimpa apa yang sedang diketik pengguna.
  useEffect(() => {
    setDescription(session.input.description || "");
    setAnswers(session.input.answersToFollowUp || {});
    setCustomAnswerActive({});
    setErrorMessage(null);
    setSubView(session.plan ? "plan_review" : "form");
  }, [session.id]);

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
          title: session.input.title || provisionalTitle(description),
          description,
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
          ...session.input,
          title: session.input.title || provisionalTitle(description),
          description,
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
          title: session.input.title || provisionalTitle(description),
          description,
          answers,
          llmConfig: session.llmConfig,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat Project Plan.");

      const plan: ProjectPlan = data;
      // Judul diambil dari usulan AI; nama sementara dari potongan ide hanya
      // dipakai kalau AI tidak mengirim apa pun.
      const resolvedTitle = (data.suggestedTitle || "").trim() || provisionalTitle(description);
      onUpdateSession({
        title: resolvedTitle,
        input: {
          ...session.input,
          title: resolvedTitle,
          description,
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
      {/* Page heading */}
      <div className="space-y-4">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Klarifikasi ide, arsitektur, dan diagram logika
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
            Mulai dari ide kasar. AI mengajukan klarifikasi bertahap sampai cukup yakin, lalu menyusun arsitektur dan
            diagram untuk Anda tinjau sebelum masuk ke PRD.
          </p>
        </div>

        {/* Sub-view switcher */}
        {plan && (
          <div className="inline-flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-700/50 rounded-lg">
            <button
              onClick={() => setSubView("form")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                subView === "form" ? "bg-white dark:bg-[#2f3546] text-slate-900 dark:text-slate-100 shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" /> Form & klarifikasi
            </button>
            <button
              onClick={() => setSubView("plan_review")}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors flex items-center gap-1.5 ${
                subView === "plan_review" ? "bg-white dark:bg-[#2f3546] text-slate-900 dark:text-slate-100 shadow-xs" : "text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100"
              }`}
            >
              <Eye className="w-3.5 h-3.5" /> Review arsitektur
            </button>
          </div>
        )}
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-800 dark:text-rose-300 rounded-2xl text-sm flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
          <div className="flex-1">
            <strong className="font-semibold block mb-0.5">Terjadi Kendala:</strong>
            {errorMessage}
          </div>
        </div>
      )}

      {/* SUBVIEW 1: FORM & FOLLOW UP QUESTIONS */}
      {subView === "form" && (
        <div className="space-y-8">
          {/* Satu kolom ide. Judul, target pengguna, dan stack tidak lagi ditanya
              di sini — AI menyimpulkannya, atau menanyakannya saat klarifikasi. */}
          <form
            onSubmit={handleAnalyzeQuestions}
            className="bg-white dark:bg-[#2f3546] rounded-2xl ring-1 ring-slate-200 dark:ring-[#3f4557] p-2"
          >
            <textarea
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={'Contoh: "Aplikasi tracking pengeluaran harian, bisa input lewat WhatsApp, ada dashboard ringkasan bulanan..."'}
              className="w-full px-4 py-3 bg-transparent text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-hidden resize-none leading-relaxed"
            />

            <div className="flex items-center justify-between gap-3 px-2 pb-1">
              <span className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {session.llmConfig.provider} · {session.llmConfig.modelName || "model bawaan"}
              </span>

              <button
                type="submit"
                disabled={loadingQuestions || !description.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 shrink-0"
              >
                {loadingQuestions ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Menganalisis...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Analisis ide
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Follow-up Questions with Options + 1 Custom Field */}
          {session.followUps.length > 0 && (
            <div className="bg-slate-50 dark:bg-slate-700/40 rounded-2xl border border-slate-200 dark:border-[#3f4557] p-6 sm:p-8 space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-indigo-100 dark:border-indigo-500/30 pb-4">
                <div>
                  <h3 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                    Klarifikasi dari AI
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Pilih salah satu opsi jawaban atau tulis jawaban manual di kolom kustom jika tidak ada di pilihan.
                  </p>
                </div>

                <button
                  onClick={handleFillAllSuggested}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-[#2f3546] border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 rounded-xl text-xs font-semibold transition-all shadow-2xs"
                >
                  <Zap className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" />
                  Pakai rekomendasi AI
                </button>
              </div>

              {/* Penilaian kesiapan dari LLM pada ronde klarifikasi terakhir */}
              {session.readinessNote && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs flex items-start gap-2.5 ${
                    session.clarificationComplete
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-200"
                      : "bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/30 text-amber-900 dark:text-amber-200"
                  }`}
                >
                  {session.clarificationComplete ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <HelpCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
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
                    <div key={q.id || idx} className="bg-white dark:bg-[#2f3546] rounded-2xl p-5 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-block px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300 text-xs font-semibold uppercase tracking-wider">
                              {q.category}
                            </span>
                            {q.round && q.round > 1 && (
                              <span className="inline-block px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold uppercase tracking-wider">
                                Ronde {q.round}
                              </span>
                            )}
                          </div>
                          <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{q.question}</h4>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-700/40 p-2.5 rounded-xl border border-slate-100 dark:border-[#3f4557]">
                        {q.explanation}
                      </p>

                      {/* Options Pills */}
                      <div className="space-y-2">
                        <label className="text-xs font-semibold text-slate-700 dark:text-slate-200 block">Pilih jawaban</label>
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
                                    : "bg-slate-50 dark:bg-slate-700/40 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-[#3f4557] hover:bg-slate-100 dark:hover:bg-slate-700/50"
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
                                ? "bg-slate-800 text-white border-slate-800"
                                : "bg-white dark:bg-[#2f3546] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-[#3f4557] hover:bg-slate-50 dark:hover:bg-slate-700/40"
                            }`}
                          >
                            <Edit3 className="w-3.5 h-3.5 shrink-0" />
                            <span>Jawaban sendiri</span>
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
                              className="w-full px-3.5 py-2.5 bg-white dark:bg-[#2f3546] border border-slate-300 dark:border-[#4a5169] rounded-xl text-xs text-slate-900 dark:text-slate-100 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
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
                  className="flex items-center gap-2 px-5 py-3.5 bg-white dark:bg-[#2f3546] border border-indigo-200 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
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
                      Lanjutkan klarifikasi (ronde {(session.clarificationRound || 1) + 1})
                    </>
                  )}
                </button>

                <button
                  onClick={handleGeneratePlan}
                  disabled={loadingPlan || loadingQuestions}
                  className="flex items-center gap-2 px-7 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                >
                  {loadingPlan ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Menyusun Arsitektur & Diagram Logika...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate project plan
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
          {/* Plan summary & primary actions */}
          <div className="bg-white dark:bg-[#2f3546] rounded-2xl ring-1 ring-slate-200 dark:ring-[#3f4557] p-6 flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-2">
                <CheckCircle2 className="w-4 h-4" /> Plan &amp; arsitektur tersusun
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{session.input.title || session.title}</h3>
              <p className="text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl leading-relaxed">{plan.summary}</p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setSubView("form")}
                className="px-3.5 py-2 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit input
              </button>

              <button
                onClick={onGoToNextStep}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium text-sm transition-colors"
              >
                Lanjut ke PRD
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Kanvas struktur: Perencanaan -> Fitur -> Sub Fitur */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Network className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                Struktur fitur
              </h4>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {plan.specs.coreFeatures.length} fitur ·{" "}
                {plan.specs.coreFeatures.reduce((n, f) => n + (f.subFeatures?.length || 0), 0)} sub fitur
              </span>
            </div>

            <PlanCanvas title={session.input.title || session.title || "Perencanaan"} features={plan.specs.coreFeatures} />
          </div>

          {/* Dedicated Horizontal Logic Diagram Section */}
          {plan.architectureDraft.diagramMermaid && (
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Layers className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                Diagram logika &amp; arsitektur sistem
              </h4>

              <MermaidViewer
                chart={plan.architectureDraft.diagramMermaid}
                explanation={plan.architectureDraft.dataFlow}
                title={`Arsitektur sistem: ${session.input.title || session.title}`}
              />
            </div>
          )}

          {/* Grid Core Features & Tech Stack */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Core Features */}
            <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-4">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                <ListTodo className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                Prioritas fitur utama
              </h4>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {plan.specs.coreFeatures.map((feat, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-700/40 rounded-2xl border border-slate-200/80 dark:border-[#3f4557] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">{feat.name}</span>
                      <span
                        className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                          feat.priority === "P0"
                            ? "bg-rose-100 dark:bg-rose-500/20 text-rose-800 dark:text-rose-300"
                            : feat.priority === "P1"
                            ? "bg-amber-100 dark:bg-amber-500/20 text-amber-800 dark:text-amber-300"
                            : "bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200"
                        }`}
                      >
                        {feat.priority} {feat.priority === "P0" ? "(MVP)" : ""}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{feat.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tech Stack */}
            <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-4">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2 border-b border-slate-100 dark:border-[#3f4557] pb-3">
                <Cpu className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                Rekomendasi stack teknologi
              </h4>
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {plan.specs.techStack.map((tech, idx) => (
                  <div key={idx} className="p-3.5 bg-slate-50 dark:bg-slate-700/40 rounded-2xl border border-slate-200/80 dark:border-[#3f4557] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-500/20 text-indigo-800 dark:text-indigo-300">
                        {tech.layer}
                      </span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100 text-xs">{tech.technology}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mt-1">{tech.rationale}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Draf Arsitektur Details */}
          <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 sm:p-8 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-6">
            <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              Detail komponen &amp; keamanan
            </h4>

            <div>
              <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Gambaran umum arsitektur</p>
              <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{plan.architectureDraft.overview}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Komponen utama</p>
                <ul className="space-y-2">
                  {plan.architectureDraft.components.map((comp, idx) => (
                    <li key={idx} className="bg-slate-50 dark:bg-slate-700/40 p-3 rounded-lg">
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{comp.name}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-mono shrink-0">{comp.type}</span>
                      </div>
                      <div className="text-slate-500 dark:text-slate-400 mt-0.5">{comp.purpose}</div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Alur data</p>
                  <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{plan.architectureDraft.dataFlow}</p>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500" /> Keamanan &amp; otentikasi
                  </p>
                  <p className="text-slate-700 dark:text-slate-200 leading-relaxed">{plan.architectureDraft.securityAndAuth}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Roadmap & Estimasi */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white dark:bg-[#2f3546] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-5">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Compass className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                Roadmap tahapan pengerjaan
              </h4>
              <ol className="space-y-5">
                {plan.roadmap.map((phase, idx) => (
                  <li key={idx} className="flex gap-4">
                    <span className="w-6 h-6 shrink-0 rounded-full bg-slate-100 dark:bg-slate-700/50 text-slate-600 dark:text-slate-300 text-xs font-semibold grid place-items-center">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-x-2.5">
                        <span className="font-medium text-slate-900 dark:text-slate-100">{phase.title}</span>
                        <span className="text-xs text-slate-500 dark:text-slate-400">{phase.duration}</span>
                      </div>
                      <ul className="mt-1.5 space-y-1 text-slate-600 dark:text-slate-300">
                        {phase.deliverables.map((deliv, dIdx) => (
                          <li key={dIdx} className="flex gap-2">
                            <span className="text-slate-300 dark:text-slate-600">&middot;</span>
                            {deliv}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="bg-white dark:bg-[#2f3546] rounded-2xl p-6 ring-1 ring-slate-200 dark:ring-[#3f4557] space-y-5">
              <h4 className="font-semibold text-slate-900 dark:text-slate-100 text-base flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                Estimasi &amp; sumber daya
              </h4>

              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total estimasi</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{plan.estimation.totalTimeWeeks}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Kompleksitas</p>
                  <p className="text-lg font-semibold text-slate-900 dark:text-slate-100 mt-0.5">{plan.estimation.complexityLevel}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Sumber daya dibutuhkan</p>
                <ul className="space-y-1 text-slate-700 dark:text-slate-200">
                  {plan.estimation.requiredResources.map((res, idx) => (
                    <li key={idx} className="flex gap-2">
                      <span className="text-slate-300 dark:text-slate-600">&middot;</span>
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
