# Harnesys — Product Capabilities (verified against codebase, v0.7.0)

Single source of truth for landing / marketing copy. Every claim below is backed by code in this repo. Version: 0.7.0.

## What it is

Harnesys is a **self-hosted fleet control plane for AI agents**: one host (relay) runs the API + web UI, worker machines enroll into it, and agents get threads, tools, skills, knowledge, approvals, schedules, and webhooks — observable in real time from a desktop app or browser.

Deployment forms:
- **Desktop app** (macOS Apple Silicon / Intel, Windows x64 / ARM64, Linux AppImage + deb): Tauri v2 shell bundling the WebUI and the host API as a sidecar on `127.0.0.1:47474`. Tray, auto-updater (minisign-signed `latest.json`).
- **Server + Web UI** (Docker or bare binary): `harnesys-host` + `harnesys-web`, compose file included.
- **CLI** (`harnesys`, single static binary): login, owner init, fleet pairing (`invite / enroll / retarget / promote`), `doctor` diagnostics.

## Architecture facts

- Monorepo on **Bun**: `apps/server` (Hono + Brix DI + Drizzle/SQLite + Zod + Pino + Croner), `apps/webui` (Vite 8, React 19 + React Compiler, Tailwind 4, TanStack Query, Monaco, xterm), `apps/cli`, `apps/desktop`; packages `brix` (Nest-style DI framework), `contracts` (Zod REST contracts), `harnesys` (agent engine), `studio-shared`.
- Per-org SQLite database (`org.db`), master key secret store, all data under `~/.harnesys`.
- 77 REST controller groups under `/api`; auth = `Bearer` token + `X-Org-Id`; typed error contract `{statusCode, errorCode, message, path, timestamp, traceId?}`.
- **Realtime is push-only**: SSE for run events / watches / LSP diagnostics, WebSockets for fleet workers and terminals. Zero polling.
- 1536 unit tests, biome clean, tsc strict across workspaces.

## The agent engine (packages/harnesys)

- Run engine with **planning** (`plan_save / plan_get / plan_item_update` — agents maintain a visible plan), **step budgets** with incremental accounting, **transcript compaction** (summarization + file-log of evicted content), tool-output folding/clipping.
- **Multi-agent graphs**: `agents_spawn` (delegates), `agents_create_subagent`, `agents_handoff` (pass a thread to another agent), graph nodes include map (fan-out), wait, merge, handoff — real orchestration, not just "one chat".
- **Agent hooks** (lifecycle hooks with gating), execution profiles, agent identity/target resolution.
- **HITL approvals**: tools can require confirmation — the UI shows "Run this command?" with Deny / Allow once / Allow this run / Always allow (visible in run transcript with full input/output per tool call).

## Tool packs (what agents can actually do)

Verified tool names from `packages/harnesys/src/packs`:

- **Core/files**: `read_file, write_file, edit_file, glob, grep, map, list_dir, extract_file_text, file_read_image, wait, process_poll, process_kill, write_docx, source_list`.
- **Shell**: terminal commands with approval gating and background `process_poll`.
- **Web**: `web_search` (pluggable search providers), `fetch`, `browser_fetch`, and a full managed **browser** (`browser` + `browser_close`) running its own engine sidecar with versioned downloads — real headless browsing, not just HTTP fetch.
- **GitHub**: issues (list/get/create/comment/close/labels), PRs (list/get/diff/create/update/review/merge), code search, repos list, file contents, CI workflow runs + rerun, recent events.
- **Google**: Gmail (`search/read thread/message/send/download attachment`), Calendar (`list/create/update/delete events`), Drive sources.
- **Issues/boards** (native tracker): `issue_create/list/get/update/move/comment/nudge/dependency/attachment_add`, `board_create/update/delete`, `board_rule_save/delete`, labels — agents manage their own work boards.
- **Knowledge/memory**: `knowledge_search / knowledge_read` (RAG), `memory_write/update/delete/list`, `recall_search`, `pin_set/list/remove`. Three memory kinds: **episodic** (event log), **semantic** (facts, with promotion pipeline episodic→semantic), **pins** (pinned facts). Memory crawler + relevance scoring.
- **Agents**: spawn/handoff/lifecycle (above).
- **Manager**: `manager_pulse` — a supervisor role that checks on other agents.
- **MCP**: `mcp_connect/list/check/toggle/remove` — agents can attach Model Context Protocol servers themselves.
- **LSP**: `lsp_diagnostics/hover/definition/references` — code intelligence inside runs.
- **Skills**: `search_skills / install_skill / create_skill` — agents discover, install, and author their own skills.
- **Scheduler**: `schedule_set/list/delete/pause/peek` — agents schedule their own future work.
- **Webhooks**: `webhook_set/list/delete` — agents subscribe to external events.
- **Threads**: `thread_list/tail` — read other conversations.
- **Image**: `image_generate` (model-backed image generation).

## Model providers

Built-in model discovery/adapters for ~20 providers: OpenAI, Anthropic, Google, OpenRouter, Groq, Cerebras, Mistral, xAI, Ollama (local), Qwen, Moonshot/Kimi, MiniMax, Z.ai, Together, NVIDIA, Alibaba, Xiaomi, plus any OpenAI-compatible endpoint. Per-org model catalog, custom bindings, image and speech model endpoints.

## Safety & control (HITL, modes, permissions)

- **Mode presets**: org-wide or per-agent operating modes with **permission gates** on five operation classes — `fs.write`, `process`, `network`, `mcp`, `agents` — each set to `allow / ask / deny`. Modes also control tool exposure (`direct/deferred`), disabled tools, packs, skills, and extra instructions.
- **File access rules** (`file-rules`): filesystem policies for agent access.
- **Approvals**: per-call confirmations in the UI (screenshot-verified flow).
- **Audit log**, **usage reporting** (per-run token/cost accounting, `usage_report` tool), **vault** (org secret store, master-key encrypted), **fleet secrets**.

## Organization & fleet

- Orgs, members, teams, owner init; **fleet relay/worker pairing**: invite code → `host enroll` → worker identity; relay **retarget** and **promote** (live relay-role transfer between nodes); `host doctor` diagnostics.
- Worker hosts sync org operations (`worker-org-operation` contracts) and connect via WebSocket; machine membership tracked in `machine.json`.
- **Sources**: git repositories (browse, worktrees, VCS operations, git-attached thread bodies) and Google Drive; content materialization for agents.
- **Connectors/integrations**: GitHub + Google with token registry and event forwarding.

## Automations (the "it works while you sleep" story)

- **Cron schedules** (`schedule_*` + server Croner): prompt-driven scheduled runs.
- **Board rules**: `has_label` conditions dispatch work — e.g. label `landing → Pixel`, `qa → Vega` (verified in screenshot: label-to-agent assignment, column flows Backlog → Todo → In Progress → In Review → Done, `issue_nudge`).
- **Webhooks**: inbound external events trigger runs.
- **Inbox**: notification/assignment feed (`inbox-bell`, manage-inbox).

## Work UI (what the user sees)

- **Desk**: multi-tab workspace — chats, per-project IDE (Monaco + xterm terminals + git panel + LSP), inbox, issues board, files, agents, settings. Tabbed threads with live run status.
- **Run transcript**: every tool call with input/output, thoughts, token counts, approval prompts, stop/restart controls.
- **Issues**: boards, columns, labels, dependencies, attachments, comments, rules.
- **Knowledge**: indexed roots, RAG search (FTS + embeddings + chunking), per-org knowledge.
- **Manage screens**: agents (+ memory per agent), models, mode presets, skills (org/project), MCP (org/project), LSP, plugins (**plugin marketplaces — git-installable plugin registry + runtime**), packages, schedules, vault, usage, audit, members, integrations, org/project settings, notification settings.
- Appearance: dark default, system/light/dark, UI scale, accent color; IBM Plex typography.

## Positions we can honestly claim

1. **Fleet, not chatbot**: multi-machine orgs, relay/worker pairing, live relay promotion — running many agents across machines from one control plane.
2. **Full agent harness**: plans, budgets, compaction, subagents/handoffs/graphs, hooks — the engineering substance of long-running agents.
3. **Human in the loop by design**: mode permission gates (allow/ask/deny), per-command approvals, audit, file rules, vault.
4. **Self-hosted & local-first**: own SQLite, own keys, Ollama/local models supported, no cloud dependency; desktop app ships the whole stack.
5. **Agents that manage work**: native issue tracker with label-driven automation, schedules, webhooks, self-authored skills, self-connected MCP servers.
6. **Real-time observability**: SSE/WebSocket everywhere, full tool-call transcripts, token/cost usage.
7. ~20 model providers out of the box, bring-your-own OpenAI-compatible endpoint.

## Known gaps (be honest on the landing)

- No mobile client. Single OS user context per host. Google/GitHub integrations need user-configured credentials in self-hosted setups (vendor keys are compiled into official desktop builds only where provided).
- macOS release builds are unsigned (no notarization) as of v0.7.0.
