import assert from "node:assert/strict";
import { test } from "node:test";

import { parseClaudeSupportedModels } from "./parse.ts";

test("parses current Claude Agent SDK ModelInfo values and effort levels", () => {
  const models = parseClaudeSupportedModels([
    {
      value: "default",
      resolvedModel: "claude-opus",
      displayName: "Default (recommended)",
      supportsEffort: true,
      supportedEffortLevels: ["low", "medium", "high", "xhigh", "max"],
    },
    {
      value: "haiku",
      resolvedModel: "claude-haiku",
      displayName: "Haiku",
    },
  ]);

  assert.deepEqual(models.map((model) => model.modelId), ["default", "haiku"]);
  assert.deepEqual(models[0]?.effortOptions.map((option) => option.value), [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  assert.deepEqual(models[1]?.effortOptions, []);
});
