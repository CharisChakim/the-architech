export interface AgentHarnessSettings {
  compactTerminal: boolean;
  conciseAnswers: boolean;
  minimalCode: boolean;
  karpathyGuidelines: boolean;
}

export const DEFAULT_AGENT_HARNESS_SETTINGS: AgentHarnessSettings = {
  compactTerminal: true,
  conciseAnswers: true,
  minimalCode: true,
  karpathyGuidelines: true,
};

export function parseAgentHarnessSettings(value: unknown): AgentHarnessSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return DEFAULT_AGENT_HARNESS_SETTINGS;
  const settings = value as Record<string, unknown>;
  return {
    compactTerminal: settings.compactTerminal !== false,
    conciseAnswers: settings.conciseAnswers !== false,
    minimalCode: settings.minimalCode !== false,
    karpathyGuidelines: settings.karpathyGuidelines !== false,
  };
}

export function agentHarnessPrompt(settings: AgentHarnessSettings): string {
  const sections: string[] = [];
  // Ketiga lapis efisiensi dinyalakan terpisah, jadi judulnya ditulis sekali
  // dan hanya bullet yang aktif menyusul. Menyalakan satu lapis tidak boleh
  // membawa instruksi dua lapis lainnya.
  const efficiency: string[] = [];
  if (settings.compactTerminal) {
    efficiency.push(
      "- Terminal: use targeted commands, search with rg first, filter or cap long output, and summarize logs instead of dumping them."
    );
  }
  if (settings.conciseAnswers) {
    efficiency.push(
      "- Answers: address only the request; omit preambles, repetition, and unsolicited alternatives. Preserve exact code, commands, paths, numbers, negation, uncertainty, and safety warnings."
    );
  }
  if (settings.minimalCode) {
    efficiency.push(
      "- Code: implement the minimum correct change. Avoid speculative abstractions, dependencies, files, and rewrites."
    );
  }
  if (efficiency.length) {
    sections.push(`Efficiency stack:\n${efficiency.join("\n")}`);
  }
  if (settings.karpathyGuidelines) {
    sections.push(`Karpathy coding guidelines:
- Before non-trivial coding, state brief Assumptions, Scope, and Done when criteria.
- Ask when harmful ambiguity remains. Prefer the simplest solution and a surgical diff.
- Do not reformat or clean unrelated code. Verify the requested outcome and report concrete evidence.`);
  }
  return sections.join("\n\n");
}

export function applyAgentHarness(message: string, settings: AgentHarnessSettings): string {
  const prompt = agentHarnessPrompt(settings);
  if (!prompt) return message;
  return `<agent_harness>\n${prompt}\n</agent_harness>\n\n<user_request>\n${message}\n</user_request>`;
}
