import assert from "node:assert/strict";
import test from "node:test";

import type { AgentTask, PRDData } from "../types";
import {
  attachPrdVersionToTasks,
  markTasksNeedsSync,
  mergeGeneratedTasks,
  recordPrdVersion,
  taskNeedsPrdSync,
} from "./artifactVersions";

function prd(markdown: string): PRDData {
  return {
    projectTitle: "Harness",
    overview: "Overview",
    fullMarkdownText: markdown,
  } as PRDData;
}

function task(id: string): AgentTask {
  return {
    id,
    title: id,
    phase: "Build",
    priority: "Medium",
    dependencies: [],
    targetFiles: [],
    promptInstructions: "",
    verificationSteps: "",
  };
}

test("PRD versions are immutable, sequential, and deduplicated by content", () => {
  const first = recordPrdVersion(prd("# One"), [], new Date("2026-09-15T00:00:00Z"));
  const duplicate = recordPrdVersion(prd("# One"), first.versions, new Date("2026-09-15T01:00:00Z"));
  const second = recordPrdVersion(prd("# Two"), duplicate.versions, new Date("2026-09-15T02:00:00Z"));

  assert.equal(first.created, true);
  assert.equal(duplicate.created, false);
  assert.equal(duplicate.versions.length, 1);
  assert.equal(duplicate.version.id, first.version.id);
  assert.equal(second.version.number, 2);
  assert.deepEqual(second.versions.map((version) => version.status), ["superseded", "active"]);
  assert.equal(first.version.status, "active");
});

test("manual tasks survive generated ID collisions and dependencies follow renamed IDs", () => {
  const manual = task("api");
  const generatedApi = { ...task("api"), sourcePrdVersionId: "prd-1" };
  const generatedUi = { ...task("ui"), sourcePrdVersionId: "prd-1", dependencies: ["api"] };
  const merged = mergeGeneratedTasks([manual], [generatedApi, generatedUi]);

  assert.equal(merged[0], manual);
  assert.equal(merged[1]!.id, "api-generated-2");
  assert.deepEqual(merged[2]!.dependencies, ["api-generated-2"]);
});

test("generated tasks retain their PRD source and stale tasks require explicit sync", () => {
  const first = recordPrdVersion(prd("# One"));
  const generated = attachPrdVersionToTasks([task("generated")], first.version);
  const second = recordPrdVersion(prd("# Two"), first.versions);
  const marked = markTasksNeedsSync([...generated, task("manual")], second.version);

  assert.equal(taskNeedsPrdSync(marked[0]!, second.version), true);
  assert.equal(marked[0]!.syncStatus, "needs_sync");
  assert.equal(taskNeedsPrdSync(marked[1]!, second.version), false);
  assert.equal(marked[1]!.syncStatus, undefined);
});
