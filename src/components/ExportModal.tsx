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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="card shadow-lg w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-line flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Download className="w-4 h-4 text-faint" />
            <h3 className="font-semibold text-ink">Export bundle dokumen proyek</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-faint hover:text-ink hover:bg-subtle rounded-lg transition-colors"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <p className="text-muted leading-relaxed">
            Unduh artifact hasil perencanaan. Pilih dokumen tertentu, atau ekspor seluruh sesi sebagai JSON.
          </p>

          <div className="space-y-2">
            {[
              {
                onClick: handleDownloadPlan,
                disabled: !session.plan,
                icon: Compass,
                title: "Project plan & arsitektur (.md)",
                caption: "Spesifikasi, tech stack, dan roadmap.",
              },
              {
                onClick: handleDownloadPrd,
                disabled: !session.prd,
                icon: FileText,
                title: "Product requirement document (.md)",
                caption: "PRD lengkap beserta diagram logika.",
              },
              {
                onClick: handleDownloadTasks,
                disabled: !session.tasks,
                icon: Bot,
                title: "AI agent executable tasks (AGENTS.md)",
                caption: "Task atomik siap diberikan ke AI coding agent.",
              },
              {
                onClick: handleDownloadJsonBackup,
                disabled: false,
                icon: FileCode,
                title: "Full backup project session (.json)",
                caption: "Seluruh state perencanaan dalam satu berkas.",
              },
            ].map(({ onClick, disabled, icon: Icon, title, caption }) => (
              <button
                key={title}
                onClick={onClick}
                disabled={disabled}
                className="w-full flex items-center justify-between gap-3 p-3 border border-line hover:bg-subtle rounded-lg text-left transition-colors disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="flex items-center gap-3 min-w-0">
                  <span className="w-8 h-8 shrink-0 rounded-lg bg-accent-soft text-accent-ink grid place-items-center">
                    <Icon className="w-4 h-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-xs text-ink truncate">{title}</span>
                    <span className="block text-xs text-faint truncate">{caption}</span>
                  </span>
                </span>
                <Download className="w-4 h-4 text-faint shrink-0" />
              </button>
            ))}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-line flex justify-end">
          <button onClick={onClose} className="btn-outline">
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
};
