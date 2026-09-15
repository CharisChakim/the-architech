import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * A draft belongs to a stable session or conversation identity, never to a
 * project title. The conversation field is optional so standalone chat can
 * use the same store when it gets its own identity.
 */
export interface DraftScope {
  sessionId?: string;
  conversationId?: string;
  name: string;
}

const DRAFT_STORAGE_PREFIX = "ai_plan_architect_draft_v1";

export function draftStorageKey(scope: DraftScope): string {
  return [scope.sessionId || "", scope.conversationId || "", scope.name]
    .map((part) => encodeURIComponent(part))
    .join(":");
}

function storageAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function keyFor(scope: DraftScope): string {
  return `${DRAFT_STORAGE_PREFIX}:${draftStorageKey(scope)}`;
}

export function loadDraft<T>(scope: DraftScope, fallback: T): T {
  if (!storageAvailable()) return fallback;

  try {
    const raw = window.localStorage.getItem(keyFor(scope));
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function saveDraft<T>(scope: DraftScope, value: T): void {
  if (!storageAvailable()) return;

  try {
    window.localStorage.setItem(keyFor(scope), JSON.stringify(value));
  } catch {
    // Draft persistence is best effort. Quota/private mode failures must not
    // interrupt typing or generation.
  }
}

export function clearDraft(scope: DraftScope): void {
  if (!storageAvailable()) return;

  try {
    window.localStorage.removeItem(keyFor(scope));
  } catch {
    // See saveDraft: local storage availability must not affect the UI.
  }
}

/**
 * React state backed by localStorage. The setter writes synchronously so a
 * route/layout change immediately after typing cannot lose the latest value.
 */
export function useDraft<T>(
  scope: DraftScope,
  fallback: T,
): [T, Dispatch<SetStateAction<T>>, (resetTo?: T) => void] {
  const storageKey = draftStorageKey(scope);
  const fallbackRef = useRef(fallback);
  const [value, setValue] = useState<T>(() => loadDraft(scope, fallback));
  const valueRef = useRef(value);
  const activeKeyRef = useRef(storageKey);

  useEffect(() => {
    if (activeKeyRef.current === storageKey) return;
    activeKeyRef.current = storageKey;
    fallbackRef.current = fallback;
    const restored = loadDraft(scope, fallback);
    valueRef.current = restored;
    setValue(restored);
  }, [fallback, scope, storageKey]);

  const update = useCallback<Dispatch<SetStateAction<T>>>((next) => {
    const nextValue = typeof next === "function"
      ? (next as (previous: T) => T)(valueRef.current)
      : next;
    valueRef.current = nextValue;
    setValue(nextValue);
    saveDraft(scope, nextValue);
  }, [scope, storageKey]);

  const clear = useCallback((resetTo?: T) => {
    clearDraft(scope);
    if (resetTo === undefined) return;
    valueRef.current = resetTo;
    setValue(resetTo);
  }, [scope, storageKey]);

  return [value, update, clear];
}
