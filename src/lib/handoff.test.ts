import assert from "node:assert/strict";
import test from "node:test";

import type { ProjectSession } from "../types";
import { buildHandoffMarkdown, buildHandoffPackage, buildHandoffJson } from "./handoff";

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

test("handoff export redacts quoted keys, Slack tokens, and *_TOKEN variables", () => {
  const session = {
    id: "project-2",
    title: "Config",
    updatedAt: "2026-09-24T00:00:00Z",
    llmConfig: { provider: "custom", modelName: "model" },
    input: {
      title: "Config",
      description: [
        '{"password": "json-password-value", "api_key": "json-api-key-value"}',
        // Built at runtime so secret scanners do not take the fixture for a real token.
        `SLACK_BOT=${["xoxb", "123456789012", "slackvaluesecret"].join("-")}`,
        "NPM_TOKEN=npm-token-value",
        "access_token: yaml-access-value",
      ].join("\n"),
      answersToFollowUp: {},
    },
    followUps: [],
    currentStep: 3,
    tasks: [],
  } satisfies ProjectSession;

  const exported = buildHandoffJson(session);

  for (const secret of ["json-password-value", "json-api-key-value", "slackvaluesecret", "npm-token-value", "yaml-access-value"]) {
    assert.equal(exported.includes(secret), false, `leaked ${secret}`);
  }
  // The key stays so the reader knows which setting to fill in.
  assert.equal(exported.includes("NPM_TOKEN"), true);
});

test("a single-task handoff says what its dependencies are and which PRD it came from", () => {
  const task = (id: string, extra: Partial<ProjectSession["tasks"][number]> = {}) => ({
    id, phase: "Build", title: `Title ${id}`, priority: "High" as const, targetFiles: [], dependencies: [],
    promptInstructions: "", verificationSteps: "npm test", ...extra,
  });
  const session = {
    id: "project-3",
    title: "Deps",
    updatedAt: "2026-09-24T00:00:00Z",
    llmConfig: { provider: "custom", modelName: "model" },
    input: { title: "Deps", description: "", answersToFollowUp: {} },
    followUps: [],
    currentStep: 3,
    prdVersions: [{ id: "prd-2", number: 2, status: "active", contentHash: "hash-2", content: "PRD v2", timestamp: "" }],
    tasks: [
      task("task-1", { status: "done" }),
      task("task-2"),
      task("task-3", {
        dependencies: ["task-1", "task-2", "task-9"],
        sourcePrdVersionId: "prd-1",
        sourcePrdVersionNumber: 1,
        sourcePrdContentHash: "hash-1",
      }),
    ],
  } as ProjectSession;

  const handoff = buildHandoffPackage(session, session.tasks[2]);

  assert.deepEqual(handoff.task?.dependencyDetails, [
    { id: "task-1", title: "Title task-1", status: "done" },
    { id: "task-2", title: "Title task-2", status: "open" },
    { id: "task-9", title: "", status: "unknown" },
  ]);
  assert.deepEqual(handoff.task?.prdSource, { versionNumber: 1, needsSync: true });
  assert.equal(buildHandoffPackage(session, session.tasks[0]).task?.prdSource, null);

  const markdown = buildHandoffMarkdown(session, session.tasks[2]);
  assert.match(markdown, /task-2 \(Title task-2\): open/);
  assert.match(markdown, /PRD source\*\*: version 1 \(the PRD has changed/);
});
