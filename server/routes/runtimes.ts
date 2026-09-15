import express from "express";
import { discoverRuntimes } from "../runtimes/discovery.ts";
import type { RuntimeDetection, RuntimeDiscoveryReport } from "../runtimes/types.ts";
import { loadClaudeSdkModule } from "../runtime-runner/index.ts";

const router = express.Router();

/** Remove local executable paths before returning discovery to a browser. */
function publicRuntime(runtime: RuntimeDetection): Omit<RuntimeDetection, "binaryPath"> & { binaryFound: boolean } {
  const { binaryPath, ...safe } = runtime;
  return { ...safe, binaryFound: Boolean(binaryPath) };
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

async function discover(req: express.Request, res: express.Response): Promise<void> {
  try {
    const report = await reportFor(req.method === "POST");
    res.json({
      ...report,
      runtimes: report.runtimes.map(publicRuntime),
    });
  } catch {
    // Do not echo command/provider output: it can contain environment-specific
    // paths or authentication diagnostics.
    res.status(500).json({ error: "RUNTIME_DISCOVERY_FAILED" });
  }
}

router.get("/api/runtimes", discover);
router.post("/api/runtimes/discover", discover);

export { router };
export default router;
