import React from "react";
import { ProjectSession } from "../types";
import { X, Download, FileText, Compass, Bot, FileCode, CheckCircle2 } from "lucide-react";

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: ProjectSession;
}

export const ExportModal: React.FC<ExportModalProps> = ({ isOpen, onClose, session }) => {
  if (!isOpen) return null;

  const projectTitle = session.input.title || session.title || "Proyek";
  const slug = projectTitle.toLowerCase().replace(/[^a-z0-9]/g, "_");

  const downloadFile = (filename: string, content: string, mime: string) => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPlan = () => {
    if (!session.plan) return;
    let md = `# PROJECT PLAN & ARCHITECTURE SPECIFICATION: ${projectTitle.toUpperCase()}\n\n`;
    md += `## SUMMARY\n${session.plan.summary}\n\n`;
    md += `## CORE FEATURES\n`;
    session.plan.specs.coreFeatures.forEach((f) => {
      md += `- **[${f.priority}] ${f.name}**: ${f.description}\n`;
    });
    md += `\n## RECOMMENDED TECH STACK\n`;
    session.plan.specs.techStack.forEach((t) => {
      md += `- **${t.layer}**: ${t.technology} (${t.rationale})\n`;
    });
    md += `\n## ARCHITECTURE DRAFT\n${session.plan.architectureDraft.overview}\n\n`;
    md += `### Data Flow\n${session.plan.architectureDraft.dataFlow}\n\n`;
    md += `### Security & Auth\n${session.plan.architectureDraft.securityAndAuth}\n\n`;
    md += `## ROADMAP\n`;
    session.plan.roadmap.forEach((r) => {
      md += `### ${r.title} (${r.duration})\n`;
      r.deliverables.forEach((d) => (md += `- ${d}\n`));
      md += `\n`;
    });
    md += `## ESTIMATION & RESOURCES\n`;
    md += `- Total Time: ${session.plan.estimation.totalTimeWeeks}\n`;
    md += `- Complexity: ${session.plan.estimation.complexityLevel}\n`;

    downloadFile(`PLAN_${slug}.md`, md, "text/markdown");
  };

  const handleDownloadPrd = () => {
    if (!session.prd?.fullMarkdownText) return;
    downloadFile(`PRD_${slug}.md`, session.prd.fullMarkdownText, "text/markdown");
  };

  const handleDownloadTasks = () => {
    if (!session.tasks) return;
    let md = `# AI AGENT EXECUTION TASKS: ${projectTitle.toUpperCase()}\n\n`;
    session.tasks.forEach((t) => {
      md += `### [${t.id}] ${t.title}\n`;
      md += `- Phase: ${t.phase}\n`;
      md += `- Priority: ${t.priority}\n`;
      md += `- Target Files: ${(t.targetFiles || []).join(", ")}\n\n`;
      md += `#### Instructions:\n\`\`\`\n${t.promptInstructions}\n\`\`\`\n\n`;
      md += `#### Verification:\n${t.verificationSteps}\n\n`;
      md += `---------------------------------------------------\n\n`;
    });

    downloadFile(`AGENTS_${slug}.md`, md, "text/markdown");
  };

  const handleDownloadJsonBackup = () => {
    const jsonStr = JSON.stringify(session, null, 2);
    downloadFile(`PROJECT_BUNDLE_${slug}.json`, jsonStr, "application/json");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-white dark:bg-[#2f3546] rounded-2xl shadow-lg border border-slate-200 dark:border-[#3f4557] w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Download className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-base">Export Bundle Dokumen Proyek</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-white p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
            Unduh semua artifact hasil perencanaan AI Anda. Pilih dokumen spesifik yang ingin di-download atau ekspor seluruh bundle JSON.
          </p>

          <div className="space-y-3">
            {/* Download Plan */}
            <button
              onClick={handleDownloadPlan}
              disabled={!session.plan}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] hover:bg-slate-100/80 dark:hover:bg-slate-700/50 rounded-2xl text-left transition-all disabled:opacity-40"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">Project Plan & Arsitektur (.md)</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Spesifikasi, tech stack, dan roadmap.</div>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </button>

            {/* Download PRD */}
            <button
              onClick={handleDownloadPrd}
              disabled={!session.prd}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] hover:bg-slate-100/80 dark:hover:bg-slate-700/50 rounded-2xl text-left transition-all disabled:opacity-40"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300 flex items-center justify-center">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">Product Requirement Document (.md)</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">PRD lengkap + diagram logika.</div>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </button>

            {/* Download Tasks */}
            <button
              onClick={handleDownloadTasks}
              disabled={!session.tasks}
              className="w-full flex items-center justify-between p-3.5 bg-slate-50 dark:bg-slate-700/40 border border-slate-200 dark:border-[#3f4557] hover:bg-slate-100/80 dark:hover:bg-slate-700/50 rounded-2xl text-left transition-all disabled:opacity-40"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 flex items-center justify-center">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-slate-900 dark:text-slate-100">AI Agent Executable Tasks (AGENTS.md)</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">Task list atomik siap untuk AI Coding Agent.</div>
                </div>
              </div>
              <Download className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </button>

            {/* Download Full JSON Bundle */}
            <button
              onClick={handleDownloadJsonBackup}
              className="w-full flex items-center justify-between p-3.5 bg-indigo-50 dark:bg-indigo-500/15 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100/80 rounded-2xl text-left transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center">
                  <FileCode className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold text-xs text-indigo-950 dark:text-indigo-200">Full Backup Project Session (.json)</div>
                  <div className="text-xs text-indigo-700 dark:text-indigo-300">Format JSON utuh berisi seluruh state perencanaan.</div>
                </div>
              </div>
              <Download className="w-4 h-4 text-indigo-600 dark:text-indigo-300" />
            </button>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/40 border-t border-slate-200 dark:border-[#3f4557] flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-semibold">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
