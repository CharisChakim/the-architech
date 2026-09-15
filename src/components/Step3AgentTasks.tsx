import React, { useEffect, useRef, useState } from "react";
import type { ProjectSession, AgentTask } from "../types";
import { generateTasks, isAbort } from "../lib/generate";
import { agentsMarkdownFilename, buildAgentsMarkdown } from "../lib/agentsMd";
import { downloadFile } from "../lib/download";
import { buildHandoffJson, handoffJsonFilename } from "../lib/handoff";
import { fetchTaskRunReview, type TaskRunReview } from "../lib/runs";
import { GenerationProgress } from "./GenerationProgress";
import {
  Bot,
  Sparkles,
  Download,
  Copy,
  Check,
  RefreshCw,
  Code2,
  CheckCircle2,
  ListOrdered,
  ChevronDown,
  ChevronUp,
  Kanban,
  ArrowRight,
  ArrowLeft,
  X,
  AlertTriangle,
} from "lucide-react";
import { useT } from "../lib/i18n";
import {
  attachPrdVersionToPrd,
  attachPrdVersionToTasks,
  currentPrdVersion,
  mergeGeneratedTasks,
  recordPrdVersion,
  taskNeedsPrdSync,
} from "../lib/artifactVersions";

interface Step3AgentTasksProps {
  session: ProjectSession;
  onUpdateSession: (updated: Partial<ProjectSession>) => void;
  onRunTask?: (task: AgentTask) => void;
  runningTaskId?: string | null;
}

type TaskStatus = "todo" | "in_progress" | "done";

function runDate(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : value;
}

export const Step3AgentTasks: React.FC<Step3AgentTasksProps> = ({ session, onUpdateSession, onRunTask, runningTaskId }) => {
  const { t, lang } = useT();
  const [loading, setLoading] = useState(false);
  const [generationChars, setGenerationChars] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copiedTaskId, setCopiedTaskId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [selectedTask, setSelectedTask] = useState<AgentTask | null>(null);
  const [reviewRefresh, setReviewRefresh] = useState(0);
  const [runReview, setRunReview] = useState<{
    taskId: string | null;
    loading: boolean;
    data: TaskRunReview | null;
    error: string | null;
  }>({ taskId: null, loading: false, data: null, error: null });

  // Kartu dipindah dengan drag-and-drop HTML5 asli — tidak perlu pustaka untuk
  // tiga kolom. Tombol kecil di kaki kartu tetap ada: drag HTML5 tidak bekerja
  // di layar sentuh, dan tombol juga terjangkau lewat keyboard.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<TaskStatus | null>(null);
  const tasksAbort = useRef<AbortController | null>(null);
  const reviewAbort = useRef<AbortController | null>(null);

  const tasks = session.tasks || [];
  const currentVersion = currentPrdVersion(session.prdVersions);
  const tasksNeedingSync = tasks.filter((task) => taskNeedsPrdSync(task, currentVersion)).length;

  useEffect(() => {
    if (!selectedTask) return;
    const current = tasks.find((task) => task.id === selectedTask.id);
    if (current) setSelectedTask(current);
    else setSelectedTask(null);
  }, [session.tasks]);

  useEffect(() => {
    reviewAbort.current?.abort();
    if (!selectedTask) {
      setRunReview({ taskId: null, loading: false, data: null, error: null });
      return;
    }

    const controller = new AbortController();
    reviewAbort.current = controller;
    const taskId = selectedTask.id;
    setRunReview({ taskId, loading: true, data: null, error: null });

    fetchTaskRunReview(taskId, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setRunReview({ taskId, loading: false, data, error: null });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setRunReview({
            taskId,
            loading: false,
            data: null,
            error: error instanceof Error ? error.message : t("Could not load run history for this task."),
          });
        }
      });

    return () => controller.abort();
  }, [selectedTask?.id, reviewRefresh, t]);

  const handleGenerateTasks = async () => {
    setLoading(true);
    setErrorMessage(null);
    setGenerationChars(0);
    const controller = new AbortController();
    tasksAbort.current = controller;

    try {
      const recorded = session.prd ? recordPrdVersion(session.prd, session.prdVersions) : null;
      const versionedPrd = recorded && session.prd
        ? attachPrdVersionToPrd(session.prd, recorded.version)
        : session.prd;
      const taskSession = recorded && versionedPrd
        ? { ...session, prd: versionedPrd, prdVersions: recorded.versions }
        : session;
      const generated = await generateTasks(taskSession, lang, controller.signal, setGenerationChars);
      const generatedTasks = attachPrdVersionToTasks(generated, recorded?.version);
      onUpdateSession({
        ...(recorded && versionedPrd ? { prd: versionedPrd, prdVersions: recorded.versions } : {}),
        tasks: mergeGeneratedTasks(tasks, generatedTasks),
      });

      // Expand all by default
      const initialExpanded: Record<string, boolean> = {};
      generatedTasks.forEach((task) => (initialExpanded[task.id] = true));
      setExpandedTasks(initialExpanded);

      // Trigger celebratory confetti. Dimuat saat dipakai supaya paketnya
      // tidak ikut bundel awal hanya untuk satu perayaan.
      const { default: confetti } = await import("canvas-confetti");
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
      });
    } catch (err: any) {
      if (!isAbort(err)) {
        setErrorMessage(err.message || t("Something went wrong while generating the agent tasks."));
      }
    } finally {
      tasksAbort.current = null;
      setLoading(false);
    }
  };

  const handleTaskStatusChange = (taskId: string, newStatus: TaskStatus) => {
    const updated = tasks.map((t) => (t.id === taskId ? { ...t, status: newStatus } : t));
    onUpdateSession({ tasks: updated });
    if (selectedTask && selectedTask.id === taskId) {
      setSelectedTask({ ...selectedTask, status: newStatus });
    }
  };

  const runTask = (task: AgentTask, event?: React.MouseEvent): void => {
    event?.stopPropagation();
    if (task.status !== "in_progress") handleTaskStatusChange(task.id, "in_progress");
    onRunTask?.(task);
  };

  const toggleExpand = (id: string) => {
    setExpandedTasks((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyTaskPrompt = (task: AgentTask) => {
    // Isi bundel selalu Inggris: pembacanya adalah AI coding agent, bukan
    // pengguna, dan prompt agent lain di sekitarnya pun berbahasa Inggris.
    const text = `AI AGENT PROMPT [${task.id}] - ${task.title}\n` +
      `Target files: ${(task.targetFiles || []).join(", ")}\n` +
      `\nInstructions:\n${task.promptInstructions}\n` +
      `\nVerification steps:\n${task.verificationSteps}`;

    navigator.clipboard.writeText(text);
    setCopiedTaskId(task.id);
    setTimeout(() => setCopiedTaskId(null), 2000);
  };

  const handleDownloadMdFile = () => {
    downloadFile(
      agentsMarkdownFilename(session),
      buildAgentsMarkdown(session),
      "text/markdown",
    );
  };

  const handleDownloadTaskHandoff = (task: AgentTask) => {
    const handedOffTask: AgentTask = {
      ...task,
      handoffStatus: "handed_off",
      handedOffAt: new Date().toISOString(),
    };
    onUpdateSession({ tasks: tasks.map((item) => item.id === task.id ? handedOffTask : item) });
    downloadFile(handoffJsonFilename(session, handedOffTask), buildHandoffJson(session, handedOffTask), "application/json");
  };

  const handleCopyAllMd = () => {
    const content = buildAgentsMarkdown(session);
    navigator.clipboard.writeText(content);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 2000);
  };

  // Ketiga kolom board dirender dari satu kerangka yang sama; hanya isi,
  // warna penanda, dan aksi di kaki kartunya yang berbeda per status.
  const columns = [
    {
      status: "todo" as const,
      label: t("To do"),
      dot: "bg-faint",
      tasks: tasks.filter((t) => !t.status || t.status === "todo"),
      emptyHint: t("Every task has been dealt with."),
    },
    {
      status: "in_progress" as const,
      label: t("In progress"),
      dot: "bg-warn animate-pulse",
      tasks: tasks.filter((t) => t.status === "in_progress"),
      emptyHint: t('Hit "Start" on a To do task to move it here.'),
    },
    {
      status: "done" as const,
      label: t("Done"),
      dot: "bg-ok",
      tasks: tasks.filter((t) => t.status === "done"),
      emptyHint: t("Tasks the AI agent has verified show up here."),
    },
  ];

  const selectedTaskHandoffJson = selectedTask ? buildHandoffJson(session, selectedTask) : null;

  return (
    <div className="relative space-y-6 pb-12">
      {/* Page heading */}
      <div className="max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-ink">{t("Tasks for the AI agent")}</h2>
        <p className="text-muted mt-1.5 leading-relaxed">
          {t(
            "The PRD is broken into atomic tasks with target files, dependencies, a prompt and verification steps. Copy a single task, or download AGENTS.md to hand to Cursor, Claude Code or Gemini."
          )}
        </p>
      </div>

      {/* Error Alert */}
      {errorMessage && (
        <div className="max-w-3xl p-4 bg-danger-soft border border-danger/30 text-danger-ink rounded-xl">
          <strong className="font-semibold">{t("Error")}:</strong> {errorMessage}
        </div>
      )}

      <GenerationProgress
        active={loading}
        label={t("Building the task board...")}
        chars={generationChars}
        onCancel={() => tasksAbort.current?.abort()}
      />

      {/* Generate Card if no tasks yet */}
      {tasks.length === 0 ? (
        <div className="card max-w-3xl p-10 text-center space-y-4">
          <div className="w-12 h-12 bg-ok-soft text-ok rounded-xl mx-auto flex items-center justify-center">
            <Bot className="w-6 h-6" />
          </div>
          <div className="max-w-md mx-auto space-y-1.5">
            <h3 className="font-semibold text-ink text-base">{t("Build the Kanban task board for the AI agent")}</h3>
            <p className="text-muted leading-relaxed">
              {t("The LLM breaks the PRD and architecture into a sequence of modular, ready-to-run tasks with To do, In progress and Done states.")}
            </p>
          </div>
          <button onClick={handleGenerateTasks} disabled={loading} className="btn-primary mx-auto">
            {loading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                {t("Building the task board...")}
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {t("Generate task board")}
              </>
            )}
          </button>
        </div>
      ) : (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Header Action Bar */}
          <div className="card p-5 flex flex-wrap items-start justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-ok text-xs font-medium mb-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("{count} tasks ready to run", { count: tasks.length })}
                {currentVersion && <span className="text-faint">· PRD v{currentVersion.number}</span>}
              </div>
              <h3 className="text-base font-semibold text-ink">{t("Task board")}</h3>
              <p className="text-muted mt-1 max-w-xl leading-relaxed">
                {t("Move tasks between states on the board below, or download AGENTS.md for your AI agent to run.")}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button onClick={handleCopyAllMd} className="btn-ghost">
                {copiedAll ? <Check className="w-4 h-4 text-ok" /> : <Copy className="w-4 h-4" />}
                {copiedAll ? t("Copied") : t("Copy all")}
              </button>

              <button onClick={handleDownloadMdFile} className="btn-primary">
                <Download className="w-4 h-4" />
                {t("Download AGENTS.md")}
              </button>
            </div>
          </div>

          {tasksNeedingSync > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4 text-warn-ink">
              <div className="flex items-start gap-2 text-sm">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <strong className="font-semibold">{tasksNeedingSync} task{tasksNeedingSync === 1 ? "" : "s"} need sync.</strong>{" "}
                  The PRD changed. Sync generated tasks when you are ready; manual tasks remain available.
                </span>
              </div>
              <button type="button" onClick={handleGenerateTasks} disabled={loading} className="btn-primary shrink-0 text-xs">
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
                {loading ? t("Building the task board...") : t("Sync tasks")}
              </button>
            </div>
          )}

          {/* View Switcher Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex items-center gap-1 bg-subtle p-1 rounded-lg">
              {(
                [
                  { id: "kanban", label: t("Kanban board"), icon: Kanban },
                  { id: "list", label: t("Detailed list"), icon: ListOrdered },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    viewMode === id ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            <button onClick={handleGenerateTasks} disabled={loading} className="btn-outline text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              {tasksNeedingSync > 0 ? t("Sync tasks") : t("Regenerate tasks")}
            </button>
          </div>

          {/* VIEW 1: KANBAN BOARD */}
          {viewMode === "kanban" && (
            <div className="grid grid-cols-1 @4xl/pane:grid-cols-3 gap-4 items-start">
              {columns.map((column) => (
                <div
                  key={column.status}
                  onDragOver={(e) => {
                    // Tanpa preventDefault, browser menolak jatuhan apa pun.
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    if (dropTarget !== column.status) setDropTarget(column.status);
                  }}
                  onDragLeave={(e) => {
                    // Pindah antar anak kolom ikut memicu dragleave; hanya yang
                    // benar-benar keluar dari kolom yang dihitung.
                    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                      setDropTarget((current) => (current === column.status ? null : current));
                    }
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData("text/plain") || draggingId;
                    const task = tasks.find((item) => item.id === id);
                    if (task && (task.status || "todo") !== column.status) {
                      handleTaskStatusChange(id, column.status);
                    }
                    setDropTarget(null);
                    setDraggingId(null);
                  }}
                  className={`bg-subtle rounded-xl p-3 space-y-2.5 min-h-32 transition-colors ${
                    dropTarget === column.status ? "ring-2 ring-accent ring-inset" : ""
                  }`}
                >
                  <div className="flex items-center gap-2 px-1.5 pb-2 border-b border-line text-xs font-semibold uppercase tracking-wider text-muted">
                    <span className={`w-2 h-2 rounded-full ${column.dot}`} />
                    {column.label}
                    <span className="text-faint">{column.tasks.length}</span>
                  </div>

                  <div className="space-y-2.5">
                    {column.tasks.map((task) => (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", task.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDraggingId(task.id);
                        }}
                        onDragEnd={() => {
                          setDraggingId(null);
                          setDropTarget(null);
                        }}
                        onClick={() => setSelectedTask(task)}
                        className={`card p-3.5 cursor-grab active:cursor-grabbing transition-colors hover:border-accent space-y-2 ${
                          draggingId === task.id ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono font-semibold px-1.5 py-0.5 rounded bg-subtle text-muted">
                            {task.id}
                          </span>
                          <div className="flex items-center gap-1">
                            <span className="max-w-28 truncate text-[10px] font-medium rounded bg-subtle px-1.5 py-0.5 text-muted">
                              {task.phase || t("Main phase")}
                            </span>
                            <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded ${task.priority === "High" ? "bg-danger-soft text-danger-ink" : "bg-warn-soft text-warn-ink"}`}>
                              {task.priority}
                            </span>
                            {taskNeedsPrdSync(task, currentVersion) && (
                              <span className="text-[10px] font-semibold rounded bg-warn-soft px-1.5 py-0.5 text-warn-ink">
                                {t("Needs sync")}
                              </span>
                            )}
                            {task.handoffStatus === "handed_off" && (
                              <span className="text-[10px] font-semibold rounded bg-accent-soft px-1.5 py-0.5 text-accent-ink">
                                {t("Handed off")}
                              </span>
                            )}
                          </div>
                        </div>

                        <h5
                          className={`font-medium text-xs leading-snug ${
                            column.status === "done" ? "text-muted line-through" : "text-ink"
                          }`}
                        >
                          {task.title}
                        </h5>

                        <div className="pt-2 border-t border-line flex flex-wrap items-center justify-between gap-2 text-xs">
                          <span className="flex min-w-0 items-center gap-1.5 text-faint">
                            <span>{t("{count} target files", { count: task.targetFiles?.length || 0 })}</span>
                            {runningTaskId === task.id && <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent" title={t("Agent is working on this task")} />}
                          </span>
                          {column.status === "todo" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskStatusChange(task.id, "in_progress");
                                }}
                                className="font-medium text-accent hover:brightness-110 flex items-center gap-1 shrink-0"
                              >
                                {t("Start")} <ArrowRight className="w-3 h-3" />
                              </button>
                            </>
                          )}

                          {column.status === "in_progress" && (
                            <>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskStatusChange(task.id, "todo");
                                }}
                                className="text-muted hover:text-ink flex items-center gap-1"
                              >
                                <ArrowLeft className="w-3 h-3" />
                                {t("Back")}
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskStatusChange(task.id, "done");
                                }}
                                className="font-medium text-ok hover:brightness-110 flex items-center gap-1"
                              >
                                {t("Accept as done")} <Check className="w-3 h-3" />
                              </button>
                            </>
                          )}

                          {column.status === "done" && (
                            <>
                              <span className="text-ok flex items-center gap-1">
                                <Check className="w-3 h-3" /> {t("Accepted")}
                              </span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleTaskStatusChange(task.id, "in_progress");
                                }}
                                className="text-muted hover:text-ink flex items-center gap-1"
                              >
                                <ArrowLeft className="w-3 h-3" />
                                {t("Reopen")}
                              </button>
                            </>
                          )}
                          {onRunTask && column.status !== "done" && (
                            <button
                              type="button"
                              onClick={(event) => runTask(task, event)}
                              disabled={Boolean(runningTaskId) || task.status === "done"}
                              className="btn-primary !px-2 !py-1 text-[11px] disabled:opacity-50"
                            >
                              {t("Run")}
                            </button>
                          )}
                        </div>
                      </div>
                    ))}

                    {column.tasks.length === 0 && (
                      <p className="p-5 text-center text-xs text-faint rounded-lg border border-dashed border-line">
                        {column.emptyHint}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* VIEW 2: DETAILED LIST VIEW */}
          {viewMode === "list" && (
            <div className="max-w-none space-y-3">
              {tasks.map((task, idx) => {
                const isExpanded = expandedTasks[task.id] ?? true;
                const isCopied = copiedTaskId === task.id;

                return (
                  <div key={task.id || idx} className="card overflow-hidden">
                    <div
                      onClick={() => toggleExpand(task.id)}
                      className="px-4 py-3 bg-subtle border-b border-line flex flex-wrap items-center justify-between gap-3 cursor-pointer select-none"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-surface text-muted font-mono font-medium text-[11px] shrink-0">
                          {task.id}
                        </span>

                        <div className="min-w-0">
                          <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-faint">
                            <span>{task.phase || t("Main phase")}</span>
                            <span>&middot;</span>
                            <span className={task.priority === "High" ? "text-danger font-medium" : ""}>
                              {t("Priority {level}", { level: task.priority })}
                            </span>
                            {taskNeedsPrdSync(task, currentVersion) && (
                              <span className="font-semibold text-warn-ink">· {t("Needs sync")}</span>
                            )}
                            {task.handoffStatus === "handed_off" && (
                              <span className="font-semibold text-accent-ink">· {t("Handed off")}</span>
                            )}
                          </div>
                          <h5 className="font-medium text-ink mt-0.5 truncate">{task.title}</h5>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {onRunTask && task.status !== "done" && (
                          <button
                            type="button"
                            onClick={(event) => runTask(task, event)}
                            disabled={Boolean(runningTaskId)}
                            className="btn-primary !px-2 !py-1 text-[11px] disabled:opacity-50"
                          >
                            {t("Run")}
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleCopyTaskPrompt(task);
                          }}
                          className="btn-outline text-xs !py-1.5"
                        >
                          {isCopied ? <Check className="w-3.5 h-3.5 text-ok" /> : <Copy className="w-3.5 h-3.5" />}
                          {isCopied ? t("Copied") : t("Copy prompt")}
                        </button>

                        <span className="p-1.5 text-faint">
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-5 space-y-4">
                        <div className="grid grid-cols-1 @xl/pane:grid-cols-2 gap-4">
                          <div>
                            <span className="text-[11px] font-semibold text-faint uppercase tracking-wider block mb-1.5">
                              {t("Target files")}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {task.targetFiles?.map((f, fIdx) => (
                                <span
                                  key={fIdx}
                                  className="font-mono text-xs bg-subtle text-muted px-1.5 py-0.5 rounded"
                                >
                                  {f}
                                </span>
                              ))}
                            </div>
                          </div>

                          <div>
                            <span className="text-[11px] font-semibold text-faint uppercase tracking-wider block mb-1.5">
                              {t("Dependencies")}
                            </span>
                            <div className="text-muted">
                              {task.dependencies && task.dependencies.length > 0 ? (
                                task.dependencies.join(", ")
                              ) : (
                                <span className="text-faint">{t("No dependencies")}</span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div>
                          <span className="text-xs font-medium text-muted flex items-center gap-1.5 mb-1.5">
                            <Code2 className="w-3.5 h-3.5 text-accent" /> {t("Prompt instructions for the AI agent")}
                          </span>
                          <div className="bg-code text-code-ink font-mono text-xs leading-relaxed p-4 rounded-lg overflow-x-auto whitespace-pre-wrap select-all">
                            {task.promptInstructions}
                          </div>
                        </div>

                        <div className="p-3.5 bg-ok-soft rounded-lg text-ok-ink">
                          <strong className="font-medium mb-1 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t("Verification steps")}
                          </strong>
                          <p className="text-xs leading-relaxed opacity-90">{task.verificationSteps}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Panel tetap berada di dalam pipeline agar papan dan transcript tidak tertutup modal penuh. */}
      {selectedTask && (
        <aside className="absolute inset-y-0 right-0 z-30 flex w-[min(100%,32rem)] flex-col border-l border-line bg-surface shadow-2xl animate-in slide-in-from-right duration-200" aria-label={t("Task details")}>
          <div className="sticky top-0 flex items-start justify-between gap-4 border-b border-line bg-surface px-6 py-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-[11px] font-semibold px-1.5 py-0.5 rounded bg-subtle text-muted">
                  {selectedTask.id}
                </span>
                <span className="text-xs text-faint truncate">{selectedTask.phase}</span>
              </div>
              <h3 className="text-base font-semibold text-ink">{selectedTask.title}</h3>
            </div>
            <button
              type="button"
              onClick={() => setSelectedTask(null)}
              className="p-1.5 shrink-0 rounded-lg text-faint hover:text-ink hover:bg-subtle transition-colors"
              aria-label={t("Close")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-6 space-y-4">
            <div>
              <span className="field-label">{t("Work status")}</span>
              <div className="inline-flex items-center gap-1 bg-subtle p-1 rounded-lg">
                {(
                  [
                    ["todo", t("To do")],
                    ["in_progress", t("In progress")],
                    ["done", t("Done")],
                  ] as const
                ).map(([status, label]) => {
                  const isActive =
                    selectedTask.status === status ||
                    (status === "todo" && !selectedTask.status);
                  return (
                    <button
                      key={status}
                      onClick={() => handleTaskStatusChange(selectedTask.id, status)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        isActive ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="field-label">{t("Target files")}</span>
              <div className="flex flex-wrap gap-1">
                {selectedTask.targetFiles?.map((f, i) => (
                  <span key={i} className="font-mono text-xs bg-subtle text-muted px-2 py-1 rounded">
                    {f}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <span className="field-label">{t("Dependencies")}</span>
              <p className="text-muted">{selectedTask.dependencies?.length ? selectedTask.dependencies.join(", ") : t("No dependencies")}</p>
            </div>

            <div>
              <span className="field-label">{t("Prompt instructions for the AI agent")}</span>
              <div className="p-4 bg-code text-code-ink font-mono text-xs rounded-lg whitespace-pre-wrap leading-relaxed select-all overflow-x-auto">
                {selectedTask.promptInstructions}
              </div>
            </div>

            <div className="p-4 bg-ok-soft rounded-lg text-ok-ink">
              <strong className="text-xs font-medium block mb-1">{t("Verification steps")}</strong>
              <p className="text-xs opacity-90">{selectedTask.verificationSteps}</p>
            </div>

            {selectedTaskHandoffJson && (
              <div className="rounded-lg border border-accent/30 bg-accent-soft p-4 text-accent-ink">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong className="text-xs font-semibold block">{t("Handoff package")}</strong>
                    <p className="mt-1 text-[11px] leading-relaxed opacity-80">
                      {selectedTask.handoffStatus === "handed_off" ? t("Handed off") : t("Ready to hand off; status is saved after download")}. {t("External results remain in Review until evidence is available.")}
                    </p>
                  </div>
                  <Download className="w-4 h-4 shrink-0" />
                </div>
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium">{t("Preview package")}</summary>
                  <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-code p-3 text-[10px] leading-relaxed text-code-ink whitespace-pre-wrap">
                    {selectedTaskHandoffJson}
                  </pre>
                </details>
                <button type="button" onClick={() => handleDownloadTaskHandoff(selectedTask)} className="btn-primary mt-3 !px-2.5 !py-1.5 text-xs">
                  <Download className="w-3.5 h-3.5" /> {t("Download handoff (.json)")}
                </button>
              </div>
            )}

            <section className="rounded-lg border border-line bg-subtle p-4" aria-label={t("Review and evidence")}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="field-label">{t("Review and evidence")}</span>
                  <p className="mt-1 text-[11px] text-faint">{t("Run status and attached verification evidence")}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setReviewRefresh((value) => value + 1)}
                  disabled={runReview.loading}
                  className="btn-ghost !px-2 !py-1 text-[11px] disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${runReview.loading ? "animate-spin" : ""}`} />
                  {t("Refresh")}
                </button>
              </div>

              {runReview.loading && <p className="mt-3 text-xs text-faint">{t("Loading run history...")}</p>}
              {!runReview.loading && runReview.error && (
                <div className="mt-3 rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger-ink">
                  {runReview.error}
                </div>
              )}
              {!runReview.loading && !runReview.error && runReview.data?.runs.length === 0 && (
                <p className="mt-3 rounded-lg border border-dashed border-line p-3 text-xs leading-relaxed text-faint">
                  {t("No runs recorded for this task yet. Run it or hand it off to an external tool; completion claims alone do not create evidence.")}
                </p>
              )}

              {!runReview.loading && !runReview.error && runReview.data && runReview.data.runs.length > 0 && (
                <div className="mt-3 space-y-2">
                  {runReview.data.runs.map((run) => {
                    const evidence = runReview.data?.evidenceByRunId[run.id] || [];
                    const evidenceError = runReview.data?.evidenceErrors[run.id];
                    return (
                      <div key={run.id} className="rounded-lg border border-line bg-surface p-3">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-mono text-[10px] text-faint">{run.id}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            run.status === "completed" ? "bg-warn-soft text-warn-ink" :
                            run.status === "failed" || run.status === "cancelled" || run.status === "interrupted" ? "bg-danger-soft text-danger-ink" :
                            "bg-subtle text-muted"
                          }`}>
                            {run.status === "completed" ? `${run.status} · ${t("Review")}` : run.status}
                          </span>
                        </div>
                        <p className="mt-1 text-[10px] text-faint">{runDate(run.updatedAt || run.createdAt)}</p>
                        {run.error && <p className="mt-2 text-xs text-danger-ink">{run.error}</p>}
                        <div className="mt-2 border-t border-line pt-2 text-xs">
                          {evidenceError ? (
                            <p className="text-danger-ink">{evidenceError}</p>
                          ) : evidence.length ? (
                            <div className="space-y-1.5">
                              <p className="font-medium text-ink">{t("Evidence ({count})", { count: evidence.length })}</p>
                              {evidence.map((item) => (
                                <div key={item.id} className="rounded bg-subtle px-2 py-1.5 text-muted">
                                  <span className="font-medium text-ink">{item.kind}</span>
                                  {item.summary && <span>: {item.summary}</span>}
                                  {item.exitCode !== null && <span className="text-faint"> · exit {item.exitCode}</span>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-faint">{t("No evidence attached to this run yet.")}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line px-6 py-4">
            {onRunTask && selectedTask.status !== "done" && (
              <button type="button" onClick={() => runTask(selectedTask)} disabled={Boolean(runningTaskId)} className="btn-primary disabled:opacity-50">
                {t("Run")}
              </button>
            )}
            <button type="button" onClick={() => handleCopyTaskPrompt(selectedTask)} className="btn-outline">
              {copiedTaskId === selectedTask.id ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              {copiedTaskId === selectedTask.id ? t("Copied") : t("Copy task prompt")}
            </button>
          </div>
        </aside>
      )}
    </div>
  );
};
