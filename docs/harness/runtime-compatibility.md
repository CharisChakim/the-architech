# V2-0 runtime compatibility

This document records the V2-0 discovery contract. Discovery is local to the
backend host and metadata-only: it resolves a configured/PATH executable,
reads its version, and asks an official metadata interface for model data. It
never sends a model prompt, opens a tool session, or returns stdout/stderr to a
browser.

## Observed installation

The following checks were re-run on 22 September 2026, after the AGY CLI was
installed. All three runtimes now reach `ready` with a populated catalog.

| Runtime | Installed command | Version observed | Discovery interface | Current result |
| --- | --- | --- | --- | --- |
| Codex | `codex` (`@openai/codex` via npm) | `0.155.1` | `codex app-server --stdio`; JSON-RPC `model/list` and `config/read` | Ready; 5 models |
| Claude Code | `claude` (`/home/ai/.local/share/claude/versions/2.1.276`) | `2.1.276` | Claude Agent SDK TypeScript `Query.supportedModels()` | Ready; 5 models with native effort levels |
| Antigravity | `agy` (`/home/ai/.local/bin/agy`) | `1.2.8` (`1.2.9` read on 23 Sep) | `agy models` | Ready; 14 models |
| Antigravity desktop | `antigravity` | No version returned; process exits with a desktop sandbox error | Not an AGY CLI contract | Deliberately not matched as an AGY runtime |

Two findings from that run shape the adapter, and both are now covered by tests:

- `agy models` prints `<id>\t<label>` — a **single tab**, not aligned columns.
  The earlier table reader only accepted two or more spaces or a pipe, so every
  row was dropped and the catalog came back empty while the binary and version
  read fine.
- `agy models` queries a service rather than reading local metadata. It measured
  2.6-4.6s on a healthy connection, against the 5s budget that suits the two
  runtimes reading files on disk, so Antigravity gets its own larger budget.
  A slow network still surfaces as `METADATA_TIMEOUT` rather than a wrong answer.

Version checks use `--version` with a five-second timeout. The command runner
uses `spawn` with `shell: false`, ignores stdin, caps metadata output, and kills
timed-out processes. A configured binary path can be supplied per runtime and
takes precedence over PATH when it resolves.

Neither runtime reports an auth status this discovery slice can read, so `Auth`
stays `unknown` for all three. A populated catalog is the practical signal that
a login is still valid.

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
- Catalog entries expire after the initial 15-minute TTL. When a refresh
  fails for a transient reason (`METADATA_TIMEOUT`, `METADATA_ERROR`,
  `PROCESS_ERROR`) and the runtime version is unchanged, the server keeps the
  last good catalog, marks it `stale`, and the UI shows it as "Cached" with
  the time it was read. A login problem, an empty list or a new version
  replaces it. The kept catalog lives in server memory only.
- No runtime reports which account it is signed in to, and `connectionId` is
  a fixed `runtime:<id>`. A switch of account is therefore only noticed on the
  next discovery (TTL or Refresh); each run repeats discovery for its own
  workspace, so a run never relies on the cached catalog.
- When a runtime does not report its default model, the picker shows "Use
  runtime default" rather than the first listed model, and offers no effort
  options until a model is chosen.

## Capability matrix

The matrix separates the interface named by official documentation from what
this phase has verified without a billable prompt.

| Capability | Codex app-server | Claude Agent SDK | AGY CLI |
| --- | --- | --- | --- |
| Version probe | verified (`--version`) | verified (`--version`) | verified (`--version`, 22 Sep) |
| Model catalog | verified (`model/list`, 5 models) | verified through pinned SDK `0.3.272` without a user prompt | verified (`agy models`, 14 models) |
| Effort options | parsed only when `supportedReasoningEfforts` is reported | parsed only when SDK reports options | parsed only when `agy models` reports options |
| Runtime default | `config/read` parser | SDK/default resolver pending | CLI metadata/default resolver pending |
| Streaming events | fixture-verified normalized adapter | fixture-verified normalized adapter | fixture-verified JSONL adapter |
| Tool execution | owned by app-server; event mapping fixture-verified, live test pending | owned by Agent SDK; event mapping fixture-verified, live test pending | owned by AGY; event mapping fixture-verified, live test pending |
| Approval/permission | request shown in chat; approve/decline, five-minute expiry | callback shown in chat; approve/decline, five-minute expiry | no interactive approval in headless mode; a soft denial fails the run |
| Resume | fixture-verified thread resume | fixture-verified session resume | fixture-verified conversation resume |
| Interrupt | fixture-verified RPC interrupt | fixture-verified SDK interrupt | fixture-verified process interrupt |
| Usage/quota | provider's message passed on at run time; not tested live | mapped to an actionable message at run time; not tested live | failure classified from the result or stderr; not tested live |

`listed` means a provider metadata call returned a model. It does not imply
quota, entitlement, or that a later run will succeed. `verified` is reserved
for a later explicit run/test result.

## Run-time event mapping

Added during V2-7. Each runtime reports a tool call, its progress and its
outcome differently; the runner and the chat route turn them into one start
and one result per tool, and a failed run into a visible reason. All of this
is covered by fixture tests (`server/runtimes/execution/codex.test.ts`,
`server/runtime-runner/streams.test.ts`, `server/routes/runtime-agent.test.ts`),
built from each provider's documented shapes. **None of it has been confirmed
against a live provider yet.**

| Concern | Codex app-server | Claude Agent SDK | AGY CLI |
| --- | --- | --- | --- |
| Tool start | `item/started` | the complete `assistant` message's `tool_use` block; streamed `content_block_start` and `input_json_delta` are ignored | `step_update` with state `ACTIVE` |
| Tool result | `item/completed`, carrying `command` and `exitCode` | `tool_result` blocks inside the next `user` message; name and input are taken from the start | `step_update` with state `DONE`; input, and the command from `CommandLine`, taken from the start |
| Repeated updates | `*/outputDelta` per output chunk; shown once | `tool_progress`; reported as progress, not shown | a repeated `ACTIVE` step; shown once |
| Session/step progress | not emitted | `system`, `rate_limit_event`, `hook_response`, `task_started`: not shown, not evidence | step updates without a tool: not shown, not evidence |
| Stream cut off | app-server exit ends the turn with `PROCESS_EXITED` | a stream with no result ends with `CLAUDE_RESULT_MISSING` | exit without a result: `AGY_PROCESS_EXITED`, or `AGY_RESULT_MISSING` on exit code 0 |
| Malformed line | non-fatal error; the turn continues | non-fatal `MALFORMED_EVENT`; the turn continues | fails closed: the CLI is stopped and the run fails with `AGY_PROTOCOL_ERROR` |
| Failed run | the provider's message on `turn/completed` | `assistant.error`, `api_error_status`, `error_*` subtype or `errors[]` mapped to `CLAUDE_AUTH_REQUIRED`, `CLAUDE_RATE_LIMITED`, `CLAUDE_BILLING`, …; a `success` result with `is_error` is a failure | `AGY_AUTH_REQUIRED`, `AGY_PERMISSION_DENIED`, … from the result or stderr |

The chat route shows a failed run's reason as an error and ends the turn as
"Turn failed", whichever runtime it came from.

Known gaps:

- Claude's Bash result carries no exit code, so its command evidence has
  `exitCode` empty.
- AGY failure messages name the problem but not the fix ("Antigravity CLI
  authentication is required." does not say which command signs in).
- Server error messages are English only.

## Live smoke checklist

A smoke run per runtime costs quota and needs someone watching it. Use a
disposable workspace and one small prompt that runs one shell command (for
example `pwd`) and edits one file. Each item below is an assumption the
fixture tests rely on; record what was observed next to it.

Codex:

- [ ] Command output arrives as `item/commandExecution/outputDelta` and the
  command finishes as `item/completed` with `command` and `exitCode`.
- [ ] The chat shows one card per command, finished, with the exit code in the
  task's evidence.
- [ ] Approve and decline from the chat reach the app-server; a decline leaves
  the run failed, not done.
- [ ] A spent quota or signed-out account ends the run with a readable reason.

Claude Code:

- [ ] Tool results arrive as `tool_result` blocks inside `user` messages, and
  the chat shows one card per tool call, finished.
- [ ] Task evidence records the Bash command.
- [ ] Signed out (or an invalid key), the run fails with `CLAUDE_AUTH_REQUIRED`
  rather than completing, and no "Invalid API key" text appears as a reply.
- [ ] Approve and decline reach the SDK's `canUseTool` callback.

Antigravity:

- [ ] A tool step's command is in `tool_info.parameters.CommandLine`, and the
  task's evidence records it.
- [ ] A repeated `ACTIVE` update for one step shows one card.
- [ ] A soft permission denial ends the run failed with
  `AGY_PERMISSION_DENIED`.
- [ ] Signed out, the run fails with `AGY_AUTH_REQUIRED`.

All runtimes:

- [ ] Stop in the chat interrupts the provider turn and the run ends as
  interrupted.
- [ ] Sending again in the same chat resumes the provider session.

## Authentication and safety gaps

- A successful binary version command is not authentication evidence. Codex
  and AGY metadata errors may map to `needs_login`; Claude remains `unknown`
  until the SDK reports auth state. At run time an expired Claude login is
  reported as `CLAUDE_AUTH_REQUIRED` with the steps to sign in again (see
  below); the connection card itself does not change.
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
