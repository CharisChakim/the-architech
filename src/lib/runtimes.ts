import { useCallback, useEffect, useState } from "react";
import {
  RUNTIME_IDS,
  type CapabilitySupport,
  type CatalogAvailability,
  type CatalogSource,
  type DefaultSource,
  type RuntimeAuthStatus,
  type RuntimeCatalog,
  type RuntimeCapabilities,
  type RuntimeDetection,
  type RuntimeDiscoveryReport,
  type RuntimeEffortOption,
  type RuntimeId,
  type RuntimeModel,
  type RuntimePreference,
  type RuntimePreferenceInput,
  type RuntimeStatus,
} from "../types";

export class RuntimeApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RuntimeApiError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function runtimeId(value: unknown): RuntimeId | null {
  return RUNTIME_IDS.includes(value as RuntimeId) ? value as RuntimeId : null;
}

function runtimeStatus(value: unknown): RuntimeStatus {
  return value === "ready"
    || value === "needs_login"
    || value === "not_installed"
    || value === "unsupported_version"
    || value === "error"
    ? value
    : "error";
}

function authStatus(value: unknown): RuntimeAuthStatus {
  return value === "authenticated" || value === "unauthenticated" || value === "unknown"
    ? value
    : "unknown";
}

function capability(value: unknown): CapabilitySupport {
  return value === "supported" || value === "unsupported" || value === "unknown"
    ? value
    : "unknown";
}

function capabilities(value: unknown): RuntimeCapabilities {
  const item = isRecord(value) ? value : {};
  return {
    structuredOutput: capability(item.structuredOutput),
    toolUse: capability(item.toolUse),
    approval: capability(item.approval),
    resume: capability(item.resume),
    interrupt: capability(item.interrupt),
    usage: capability(item.usage),
    streaming: capability(item.streaming),
  };
}

function catalogSource(value: unknown): CatalogSource {
  return value === "codex-app-server:model/list"
    || value === "claude-agent-sdk:supportedModels"
    || value === "antigravity-cli:agy models"
    || value === "manual"
    || value === "unknown"
    ? value
    : "unknown";
}

function catalogAvailability(value: unknown): CatalogAvailability {
  return value === "listed" || value === "verified" || value === "unavailable" || value === "unknown"
    ? value
    : "unknown";
}

function defaultSource(value: unknown): DefaultSource {
  return value === "catalog"
    || value === "runtime-config"
    || value === "user-override"
    || value === "model-default"
    || value === "unknown"
    ? value
    : "unknown";
}

function effortOptions(value: unknown): RuntimeEffortOption[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry): RuntimeEffortOption[] => {
    if (typeof entry === "string" && entry.trim()) return [{ value: entry, label: entry }];
    if (!isRecord(entry)) return [];
    const native = stringValue(entry.value) ?? stringValue(entry.id) ?? stringValue(entry.name);
    return native ? [{ value: native, label: stringValue(entry.label) ?? native }] : [];
  });
}

function runtimeModel(value: unknown, catalog: { connectionId: string; source: CatalogSource; discoveredAt: string; runtimeVersion: string | null }): RuntimeModel | null {
  if (!isRecord(value)) return null;
  const modelId = stringValue(value.modelId) ?? stringValue(value.id);
  if (!modelId) return null;
  return {
    connectionId: stringValue(value.connectionId) ?? catalog.connectionId,
    modelId,
    label: stringValue(value.label) ?? stringValue(value.displayName) ?? modelId,
    source: catalogSource(value.source) === "unknown" ? catalog.source : catalogSource(value.source),
    discoveredAt: stringValue(value.discoveredAt) ?? catalog.discoveredAt,
    runtimeVersion: stringValue(value.runtimeVersion) ?? catalog.runtimeVersion,
    authScope: stringValue(value.authScope),
    availability: catalogAvailability(value.availability),
    effortOptions: effortOptions(value.effortOptions),
    defaultModel: stringValue(value.defaultModel),
    defaultEffort: stringValue(value.defaultEffort),
    defaultSource: defaultSource(value.defaultSource),
    capabilities: capabilities(value.capabilities),
  };
}

function runtimeCatalog(value: unknown, detection: { runtime: RuntimeId; version: string | null; checkedAt: string }): RuntimeCatalog | null {
  if (!isRecord(value)) return null;
  const connectionId = stringValue(value.connectionId) ?? `runtime:${detection.runtime}`;
  const source = catalogSource(value.source);
  const discoveredAt = stringValue(value.discoveredAt) ?? detection.checkedAt;
  const models = Array.isArray(value.models)
    ? value.models.flatMap((model) => runtimeModel(model, {
        connectionId,
        source,
        discoveredAt,
        runtimeVersion: detection.version,
      }))
    : [];
  return {
    connectionId,
    runtime: runtimeId(value.runtime) ?? detection.runtime,
    source,
    discoveredAt,
    expiresAt: stringValue(value.expiresAt) ?? discoveredAt,
    models,
    error: stringValue(value.error),
  };
}

function runtimeDetection(value: unknown): RuntimeDetection | null {
  if (!isRecord(value)) return null;
  const runtime = runtimeId(value.runtime);
  if (!runtime) return null;
  const version = stringValue(value.version);
  const checkedAt = stringValue(value.checkedAt) ?? new Date().toISOString();
  return {
    runtime,
    status: runtimeStatus(value.status),
    authStatus: authStatus(value.authStatus),
    binaryFound: value.binaryFound === true,
    version,
    checkedAt,
    capabilities: capabilities(value.capabilities),
    catalog: runtimeCatalog(value.catalog, { runtime, version, checkedAt }),
    diagnostic: stringValue(value.diagnostic),
  };
}

function runtimeReport(value: unknown): RuntimeDiscoveryReport {
  if (!isRecord(value)) throw new Error("Invalid runtime discovery response.");
  const runtimes = Array.isArray(value.runtimes)
    ? value.runtimes.flatMap(runtimeDetection)
    : [];
  return {
    checkedAt: stringValue(value.checkedAt) ?? new Date().toISOString(),
    ttlMs: numberValue(value.ttlMs, 0),
    runtimes,
  };
}

function preferenceSource(value: unknown): RuntimePreference["modelSource"] {
  return value === "user-override" ? "user-override" : "inherit";
}

function preferenceScope(value: unknown): RuntimePreference["scope"] {
  return value === "workspace" || value === "role" ? value : "global";
}

function runtimePreference(value: unknown): RuntimePreference | null {
  if (!isRecord(value)) return null;
  const runtime = runtimeId(value.runtime);
  const connectionId = stringValue(value.connectionId);
  if (!runtime || !connectionId) return null;
  const requestedModel = stringValue(value.requestedModel) ?? "inherit";
  const requestedEffort = stringValue(value.requestedEffort) ?? "inherit";
  return {
    runtime,
    connectionId,
    scope: preferenceScope(value.scope),
    scopeKey: stringValue(value.scopeKey),
    requestedModel,
    requestedEffort,
    modelSource: preferenceSource(value.modelSource),
    effortSource: preferenceSource(value.effortSource),
    updatedAt: stringValue(value.updatedAt),
  };
}

async function responseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function requestRuntimeDiscovery(method: "GET" | "POST"): Promise<RuntimeDiscoveryReport> {
  const response = await fetch(method === "GET" ? "/api/runtimes" : "/api/runtimes/discover", {
    method,
    headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
    ...(method === "POST" ? { body: "{}" } : {}),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "Failed to discover runtimes.";
    throw new RuntimeApiError(message, response.status);
  }
  return runtimeReport(body);
}

export function fetchRuntimeDiscovery(): Promise<RuntimeDiscoveryReport> {
  return requestRuntimeDiscovery("GET");
}

export function discoverRuntimes(): Promise<RuntimeDiscoveryReport> {
  return requestRuntimeDiscovery("POST");
}

export async function fetchRuntimePreferences(): Promise<RuntimePreference[]> {
  const response = await fetch("/api/runtime-preferences");
  const body = await responseBody(response);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "Failed to load runtime preferences.";
    throw new RuntimeApiError(message, response.status);
  }
  if (!isRecord(body)) throw new Error("Invalid runtime preferences response.");
  return Array.isArray(body.preferences) ? body.preferences.flatMap(runtimePreference) : [];
}

export async function saveRuntimePreference(input: RuntimePreferenceInput): Promise<RuntimePreference> {
  const response = await fetch("/api/runtime-preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = await responseBody(response);
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === "string" ? body.error : "Failed to save runtime preference.";
    throw new RuntimeApiError(message, response.status);
  }
  const preference = isRecord(body) ? runtimePreference(body.preference) : null;
  if (!preference) throw new Error("Invalid runtime preference response.");
  return preference;
}

export interface RuntimeDiscoveryState {
  report: RuntimeDiscoveryReport | null;
  preferences: RuntimePreference[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<RuntimeDiscoveryReport>;
  savePreference: (input: RuntimePreferenceInput) => Promise<RuntimePreference>;
}

/** Fetches metadata only while enabled, preserving the last report during refresh. */
export function useRuntimeDiscovery(enabled = true): RuntimeDiscoveryState {
  const [report, setReport] = useState<RuntimeDiscoveryReport | null>(null);
  const [preferences, setPreferences] = useState<RuntimePreference[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await discoverRuntimes();
      setReport(next);
      return next;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      setError(message);
      throw cause;
    } finally {
      setLoading(false);
    }
  }, []);

  const savePreference = useCallback(async (input: RuntimePreferenceInput) => {
    const next = await saveRuntimePreference(input);
    setPreferences((current) => {
      const exists = current.some((item) => (
        item.runtime === next.runtime
        && item.connectionId === next.connectionId
        && item.scope === next.scope
        && item.scopeKey === next.scopeKey
      ));
      return exists
        ? current.map((item) => (
            item.runtime === next.runtime
            && item.connectionId === next.connectionId
            && item.scope === next.scope
            && item.scopeKey === next.scopeKey
              ? next
              : item
          ))
        : [...current, next];
    });
    return next;
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    void Promise.all([fetchRuntimeDiscovery(), fetchRuntimePreferences()]).then(
      ([next, nextPreferences]) => {
        if (!active) return;
        setReport(next);
        setPreferences(nextPreferences);
        setLoading(false);
      },
      (cause) => {
        if (!active) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setLoading(false);
      },
    );
    return () => {
      active = false;
    };
  }, [enabled]);

  return { report, preferences, loading, error, refresh, savePreference };
}
