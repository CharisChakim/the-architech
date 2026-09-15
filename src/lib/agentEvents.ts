import type { FollowUpQuestion } from "../types";

export type ToolState = "running" | "ok" | "error" | "denied";

export type Entry =
  | { kind: "user"; id: string; text: string }
  | { kind: "assistant"; id: string; text: string; streaming: boolean }
  | {
      kind: "tool";
      id: string;
      name: string;
      input: unknown;
      result?: unknown;
      state: ToolState;
      startedAt: number;
      endedAt?: number;
    }
  | {
      kind: "approval";
      id: string;
      elicitId: string;
      command: string;
      cwd?: string;
      decided: boolean;
      approved?: boolean;
    }
  | {
      kind: "questions";
      id: string;
      elicitId: string;
      conversationId: string;
      questions: FollowUpQuestion[];
      round: number;
      answered: boolean;
    }
  | { kind: "turn_end"; id: string; toolCount: number; ms: number }
  | { kind: "error"; id: string; message: string; retryable: boolean };

export type AgentEvent = {
  type:
    | "conversation"
    | "turn"
    | "text"
    | "tool_start"
    | "tool_done"
    | "approval_request"
    | "approval_resolved"
    | "questions"
    | "done"
    | "error"
    | "abort"
    | "history";
  conversationId?: string;
  turn?: number;
  maxTurns?: number;
  text?: string;
  id?: string;
  tool?: string;
  input?: unknown;
  result?: unknown;
  isError?: boolean;
  cwd?: string;
  approvalId?: string;
  elicitId?: string;
  approved?: boolean;
  command?: string;
  questions?: FollowUpQuestion[];
  round?: number;
  message?: string;
  retryable?: boolean;
  stop?: "stop" | "tool_calls" | "max_tokens" | "other";
  history?: unknown[];
};
