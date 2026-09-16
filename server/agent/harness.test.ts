import assert from "node:assert/strict";
import test from "node:test";

import {
  agentHarnessPrompt,
  applyAgentHarness,
  parseAgentHarnessSettings,
} from "./harness.ts";

test("agent harness settings default on and can be disabled independently", () => {
  assert.deepEqual(parseAgentHarnessSettings(undefined), {
    efficiencyStack: true,
    karpathyGuidelines: true,
  });
  assert.deepEqual(parseAgentHarnessSettings({ efficiencyStack: false }), {
    efficiencyStack: false,
    karpathyGuidelines: true,
  });
});

test("agent harness emits only enabled instruction groups", () => {
  const efficiencyOnly = agentHarnessPrompt({ efficiencyStack: true, karpathyGuidelines: false });
  assert.match(efficiencyOnly, /Efficiency stack/);
  assert.doesNotMatch(efficiencyOnly, /Karpathy/);

  const disabled = { efficiencyStack: false, karpathyGuidelines: false };
  assert.equal(agentHarnessPrompt(disabled), "");
  assert.equal(applyAgentHarness("Keep this exact request", disabled), "Keep this exact request");
});

test("native runtime request is separated from harness instructions", () => {
  const prompt = applyAgentHarness("Fix <tag> safely", {
    efficiencyStack: true,
    karpathyGuidelines: true,
  });
  assert.match(prompt, /^<agent_harness>/);
  assert.match(prompt, /<user_request>\nFix <tag> safely\n<\/user_request>$/);
});
