export interface LLMConfig {
  provider: 'gemini' | 'ollama' | 'custom';
  modelName: string;
  baseUrl?: string;
  apiKey?: string;
}

export interface ProjectInput {
  title: string;
  description: string;
  targetAudience?: string;
  techStackPreference?: string;
  answersToFollowUp: Record<string, string>;
}

export interface FollowUpQuestion {
  id: string;
  category: 'technical' | 'scope' | 'user' | 'priority';
  question: string;
  explanation: string;
  suggestedAnswer: string;
  options?: string[];
  // Ronde klarifikasi ke berapa pertanyaan ini muncul.
  round?: number;
}

export interface FeatureSpec {
  name: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
}

export interface TechStackSpec {
  layer: string;
  technology: string;
  rationale: string;
}

export interface FunctionalRequirement {
  id: string;
  title: string;
  description: string;
  priority: 'P0' | 'P1' | 'P2';
}

export interface NonFunctionalRequirement {
  category: string;
  description: string;
}

export interface DataEntity {
  name: string;
  description: string;
  fields: { name: string; type: string; constraints?: string }[];
}

export interface UserPersona {
  role: string;
  goal: string;
  painPoint: string;
}

export interface ArchitectureDraft {
  overview: string;
  components: { name: string; purpose: string; type: string }[];
  dataFlow: string;
  securityAndAuth: string;
  diagramMermaid?: string;
}

export interface RoadmapPhase {
  phase: string;
  title: string;
  duration: string;
  deliverables: string[];
}

export interface Estimation {
  totalTimeWeeks: string;
  complexityLevel: 'Rendah' | 'Sedang' | 'Tinggi' | 'Sangat Tinggi';
  requiredResources: string[];
  potentialRisks: { risk: string; mitigation: string }[];
}

export interface ProjectPlan {
  summary: string;
  specs: {
    targetAudience: string;
    keyValueProposition: string;
    coreFeatures: FeatureSpec[];
    techStack: TechStackSpec[];
  };
  architectureDraft: ArchitectureDraft;
  roadmap: RoadmapPhase[];
  estimation: Estimation;
}

export interface PRDSectionCoreFeatures {
  phase1: string[];
  phase2: string[];
  phase3: string[];
  futurePhases?: string[];
}

// Poin PRD di luar 7 poin wajib, ditambahkan LLM bila analisis menuntutnya.
export interface PRDExtraSection {
  number: number;
  title: string;
  content: string;
}

export interface PRDData {
  projectTitle: string;
  overview: string; // Point 1
  requirements: {   // Point 2
    functional: FunctionalRequirement[];
    nonFunctional: NonFunctionalRequirement[];
  };
  coreFeatures: PRDSectionCoreFeatures; // Point 3
  userFlow: string; // Point 4
  architecture: string; // Point 5
  databaseSchema: DataEntity[]; // Point 6
  techStack: TechStackSpec[]; // Point 7
  additionalSections?: PRDExtraSection[]; // Point 8+, opsional

  // Legacy / extra fields for compatibility
  executiveSummary?: string;
  userPersonas?: UserPersona[];
  functionalRequirements?: FunctionalRequirement[];
  nonFunctionalRequirements?: NonFunctionalRequirement[];
  dataSchema?: DataEntity[];
  logicFlowMermaid: string;
  logicFlowExplanation: string;
  fullMarkdownText: string;
}

export interface AgentTask {
  id: string;
  phase: string;
  title: string;
  priority: 'High' | 'Medium' | 'Low';
  targetFiles: string[];
  dependencies: string[];
  promptInstructions: string;
  verificationSteps: string;
  status?: 'todo' | 'in_progress' | 'done';
}

export interface ProjectSession {
  id: string;
  title: string;
  updatedAt: string;
  llmConfig: LLMConfig;
  input: ProjectInput;
  followUps: FollowUpQuestion[];
  plan?: ProjectPlan;
  prd?: PRDData;
  tasks?: AgentTask[];
  currentStep: 1 | 2 | 3;
  // Hasil penilaian LLM pada ronde klarifikasi terakhir.
  clarificationRound?: number;
  clarificationComplete?: boolean;
  readinessNote?: string;
}

// Baris riwayat dari SQLite — cukup untuk daftar, tanpa memuat payload penuh.
export interface SessionSummary {
  id: string;
  title: string;
  updatedAt: string;
  currentStep: number;
}
