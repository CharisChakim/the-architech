import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectSession } from "../types";
import { buildHandoffJson } from "./handoff";

test("handoff export redacts common credentials across project, PRD, and task text", () => {
  const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.signature_value";
  const session = {
    id: "project-1",
    title: "Harness",
    updatedAt: "2026-09-15T00:00:00Z",
    llmConfig: { provider: "custom", modelName: "model" },
    input: {
      title: "Harness",
      description: "Authorization: Bearer bearer-secret-value",
      answersToFollowUp: {},
    },
    followUps: [],
    currentStep: 3,
    workspaceRoot: "/workspace",
    prd: {
      projectTitle: "Harness",
      overview: "",
      requirements: { functional: [], nonFunctional: [] },
      coreFeatures: { phase1: [], phase2: [], phase3: [] },
      userFlow: "",
      architecture: "",
      databaseSchema: [],
      techStack: [],
      logicFlowMermaid: "",
      logicFlowExplanation: "",
      fullMarkdownText: `DATABASE_URL=postgres://user:db-password@localhost/app\nAWS=AKIAABCDEFGHIJKLMNOP\nJWT=${jwt}\n-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----`,
    },
    tasks: [{
      id: "task-1",
      phase: "Build",
      title: "Build",
      priority: "High",
      targetFiles: ["src/app.ts", ".env", "secrets/token.txt"],
      dependencies: [],
      promptInstructions: "api_key=secretvalue",
      verificationSteps: "npm test",
    }],
  } satisfies ProjectSession;

  const exported = buildHandoffJson(session);

  for (const secret of ["bearer-secret-value", "db-password", "AKIAABCDEFGHIJKLMNOP", jwt, "private-material", "secretvalue"]) {
    assert.equal(exported.includes(secret), false, `leaked ${secret}`);
  }
  assert.equal(exported.includes(".env"), false);
  assert.equal(exported.includes("secrets/token.txt"), false);
  assert.equal(exported.includes("src/app.ts"), true);
});
