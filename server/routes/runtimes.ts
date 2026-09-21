import express from "express";
import {
  listRuntimeBinaryPaths,
  parseRuntimeBinaryPathInput,
  saveRuntimeBinaryPath,
  RuntimeBinaryPathError,
} from "../runtimes/binary-paths.ts";
import { discoverRuntimes } from "../runtimes/discovery.ts";
import type { RuntimeDetection, RuntimeDiscoveryReport, RuntimeId } from "../runtimes/types.ts";
import { loadClaudeSdkModule } from "../runtime-runner/index.ts";

const router = express.Router();

/**
 * Remove discovered executable paths before returning discovery to a browser.
 * An override is echoed back because the user typed it themselves; the path
 * discovery found on its own stays hidden.
 */
function publicRuntime(
  runtime: RuntimeDetection,
  overrides: Partial<Record<RuntimeId, string>>,
): Omit<RuntimeDetection, "binaryPath"> & { binaryFound: boolean; binaryPathOverride: string | null } {
  const { binaryPath, ...safe } = runtime;
  return {
    ...safe,
    binaryFound: Boolean(binaryPath),
    binaryPathOverride: overrides[runtime.runtime] ?? null,
  };
}

let cachedReport: RuntimeDiscoveryReport | null = null;
let inFlight: Promise<RuntimeDiscoveryReport> | null = null;

function cacheFresh(report: RuntimeDiscoveryReport): boolean {
  const checkedAt = Date.parse(report.checkedAt);
  return Number.isFinite(checkedAt) && Date.now() < checkedAt + report.ttlMs;
}

async function reportFor(force: boolean): Promise<RuntimeDiscoveryReport> {
  if (!force && cachedReport && cacheFresh(cachedReport)) return cachedReport;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const claudeSdk = await loadClaudeSdkModule().catch(() => null);
    return discoverRuntimes({
      binaryPaths: listRuntimeBinaryPaths(),
      ...(claudeSdk?.supportedModels
        ? { claudeSdk: { supportedModels: claudeSdk.supportedModels } }
        : {}),
    });
  })().then((report) => {
    cachedReport = report;
    return report;
  }).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

function respondWithReport(report: RuntimeDiscoveryReport, res: express.Response): void {
  const overrides = listRuntimeBinaryPaths();
  res.json({
    ...report,
    runtimes: report.runtimes.map((runtime) => publicRuntime(runtime, overrides)),
  });
}

async function discover(req: express.Request, res: express.Response): Promise<void> {
  try {
    respondWithReport(await reportFor(req.method === "POST"), res);
  } catch {
    // Do not echo command/provider output: it can contain environment-specific
    // paths or authentication diagnostics.
    res.status(500).json({ error: "RUNTIME_DISCOVERY_FAILED" });
  }
}

/**
 * Saving an override changes what discovery would resolve, so the cached report
 * is dropped and the answer is a freshly detected one rather than a stale card.
 */
async function saveBinaryPath(req: express.Request, res: express.Response): Promise<void> {
  let input;
  try {
    input = parseRuntimeBinaryPathInput(req.body);
  } catch (error) {
    const code = error instanceof RuntimeBinaryPathError ? error.code : "PATH_INVALID";
    res.status(400).json({ error: code });
    return;
  }
  try {
    saveRuntimeBinaryPath(input);
    cachedReport = null;
    respondWithReport(await reportFor(true), res);
  } catch {
    res.status(500).json({ error: "RUNTIME_DISCOVERY_FAILED" });
  }
}

router.get("/api/runtimes", discover);
router.post("/api/runtimes/discover", discover);
router.put("/api/runtimes/binary-path", saveBinaryPath);

export { router };
export default router;
