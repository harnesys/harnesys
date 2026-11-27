# Capability Packs — canonical inventory

The pack set and every tool below are taken from the pack definitions in `packages/harnesys/src/packs/*` (each `definePack` carries `meta.tools` and a `specSchema`) and from the host pack list in `apps/server/src/app/domain/runtime/org-pack-list.ts`. There are **17 host packs**; the host additionally injects `load_skill` and `load_tools`, which belong to no pack.

A run only sees the subset granted by the agent's `packs` map. This file describes what each pack contains in general; the agent's own Tools section is authoritative for that agent.

## Value shapes (the `packs` map)

| Value | Meaning |
|---|---|
| `true` or `{}` | Pack enabled with defaults. |
| `{ "spec": { ... } }` | Pack enabled with per-pack settings (fields below). |
| `false`, `null`, key absent | Pack off. |
| `{ "disabledTools": ["tool_name"] }` | Pack enabled with those tools removed. Unknown names are a fatal capability warning. |
| `{ "exposure": { "tool_name": "deferred" } }` | Overrides exposure per tool (`direct` or `deferred`). Unknown names are a fatal warning. |

- Omitting the whole packs map (or making it effectively empty) defaults the agent to `{ core, files, shell }` only (`packsFromConfig` in `apps/server/src/app/infra/runtime/agent-definition.mapper.ts`).
- `disabledTools` and `exposure` only apply to packs that are on; entries for an inactive source raise a fatal capability warning.
- Tool-name aliases are accepted in `disabledTools` and mode lists: `Read`→`read_file`, `Write`→`write_file`, `Edit`→`edit_file`, `Glob`→`glob`, `Grep`→`grep`, `LS`→`list_dir`, `Bash`→`shell`, `WebFetch`→`fetch` (`packages/harnesys/src/application/tool-aliases.ts`). Claude-Code-only names (`TodoWrite`, `WebSearch`, `Task`, …) have no analog and are ignored.
- Unknown pack names are accepted at save time, then produce no tools and a `[capabilities] pack "x" is not registered by the host` warning at run start.
- `packs.agents` is rejected for subagents (`packs.agents is forbidden for subagents (nesting ban)`).
- Add-on packs are registered dynamically as `<addonId>.<packName>` and their tools are exposed as `<packName>_<toolName>`; they are not part of the 17 host packs.

## Exposure: direct, deferred, `load_tools`

- Every tool defaults to `direct`: it appears in the agent's Tools section immediately.
- `deferred` tools are hidden from the Tools section; a tail note lists them and `load_tools(["name"])` loads the schemas for the rest of the run.
- MCP server tools are created deferred by default (`packages/harnesys/src/application/mcp/create-mcp-tool.ts`), so an agent using MCP must call `load_tools` first.
- A mode preset's `packs` list marks every pack not in that list as deferred (mode "preload"), and `mode.exposure` can override single tools.
- `load_tools` is injected by the host only when the run has deferred tools; `load_skill` is injected for skill access. Neither appears in the pack tables below.

## Inventory

### core — host-mandated loop tools
No settings. No permission gate. Always required for a functioning agent.

| Tool | Does |
|---|---|
| `ask_user` | Ask the human a question and park the run until the reply. |
| `map` | Queue a fan-out over a JSON array (max 32) for the graph `control:map` node; per-item template with `$item`/`$index`. |
| `wait` | Park the run until a wall-clock delay (1 ms–7 d) or until a signal settles (`signal: 'issue:<id>'`); optional `timeoutMs` bounds a signal wait (default 30 min). |

`core` also adds the `core-tools` tail note explaining when to use `map`, `wait`, `ask_user`.

### files — project files
Settings: `root` (string), `blocklist` (string[]). Gates: `fs.read` for reads, `fs.write` for writes.

| Tool | Does |
|---|---|
| `read_file` | Read a text file with numbered lines; offset/limit, 2000-line cap, `truncated` flag. |
| `file_read_image` | Read png/jpeg/webp and show it to the model next turn; oversized files are downscaled. |
| `extract_file_text` | Extract text from PDF (text layer), DOCX, XLSX/XLS (sheets as Markdown) and CSV. |
| `write_file` | Write or create a text file, or a `files` batch; replaces an existing file unless `overwrite: false` (per entry or call-wide). |
| `write_xlsx` | Create a multi-sheet Excel workbook with bold headers and column widths. |
| `write_docx` | Create a Word document from blocks: headings, paragraphs, bullets, tables, page breaks. |
| `edit_file` | Exact string replace; unified diff for a single edit, counts for an `edits` batch. |
| `delete_file` | Delete a file by path, a `paths` batch, or files by glob pattern (`pattern` defaults to dry-run, `dry_run: false` executes; directories need `recursive: true`). |
| `move_file` | Move or rename a file or a `moves` batch; creates the target parent directory, refuses an existing target unless `overwrite: true`. |
| `list_dir` | List directory entries under the workdir. |
| `glob` | Find files by glob pattern. |
| `grep` | Search file contents with a regular expression. |

Batches (`write_file` `files`, `edit_file` `edits`, `delete_file` `paths`, `move_file` `moves`): business errors (missing source, blocked path, `old_string` miss, target collision) land in `failed[]` while valid entries still apply; an access-policy denial on any path aborts the whole call before anything executes. Overwrite defaults differ on purpose: `write_file` replaces unless `overwrite: false`, `move_file` refuses unless `overwrite: true`.

### shell — thread shell, terminals, SSH
Settings: `timeout` (1–600000 ms), `allowlist`, `blocklist` (string[]). Gate: `process` on every tool.

| Tool | Does |
|---|---|
| `shell` | Run a shell command; optional background, terminal or remote target. |
| `terminal_spawn` | Start a named terminal session (host, ssh or REPL) kept across calls and shared in the sidebar. |
| `terminal_write` | Write to a session stdin; `0x03` = Ctrl+C, `0x04` = EOF. |
| `terminal_read` | Read session output (non-destructive), optional until-regex (max 30 s). |
| `terminal_kill` | Kill a session or background job, including a user-opened shell. |
| `terminal_list` | List sessions and background jobs, including user-opened ones. |
| `port_forward` | Open an SSH port forward as a background job. |
| `remote_copy` | Copy files over SSH through a tar pipe (push/pull). |

### image — image generation
Settings: `provider`, `model`. No permission gate.

| Tool | Does |
|---|---|
| `image_generate` | Generate an image from a detailed English prompt; returns the image's absolute path and attaches the image to the chat. |

### web — search, HTTP, browser
Settings: `provider` (`duckduckgo` \| `searxng`), `searxngUrl`, `maxResults` (1–20), `engine`, `allowPrivateNetwork`, `stealth`, `headed`. Gate: `network`.
Pack skill: `browser` (bypasses the agent's `skills` allowlist).

| Tool | Does |
|---|---|
| `web_search` | Web search for current information. Single `query` or batched `queries` (up to 5, answers in request order); searxng adds `language`, `time_range`, `categories`, `pageno`, `engines` and returns `engines_used` / `unresponsive_engines` / `infoboxes`. |
| `fetch` | HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD) for http/https URLs. |
| `browser_fetch` | One-shot page scrape to Markdown without a browser session; returns `bytes` and an `empty body` note when a page is unreadable. |
| `browser` | Full agent-browser CLI surface in a thread session; load the `browser` skill for commands. |
| `browser_close` | Close the browser session and stop the engine. |

### lsp — language server
No settings. Gate: `fs.read`.

| Tool | Does |
|---|---|
| `lsp_diagnostics` | Diagnostics for a file. |
| `lsp_definition` | Go to definition. |
| `lsp_references` | Find references. |
| `lsp_hover` | Hover / type info. |

### agents — fleet management
Settings: `ownDelegatesOnly` (boolean, limits `agents_update` to the caller's own delegates; delete is always own-delegates only). Gate: `agents` on create, spawn, handoff, update, delete; a permissions change on create/update asks the user even when `agents` is allowed.
Forbidden on subagents.

| Tool | Does |
|---|---|
| `agents_list` | List agents with id, name, role, instructions, packs, skills, budget, permissions, model, level, parent. |
| `agents_create` | Create a standalone top-level agent; omitted graph → default ReAct graph, omitted budget → `{ maxSteps: 50, policy: "ask" }`. |
| `agents_create_subagent` | Create a one-shot delegate under the caller (no user, no `agents` pack). |
| `agents_spawn` | Queue one-shot subcontracts for the graph `control:spawn` node; per-call `budget` and `permissions`. |
| `agents_handoff` | Transfer this thread to another top-level agent (`control:handoff`). |
| `agents_update` | Patch name/role/instructions/budget/permissions; setting `permissions` always parks an approval ask (also under `agents: allow`); `permissionsJson`/`permissions` inside `config` fails with an error; graph and packs stay owner-only. |
| `agents_delete` | Remove a delegate that is not running anywhere. |

### automations — trigger management
No settings. No permission gate. Manages trigger instances of every installed add-on without per-add-on tools. Trigger kinds are read from installed manifests; config is validated against the kind's `configFields` (required, type, select options, pattern, `visibleWhen`, groups). Kind-specific operations are declared as actions and invoked with `automation_action`.

| Tool | Does |
|---|---|
| `automation_kind_list` | List installed trigger kinds with `configFields`, `connection`, `limits` and `actions`; optional `addonId` filter. |
| `automation_list` | List instances with addonId, kind, label, enabled, config and target. |
| `automation_get` | Read one instance including the full target and pre/post scripts. |
| `automation_create` | Create an instance for any kind; threadId/agentId default to the caller; config must satisfy the kind's fields. |
| `automation_update` | Patch label/config/instructions/enabled or target fields; target fields merge into the stored target, so `scripts` alone updates only scripts. |
| `automation_action` | Invoke a kind-declared action (`status`, `test`, `deliveries`, `rotate_secret`, ...) with input validated against the action `inputSchema`. |
| `automation_set_enabled` | Pause or resume an instance. |
| `automation_delete` | Delete an instance permanently; requires `confirm=true`. |
| `automation_script_runs` | Recent pre/post script runs with status, exit code, gate verdict and output tails. |
| `automation_script_test` | Run a pre script and gate in the workspace without firing. |

The system skill `automations` (`apps/server/assets/skills/automations`) documents config field types, the gate matrix and the action table with three references; list it in the agent's `skills` to make `load_skill("automations")` work.

### mcp — MCP server management
No settings. Gate: `mcp_manage`.

| Tool | Does |
|---|---|
| `mcp_list` | List MCP servers with config and live connection status. |
| `mcp_connect` | Register or replace a server, probe it, return its tools. |
| `mcp_check` | Health-check a server. |
| `mcp_toggle` | Enable or disable a server. |
| `mcp_remove` | Remove a server entry. |

### plan — this thread's execution plan
No settings. No permission gate. Adds the `active-plan` tail note while a plan has pending work.

| Tool | Does |
|---|---|
| `plan_save` | Create or overwrite the thread plan (overview + ordered items). |
| `plan_item_update` | Update one item's status (`pending`, `in_progress`, `completed`, `failed`, `cancelled`) by id, unique prefix or order, with an optional `resultNote`. |
| `plan_delete` | Delete the thread plan and clear it from the inspector. |
| `plan_get` | Read the current plan and item statuses. |

### threads — thread discovery and transcripts
No settings. Gate: `read` on the history/list/read paths.

| Tool | Does |
|---|---|
| `threads_list` | List threads in the org; `current=true` is this chat. |
| `threads_history` | Read older messages of this or another thread, paged with `beforeSeq`. |
| `threads_search` | Keyword search over transcripts (`scope=thread` or `scope=org`). |
| `threads_tail` | Last run-journal events of a thread (runId, kind, time, preview). |

### issues — boards, issues, dispatch
No settings. No permission gate. Adds the `issue-workflow` tail note.

| Tool | Does |
|---|---|
| `issue_board_list` | List boards with statuses and automation rules. |
| `source_list` | List sources an issue can bind to (git or folder). |
| `board_create` | Create a board from a template (`dev`, `simple`, `crm`, `blank`). |
| `board_update` | Edit name/description/color/icon. |
| `board_rule_save` | Create or update a rule (trigger → conditions → actions). |
| `board_rule_delete` | Delete a rule; requires `confirm=true`. |
| `board_delete` | Delete a board and all its issues; requires `confirm=true`. |
| `issue_create` | Create an issue in the entry status unless `statusKey` is given; entry rules fire. |
| `issue_move` | Move to any status; optional assignee override and comment. |
| `issue_update` | Edit fields, labels, assignee (`unassign`), due date (`clear`), or board. |
| `issue_nudge` | Re-fire the assignee on an issue in a started status. |
| `issue_get` | Full issue view: comments, subtasks, dependencies, attachments, board rules. |
| `issue_list` | Filter by board/status/assignee/label/priority/type. |
| `issue_comment` | Add a comment as this agent. |
| `issue_dependency` | Add or remove a `blocks`/`relates`/`duplicate` dependency. |
| `issue_attachment_add` | Attach a source file reference (`sourceId` + path). |
| `label_list` | List dispatch labels. |
| `label_create` | Create a dispatch label. |
| `label_delete` | Delete a label; requires `confirm=true`. |

### signals — free-form wake keys
No settings. No permission gate. Adds the `signals-usage` tail note.

| Tool | Does |
|---|---|
| `signal_fire` | Fire a key (`'<kind>:<id>'`, e.g. `deploy:done`): runs parked on it via `wait({ signal: key })` resume immediately; a run that parks later also resumes (fires are sticky per org). |

Waiting side is the core `wait` tool: `wait({ signal: 'deploy:done', timeoutMs: 600000 })`. Unfired keys wait for the timeout.

### manager — org observationNo settings. No permission gate. Read-only.

| Tool | Does |
|---|---|
| `manager_pulse` | Org snapshot: agents with today spend vs daily budget, failed threads, pending approvals, open issues, total spend today. |
| `usage_report` | Token and cost usage by day or by agent, with input/output tokens, USD and run count. |

### dashboards — dashboards and widgets
No settings. No permission gate. Destructive calls are marked in their descriptions.
Pack skill: `dashboards-widget-authoring` (a pointer to the filesystem skill `widget-creator`, which must also be granted to the agent for the full contract).

| Tool | Does |
|---|---|
| `dashboards_create` | Create an empty dashboard; returns the id. |
| `dashboards_list` | List org dashboards with widget counts. |
| `dashboards_get` | Dashboard detail: widgets, rects, docs, draft/active status. |
| `dashboards_update` | Rename a dashboard. |
| `dashboards_delete` | Delete a dashboard and all widgets (destructive). |
| `dashboard_catalog_get` | Org API catalog for widget sources: method, path template, query and response JSON Schema. |
| `dashboard_templates_list` | Starter widget templates with id, title, suggested rect and counts. |
| `dashboard_templates_get` | Full WidgetDoc of one template with the org id substituted. |
| `dashboard_widgets_validate` | Dry-run a WidgetDoc: `{ ok, issues: [{ path, message }] }`. |
| `dashboard_widgets_create` | Create a widget (rect + doc); always lands as a draft for human approval. |
| `dashboard_widgets_update` | Update rect and/or doc; a doc change to an agent-created widget returns it to draft. |
| `dashboard_widgets_delete` | Delete a widget. |
| `dashboard_widgets_move` | Batch-move widgets on the 8 px grid. |
| `dashboard_widgets_test` | Dry-run a source definition: validates url, headers, vault secrets. |

### pin-memory — pinned rules
Settings: `store` (`kv-pin`), `maxItems`. No permission gate.

| Tool | Does |
|---|---|
| `pin_set` | Upsert a pin that stays visible in the agent window. |
| `pin_list` | List pins for this agent scope. |
| `pin_remove` | Remove a pin by key. |

### semantic-memory — curated facts
Settings: `store` (`record-store`), `autoProjectSession`, `autoProjectLong`. No permission gate.
Adds the `semantic-memory` guidance note and, when projection is on, a `memory-semantic` note.

| Tool | Does |
|---|---|
| `memory_write` | Write a curated fact (session or long). |
| `memory_list` | List curated facts. |
| `memory_update` | Update a fact's text by id. |
| `memory_delete` | Delete a fact by id. |

### knowledge-memory — indexed corpus
Settings: `store` (`knowledge`), `topK`. No permission gate. Adds the `knowledge-memory` guidance note.

| Tool | Does |
|---|---|
| `knowledge_search` | Search the indexed knowledge corpus. |
| `knowledge_read` | Read a document by id from search hits. |

### skills — org skill management
No settings. Gates: `fs.write` for create/install, `network` for install and search.

| Tool | Does |
|---|---|
| `create_skill` | Create an org skill from a description and Markdown instructions. |
| `install_skill` | Install skills into the org from a git repository. |
| `search_skills` | Search the skills.sh registry. |
