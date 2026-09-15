import React, { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, CircleAlert, Search, Settings2 } from "lucide-react";
import { useT } from "../../lib/i18n";
import type { AgentRole, Connection, RoleBinding } from "../../types";

export interface ModelSwitcherProps {
  connections: readonly Connection[];
  roleBindings: Partial<Record<AgentRole, RoleBinding>>;
  onSelectModel: (role: AgentRole, connectionId: string, model: string) => void | Promise<void>;
  activeRole?: AgentRole;
  onRoleChange?: (role: AgentRole) => void;
  onOpenConnections?: () => void;
  mcpCount?: number;
  onOpenMcp?: () => void;
  disabled?: boolean;
  className?: string;
}

const roles: { id: AgentRole; label: string }[] = [
  { id: "agent", label: "Agent" },
  { id: "plan", label: "Plan" },
  { id: "prd", label: "PRD" },
  { id: "tasks", label: "Tasks" },
];

const connectionStatus = (connection: Connection): {
  dot: string;
  label: string;
} => {
  if (!connection.lastCheck) return { dot: "bg-faint", label: "not checked" };
  if (!connection.lastCheck.ok) return { dot: "bg-danger", label: "connection failed" };
  if (connection.lastCheck.toolsSupported === false) return { dot: "bg-warn", label: "tools unavailable" };
  return { dot: "bg-ok", label: "connected" };
};

export const ModelSwitcher: React.FC<ModelSwitcherProps> = ({
  connections,
  roleBindings,
  onSelectModel,
  activeRole,
  onRoleChange,
  onOpenConnections,
  mcpCount,
  onOpenMcp,
  disabled = false,
  className = "",
}) => {
  const { t } = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [localRole, setLocalRole] = useState<AgentRole>("agent");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selecting, setSelecting] = useState<string | null>(null);
  const [selectionError, setSelectionError] = useState<string | null>(null);

  const selectedRole = activeRole ?? localRole;
  const enabledConnections = useMemo(
    () => connections.filter((connection) => connection.enabled),
    [connections]
  );
  const activeBinding = roleBindings[selectedRole];
  const activeConnection = activeBinding
    ? enabledConnections.find((connection) => connection.id === activeBinding.connectionId)
    : enabledConnections[0];
  const triggerLabel = activeConnection && activeBinding
    ? `${activeConnection.name} · ${activeBinding.model}`
    : activeConnection?.models[0]
      ? `${activeConnection.name} · ${activeConnection.models[0]}`
      : t("Choose a model");

  const filteredConnections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return enabledConnections.map((connection) => ({
      connection,
      models: connection.models.filter((model) => !needle || model.toLowerCase().includes(needle)),
    }));
  }, [enabledConnections, query]);

  useEffect(() => {
    if (!open) return;

    setExpanded((previous) => {
      const next = new Set(previous);
      for (const connection of enabledConnections) next.add(connection.id);
      for (const id of next) {
        if (!enabledConnections.some((connection) => connection.id === id)) next.delete(id);
      }
      return next;
    });

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [enabledConnections, open]);

  const chooseRole = (role: AgentRole) => {
    setLocalRole(role);
    setSelectionError(null);
    onRoleChange?.(role);
  };

  const chooseModel = async (connectionId: string, model: string) => {
    if (selecting) return;
    setSelectionError(null);
    setSelecting(`${connectionId}:${model}`);
    try {
      await onSelectModel(selectedRole, connectionId, model);
      setOpen(false);
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : t("Could not switch model."));
    } finally {
      setSelecting(null);
    }
  };

  return (
    <div ref={rootRef} className={`relative min-w-0 ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="model-switcher-popover"
        title={t("Switch model")}
        onClick={() => {
          setSelectionError(null);
          setOpen((value) => !value);
        }}
        className="inline-flex max-w-56 items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-muted transition-colors hover:bg-subtle hover:text-ink disabled:opacity-40"
      >
        <span
          className={`h-2 w-2 shrink-0 rounded-full ${activeConnection ? connectionStatus(activeConnection).dot : "bg-faint"}`}
          aria-hidden
        />
        <span className="truncate">{triggerLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {open && (
        <div
          id="model-switcher-popover"
          role="dialog"
          aria-label={t("Switch model")}
          className="absolute right-0 top-full z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
        >
          <div className="border-b border-line p-2.5">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-ink">{t("Role")}</span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md px-1.5 py-0.5 text-xs text-faint hover:bg-subtle hover:text-ink"
              >
                {t("Close")}
              </button>
            </div>
            <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label={t("Role")}>
              {roles.map((role) => (
                <button
                  key={role.id}
                  type="button"
                  role="tab"
                  aria-selected={selectedRole === role.id}
                  onClick={() => chooseRole(role.id)}
                  className={`shrink-0 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    selectedRole === role.id ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-subtle hover:text-ink"
                  }`}
                >
                  {t(role.label)}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-line p-2.5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-faint" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("Search models")}
                aria-label={t("Search models")}
                autoFocus
                className="field py-1.5 pl-8 text-xs"
              />
            </label>
          </div>

          <div className="max-h-72 overflow-y-auto p-2">
            {filteredConnections.length === 0 ? (
              <div className="px-2 py-5 text-center text-xs text-muted">
                <CircleAlert className="mx-auto mb-1.5 h-4 w-4 text-faint" aria-hidden />
                {t("No enabled connections")}
              </div>
            ) : (
              filteredConnections.map(({ connection, models }) => {
                const isExpanded = expanded.has(connection.id);
                const status = connectionStatus(connection);
                return (
                  <section key={connection.id} className="overflow-hidden rounded-lg">
                    <button
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() => setExpanded((previous) => {
                        const next = new Set(previous);
                        if (next.has(connection.id)) next.delete(connection.id);
                        else next.add(connection.id);
                        return next;
                      })}
                      className="flex w-full items-center gap-2 px-2 py-2 text-left hover:bg-subtle"
                    >
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-faint" aria-hidden /> : <ChevronRight className="h-3.5 w-3.5 text-faint" aria-hidden />}
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} title={status.label} aria-label={status.label} />
                      <span className="min-w-0 flex-1 truncate text-xs font-medium text-ink">{connection.name}</span>
                      <span className="shrink-0 text-[10px] text-faint">{models.length}</span>
                    </button>

                    {isExpanded && (
                      <div className="pb-1 pl-7 pr-1">
                        {models.length === 0 ? (
                          <p className="px-2 py-2 text-[11px] text-faint">{t("No models found")}</p>
                        ) : (
                          models.map((model) => {
                            const isSelected = activeBinding?.connectionId === connection.id && activeBinding.model === model;
                            const isSelecting = selecting === `${connection.id}:${model}`;
                            return (
                              <button
                                key={model}
                                type="button"
                                disabled={Boolean(selecting)}
                                onClick={() => void chooseModel(connection.id, model)}
                                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors disabled:opacity-50 ${
                                  isSelected ? "bg-accent-soft text-accent-ink" : "text-muted hover:bg-subtle hover:text-ink"
                                }`}
                              >
                                <span className="min-w-0 flex-1 truncate font-mono">{model}</span>
                                {isSelecting ? <span className="text-[10px] text-faint">{t("Saving...")}</span> : isSelected ? <Check className="h-3.5 w-3.5 shrink-0" aria-hidden /> : null}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </section>
                );
              })
            )}
          </div>

          {selectionError && (
            <p className="border-t border-danger/30 bg-danger-soft px-3 py-2 text-[11px] text-danger-ink" role="alert">
              {selectionError}
            </p>
          )}

          <div className="flex items-center gap-1 border-t border-line p-2">
            <button
              type="button"
              disabled={!onOpenConnections}
              onClick={() => {
                setOpen(false);
                onOpenConnections?.();
              }}
              className="inline-flex min-w-0 flex-1 items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-muted hover:bg-subtle hover:text-ink disabled:opacity-40"
            >
              <Settings2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{t("Manage connections...")}</span>
            </button>
            {mcpCount !== undefined && (
              <button
                type="button"
                disabled={!onOpenMcp}
                onClick={() => {
                  setOpen(false);
                  onOpenMcp?.();
                }}
                className="shrink-0 rounded-md px-2 py-1.5 text-[11px] text-muted hover:bg-subtle hover:text-ink disabled:opacity-40"
              >
                {t("MCP servers ({count})", { count: mcpCount })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ModelSwitcher;
