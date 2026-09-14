# The Architech

Turns a rough idea into a plan, a PRD, and a board of tasks an AI coding agent can run — and comes with its own agent that can edit that project, and your files, on request.

## What it does

1. **Plan** — you describe an idea, the model asks clarifying questions until it stops guessing, then drafts the architecture, a Mermaid diagram, a roadmap, and an estimate.
2. **PRD** — the plan becomes a seven-point requirements document, with extra sections when the project needs them.
3. **Send to Agent** — the PRD is split into atomic tasks with target files, dependencies, a prompt and verification steps, on a kanban board. Download `AGENTS.md` to hand to Cursor, Claude Code, or Codex.

Alongside those, an **agent** panel runs a real tool loop: it asks for tools, the app executes them, feeds the results back, and asks again until it is done. It can read and edit the project itself, and — once you point it at a folder — read, write and run things there.

## Requirements

- **Node 22.5 or newer.** Storage uses the built-in `node:sqlite`, so there is no database to install. Developed and tested on Node 25.
- A model endpoint. See below — there is no bundled model.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. Projects are stored in `data/architech.db`, which is created on first run and is not committed.

## Connecting a model

Nothing works until a model is reachable. Open **LLM settings** in the sidebar and pick one:

| Provider | Base URL | Notes |
|---|---|---|
| Gemini | — | Needs `GEMINI_API_KEY` in the server environment, or paste a key in the dialog |
| Ollama | `http://localhost:11434` | Local models; the app falls back to its OpenAI-compatible route |
| Custom | your endpoint | Anything OpenAI-compatible. `/v1` in the URL is fine either way |

**The agent has a stricter requirement than the rest of the app.** The three generation steps speak the OpenAI format, but the agent needs the **Anthropic Messages format** (`/v1/messages`), because that is what returns `tool_use` blocks for the app to execute. A CLI cannot stand in here: `claude -p` and `codex exec` run their own loop and hand back only final text.

So the agent needs one of:

- The Anthropic API directly (`https://api.anthropic.com`, with an API key)
- A local router that serves the Anthropic format — this is how you use a Claude Code, Codex, or Antigravity subscription instead of paying per token

The agent reuses the base URL, key and model from LLM settings. If your endpoint serves both formats on the same base URL, one setting covers everything.

Credentials are read in this order: the key in LLM settings, then `ANTHROPIC_AUTH_TOKEN`, then `ANTHROPIC_API_KEY` from the server environment.

## Using the agent

Open **Agent** in the top bar. Out of the box it can read the project, replace the feature list, and move cards on the board. Changes land in the database immediately, so the canvas and the board update behind the panel.

The project has to be saved first — untitled drafts are deliberately kept out of storage, and the agent will say so rather than guess.

### Files and commands

Type a path into **Working folder** and the agent gains `list_files`, `read_file` and `write_file`, scoped to that folder. There is no default: leave it empty and those tools are not offered at all.

Tick **Allow shell commands** — only available once a folder is set — and it gains `run_command`, which runs with that folder as the working directory.

**Every command is shown to you and waits for approval before it runs.** You approve or refuse each one; refusing tells the model the command did not run, so it can suggest something else. An unanswered request is refused after five minutes.

### What the boundaries actually are

- Paths are resolved to their real location and checked against the real folder, so `../`, an absolute path, and a symlink pointing out of the folder are all refused.
- Running commands is a separate permission from reading and writing files, and is off by default.
- Permissions are read from the saved project, never from the request, so a client cannot widen its own access.
- **There is no denylist of dangerous commands.** Pattern-matching shell strings does not hold up, and shipping one would imply a protection that is not there. If you enable the shell and approve a command, it runs.
- `write_file` replaces a whole file rather than patching part of it.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite plus the API on port 3000, restarting on server changes |
| `npm run build` | Bundles the client and the server into `dist/` |
| `npm start` | Runs the built server |
| `npm run lint` | `tsc --noEmit` |

## Environment variables

All optional — everything can be set in the UI instead.

| Variable | Used for |
|---|---|
| `GEMINI_API_KEY` | Gemini provider, when no key is given in LLM settings |
| `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_API_KEY` | Agent, when no key is given in LLM settings |
