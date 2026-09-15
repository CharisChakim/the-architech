# The Architech

Turns a rough idea into a plan, a PRD, and a task board an AI coding agent can run. It also includes an agent panel that can update the project and, when given a folder, work with its files.

## What it does

1. **Plan** — describe an idea; the model asks clarifying questions, then drafts architecture, a Mermaid diagram, a roadmap, and an estimate.
2. **PRD** — turn the plan into a seven-point requirements document, with extra sections when needed.
3. **Send to Agent** — split the PRD into atomic tasks with target files, dependencies, prompts, verification steps, and task states. Download `AGENTS.md` for another coding agent.

The **Agent** panel runs a tool loop: it requests tools, the app executes them, returns results, and continues until the turn is complete.

## Requirements

- **Node.js 22.14 or newer. Node 24 is recommended.** The app uses built-in `node:sqlite`, `fs.promises.glob`, and `AbortSignal.any`.
- A reachable model endpoint. No model is bundled.

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000. Projects are stored in `data/architech.db`, created on first run, and not committed.

## Connections and roles

Open **Connections** and add a connection by preset or manually. Each connection has a name, wire format (`Anthropic Messages` or `OpenAI compatible`), base URL, model list, optional API key, optional API-key environment variable, and enabled/JSON-mode flags.

Bind a connection and model to each workflow role:

| Role | Used for |
|---|---|
| `agent` | Agent chat and tool execution |
| `plan` | Follow-up questions and project-plan generation |
| `prd` | PRD generation |
| `tasks` | Task-board generation |

Role bindings let each workflow use a different model. Agent chat resolves the `agent` role; generation routes resolve their matching role. Legacy `llmConfig` requests remain accepted for compatibility.

Saved API keys are held server-side in `data/architech.db`; protect that file and its backups. To keep a key out of the database, set an environment variable and enter its exact name in **API key environment variable**. The server uses that environment value for the connection.

## Agent tools

Always available:

- Project: `get_project`, `update_features`, `set_task_status`
- Planning: `get_plan`, `get_prd`, `get_tasks`, `ask_followups`, `generate_plan`, `generate_prd`, `generate_tasks`

After **Working folder** is set, file tools become available: `list_files`, `read_file`, `read_files`, `glob`, `grep`, `write_file`, and `edit_file`. Enable **Allow shell commands** to add `run_command`.

File paths are resolved inside the configured folder, including symlink checks. File writes and shell commands require approval. There is no shell-command denylist; an approved command runs with the configured folder as its working directory.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite plus the API on port 3000, restarting on server changes |
| `npm run build` | Bundles the client and server into `dist/` |
| `npm start` | Runs the built server |
| `npm run lint` | Runs `tsc --noEmit` |

## Environment variables

The normal saved-connection flow does not require one fixed provider environment variable. Use the connection editor's **API key environment variable** field to select the variable the server should read.

| Variable | Use |
|---|---|
| `OPENAI_API_KEY` | Common example for an OpenAI-compatible connection, when selected in that connection |
| `OPENROUTER_API_KEY` | Common example for an OpenRouter connection, when selected in that connection |
| `ANTHROPIC_API_KEY` | Common example for an Anthropic-format connection, when selected in that connection |
| `GEMINI_API_KEY` | Legacy Gemini configuration fallback, or a saved connection when selected in the connection editor |
| `ANTHROPIC_AUTH_TOKEN` | Legacy compatibility fallback only; not the primary connection path |
