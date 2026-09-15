# V2-0 runtime compatibility

This document records the V2-0 discovery contract. Discovery is local to the
backend host and metadata-only: it resolves a configured/PATH executable,
reads its version, and asks an official metadata interface for model data. It
never sends a model prompt, opens a tool session, or returns stdout/stderr to a
browser.

## Observed installation

The following checks were run on 15 September 2026:

| Runtime | Installed command | Version observed | Discovery interface | Current result |
| --- | --- | --- | --- | --- |
| Codex | `codex` (`/usr/lib/chatgpt/resources/codex`) | `0.154.0-alpha.6.2` | `codex app-server --stdio`; JSON-RPC `model/list` and `config/read` | Version is detectable; model/auth result depends on the local app-server session |
| Claude Code | `claude` (`/home/ai/.local/bin/claude`) | `2.1.263` | Claude Agent SDK TypeScript `Query.supportedModels()` | Ready; metadata-only discovery returned the current model catalog and native effort levels |
| Antigravity | `agy` | — | `agy models` | Not found on PATH |
| Antigravity desktop | `antigravity` | No version returned; process exits with a desktop sandbox error | Not an AGY CLI contract | Reported as `unsupported_version`; it is not treated as a ready AGY runtime |

Version checks use `--version` with a five-second timeout. The command runner
uses `spawn` with `shell: false`, ignores stdin, caps metadata output, and kills
timed-out processes. A configured binary path can be supplied per runtime and
takes precedence over PATH when it resolves.

## Normalized contract

`server/runtimes/types.ts` defines the stable server contract:

- `RuntimeDetection.status`: `ready`, `needs_login`, `not_installed`,
  `unsupported_version`, or `error`.
- `RuntimeModel` keeps `connectionId` and the native `modelId` together. Model
  IDs are never deduplicated across connections.
- `effortOptions` is empty when the provider did not report effort metadata.
  The detector never infers low/medium/high from a model name or suffix.
- `defaultModel`, `defaultEffort`, and `defaultSource` remain explicit
  `null`/`unknown` when configuration cannot be read. A runtime default is
  kept separate from an Architech override for later run resolution.
- Capability fields are `supported`, `unsupported`, or `unknown`. Discovery
  only changes `unknown` when the provider metadata explicitly reports a
  capability.
- Catalog entries expire after the initial 15-minute TTL. The current slice
  returns the expiry so a later store can cache and refresh stale entries.

## Capability matrix

The matrix separates the interface named by official documentation from what
this phase has verified without a billable prompt.

| Capability | Codex app-server | Claude Agent SDK | AGY CLI |
| --- | --- | --- | --- |
| Version probe | verified (`--version`) | verified (`--version`) | pending (`agy` absent) |
| Model catalog | protocol parser + metadata request | verified through pinned SDK `0.3.272` without a user prompt | `agy models` parser; CLI pending |
| Effort options | parsed only when `supportedReasoningEfforts` is reported | parsed only when SDK reports options | parsed only when `agy models` reports options |
| Runtime default | `config/read` parser | SDK/default resolver pending | CLI metadata/default resolver pending |
| Streaming events | fixture-verified normalized adapter | fixture-verified normalized adapter | fixture-verified JSONL adapter |
| Tool execution | owned by app-server; live test pending | owned by Agent SDK; live test pending | owned by AGY; live test pending |
| Approval/permission | request translated; current route declines safely | callback translated; current route declines safely | headless soft denial maps the run to failed |
| Resume | fixture-verified thread resume | fixture-verified session resume | fixture-verified conversation resume |
| Interrupt | fixture-verified RPC interrupt | fixture-verified SDK interrupt | fixture-verified process interrupt |
| Usage/quota | unknown; metadata probe does not test quota | unknown; metadata probe does not test quota | unknown; metadata probe does not test quota |

`listed` means a provider metadata call returned a model. It does not imply
quota, entitlement, or that a later run will succeed. `verified` is reserved
for a later explicit run/test result.

## Authentication and safety gaps

- A successful binary version command is not authentication evidence. Codex
  and AGY metadata errors may map to `needs_login`; Claude remains `unknown`
  until the SDK reports auth state.
- The repository pins Claude Agent SDK `0.3.272` through the lockfile. Discovery
  initializes its control channel with an empty streaming input, calls
  `supportedModels()`, and closes it without yielding a model prompt. It does
  not read or copy session tokens, keychains, or config secrets.
- AGY and the Antigravity desktop executable are different interfaces. The
  desktop binary is not used as evidence that AGY CLI is installed.
- Metadata errors are stable codes such as `AUTH_REQUIRED`,
  `MODEL_CATALOG_EMPTY`, and `METADATA_TIMEOUT`; raw diagnostics are kept out
  of normalized results and the browser route.
- The run route enforces a trusted workspace root and one active writer per
  workspace. Provider lifecycle tests use fixtures; a live permission smoke
  test still requires an explicit quota-consuming run.

## Official references

- [Codex App Server](https://learn.chatgpt.com/docs/app-server)
- [Claude Agent SDK for TypeScript](https://code.claude.com/docs/en/agent-sdk/typescript)
- [Claude model configuration](https://code.claude.com/docs/en/model-config)
- [Antigravity headless CLI](https://www.antigravity.google/docs/cli/headless/)
- [Antigravity CLI installation/authentication](https://www.antigravity.google/docs/cli/install/)
- [Antigravity SDK](https://www.antigravity.google/docs/sdk/overview)
