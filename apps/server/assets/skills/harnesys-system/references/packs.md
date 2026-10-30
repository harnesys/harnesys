# Capability Packs — canonical inventory

This is the single source of truth for what each capability pack contains. Generated from pack metadata in `packages/harnesys/src/packs/*/index.ts` (`meta.tools`); the runtime renders your own granted subset into your system prompt's Tools section.

## Value shapes (the `packs` map)

- `"pack": {}` — enabled with defaults.
- `"pack": { "spec": { ... } }` — enabled with settings (per-pack options, see pack docs).
- Key absent or `null` — pack off. Booleans (`true`/`false`) are rejected.
- Omitting `packs` entirely on `agents_create` defaults to `{ core, files, shell }`.
- Unknown pack name → rejected at save (`400`) and fails the run target at start; never silent.
- The only web pack is `web` (`fetch` / `web_search` names were removed; unknown pack names fail the run target at start).
- The `agents` pack is rejected on subagents (nesting ban).

## Inventory

### files — Project files: read_file / file_read_image / write_file / edit_file / list_dir / glob / grep
- `read_file`: Read a text file with numbered lines. Omitting offset/limit returns the whole file when it fits, otherwise the first 400 lines. offset is the 1-based start line; limit is the max lines (capped at 2000). If truncated is true, more lines remain.
- `file_read_image`: Read an image file (png, jpeg, webp) and show it to the model in the next turn. Oversized files are downscaled automatically.
- `extract_file_text`: Extract text from PDF (text layer), DOCX, XLSX/XLS (sheets as Markdown tables) and CSV documents. Clear error for scanned PDFs and unsupported formats.
- `write_file`: Write or create a text file under the workdir.
### files — Project files: read_file / file_read_image / write_file / edit_file / list_dir / glob / grep
- `read_file`: Read a text file with numbered lines. Omitting offset/limit returns the whole file when it fits, otherwise the first 400 lines. offset is the 1-based start line; limit is the max lines (capped at 2000). If truncated is true, more lines remain.
- `file_read_image`: Read an image file (png, jpeg, webp) and show it to the model in the next turn. Oversized files are downscaled automatically.
- `extract_file_text`: Extract text from PDF (text layer), DOCX, XLSX/XLS (sheets as Markdown tables) and CSV documents. Clear error for scanned PDFs and unsupported formats.
- `write_file`: Write or create a text file under the workdir.
- `write_xlsx`: Create an Excel workbook (.xlsx) with multiple sheets, bold headers and column widths.
- `write_docx`: Create a Word document (.docx) from blocks: headings, paragraphs, bullets, tables, page breaks.
- `edit_file`: Exact string replace in a file. Returns a unified diff.
- `list_dir`: List directory entries under the workdir.
- `glob`: Find files by glob pattern under the workdir.
- `grep`: Search file contents with a regular expression.

### shell — Thread workdir shell command: shell
- `shell`: Run a shell command; optional background / terminal.
- `process_poll`: Read output and status of a process job.
- `process_kill`: Kill a process job started by shell.

### core — Host-mandated core tools: ask_user / map / wait
- `ask_user`: Ask the human a question and wait for their reply. Use for clarifications, choices, or missing information before continuing.
- `map`: Queue a fan-out over items for the graph control:map node. items is a JSON array (max 32). Optional instruction is a per-item template with $item/$index; it overrides the node default. Optional maxTokensPerItem caps each worker text result. Each item is processed in the map body with $item/$index; results return as Map results in context. Prefer this for parallel same-graph work; use agents_spawn when you need another agent definition.
- `wait`: Park this run until a wall-clock time (control:wait). delayMs is relative sleep (1..7d). Prefer this for mid-pipeline pauses; use schedule_set for recurring or next-session wakes after the run ends. Does not replace ask_user.

### image — Image generation: image_generate
- `image_generate`: Generate an image from a text prompt. Write a DETAILED ENGLISH prompt: subject, style, composition, lighting, mood. Returns a `thread:` locator (relPath) for the saved image artifact, which is also attached to the chat for the user.

### web — Web: search, HTTP fetch, browser on a selectable engine
- `web_search`: Search the web for current information. Use for facts that may be missing or outdated in the knowledge base.
- `fetch`: HTTP request (GET/POST/PUT/PATCH/DELETE/HEAD). Only http/https URLs.
- `browser_fetch`: One-shot page scrape to markdown without a browser session.
- `browser`: Full agent-browser CLI surface in this thread session. Load the `browser` skill for the command reference.
- `browser_close`: Close the browser session and stop the engine.

### lsp — Language server tools: lsp_diagnostics / lsp_definition / lsp_references / lsp_hover
- `lsp_diagnostics`: Language-server diagnostics for a file.
- `lsp_definition`: Go to definition via LSP.
- `lsp_references`: Find references via LSP.
- `lsp_hover`: Hover / type info via LSP.

### agents — Agent catalog: agents_list / agents_create / agents_create_subagent / agents_spawn / agents_handoff / agents_update / agents_delete
- `agents_list`: List agents in this project (id, name, role, instructions, packs, model). Optional role/name filters; role is not unique. packs lists enabled source assignments per agent; tool availability derives from those sources, not from a stored tool-name list. Prefer reuse via agents_list before agents_create. Spawned children are one-shot with no interactive user: judge fit by packs/model before agents_spawn.
- `agents_create`: Create an agent in this project. Returns { id, name }. Before creating, load_skill("agent-creator") for graphs, packs, budget, and HITL. Omit graph to let the host build a default ReAct graph; when budget is omitted the host stores { maxSteps: 50, policy: "ask" }. budget.policy is ask|error. Call agents_list first to reuse an existing agent when possible.
- `agents_create_subagent`: Create a one-shot delegate under the calling agent. Returns { id, name }. The delegate is a spawn target, cannot ask the user, and cannot enable the agents pack; use agents_create for a standalone project agent.
- `agents_spawn`: Queue one-shot subcontracts: the graph then runs control:spawn. calls is [{ agentId, input, budget?, permissions? }]. input is usually { messages: [{ role: "user", content: "<task>" }] }. Children cannot ask questions back (permission/approval/input tools are denied in child context); pre-approve gates with per-call permissions, or provide everything upfront. agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets fail here with the agent list. Prefer agents_list (reuse) before agents_create. This is not the tool name control:spawn.
- `agents_handoff`: Pass this thread to another agent (current speaker changes, origin stays). The graph then runs control:handoff. agentId from agents_list or agents_create. This is not the tool name control:handoff. Top-level agents only; delegates must be run via agents_spawn.
- `agents_update`: Patch name/role/instructions/budget of your own delegate; graph and packs are owner-only (tools removed; use sources). budget replaces the stored budget (omitted fields drop out): maxSteps/maxTokens/deadlineMs (integers >= 1) and policy ask|error, same shape as agents_create, at least one field required. Returns { agentId }. agentId accepts an exact id, a unique id prefix (8+ chars), or a name.
- `agents_delete`: Remove your own delegate that is not running anywhere; project UI manages top-level agents. Returns { removed, name }. agentId accepts an exact id, a unique id prefix (8+ chars), or a name.

### mcp — MCP server management: mcp_list / mcp_connect / mcp_check / mcp_toggle / mcp_remove
- `mcp_list`: List MCP servers with config and live connection status.
- `mcp_connect`: Register or replace an MCP server, probe it and return its tools.
- `mcp_check`: Health-check a configured MCP server.
- `mcp_toggle`: Enable or disable a configured MCP server.
- `mcp_remove`: Remove an MCP server entry.

### plan — Thread execution plans: plan_save / plan_item_update / plan_get
- `plan_save`: Create or overwrite the execution plan for this thread.
- `plan_item_update`: Update status of a specific task item in the thread plan.
- `plan_get`: Get current execution plan and tasks status for this thread.

### threads — Thread discovery: thread_list
- `thread_list`: List threads in this project. Each id works with schedule_set threadId to wake that conversation and with thread_tail to read that thread's event journal (runs, failures, comments). current=true is THIS chat. hasSchedule=true already has a cron (one schedule per thread).

### scheduler — Cron schedules: schedule_list / schedule_set / schedule_pause / schedule_delete / schedule_peek
- `schedule_list`: List cron schedules in this project.
- `schedule_peek`: Read the last fire run(s) from this schedule thread journal (human detail, agent texts, tools, errors). last defaults to 1, max 99.
- `schedule_set`: Create a cron schedule, or update it when id is set. Defaults to this agent as target. nextRunAt is the next cron instant after create, not now. threadId chooses WHERE the fire lands: omit = new dedicated schedule thread (isolated cron log); "self" = THIS chat (fires here once this run is idle; one active run per thread); uuid from thread_list = that existing conversation. Thread agent must match targetAgentId. One schedule per thread. history=none|last|all folds prior fires only on dedicated schedule threads; historyLast is how many when history=last (1–99).
- `schedule_pause`: Pause or resume a schedule by id.
- `schedule_delete`: Delete a schedule by id.

### webhook — Inbound webhooks: webhook_list / webhook_set / webhook_delete
- `webhook_list`: List inbound webhooks in this project.
- `webhook_set`: Create a webhook, or update it when id is set. Defaults to this agent as target.
- `webhook_delete`: Delete a webhook by id.

### issues — Issue boards: issue_board_list / source_list / board_create / board_update / board_rule_save / board_rule_delete / board_delete / issue_create / issue_move / issue_update / issue_nudge / issue_get / issue_list / issue_comment / issue_dependency / issue_attachment_add / label_list / label_create / label_delete
- `issue_board_list`: List issue boards with their statuses and automation rules.
- `source_list`: List sources an issue can bind to (git or folder); marks the managed workspace source.
- `board_create`: Create an issue board from a template (name, template, optional description/color/icon).
- `board_update`: Edit board fields (name/description/color/icon). Manage column rules with board_rule_save / board_rule_delete.
- `board_rule_save`: Create or update a board automation rule (trigger -> conditions -> actions). Omit ruleId to append a new rule; pass ruleId to update.
- `board_rule_delete`: Delete a board automation rule. Requires confirm=true.
- `board_delete`: Delete a board and all its issues. Requires confirm=true.
- `issue_create`: Create an issue on a board (created in the board entry status unless statusKey is given). Board rules for the entered status fire on creation. Optional sourceId/branch bind the run workspace.
- `issue_move`: Move an issue to any status of its board (transitions are free). Optional assignee override fires the new agent in a started status; optional comment.
- `issue_update`: Edit issue fields, labels, assignee ("unassign" clears), dueDate ("clear"), or move between boards.
- `issue_nudge`: Re-fire the assigned agent on an issue in a started status (after edits).
- `issue_get`: Full issue view: comments, subtasks, dependencies, attachments and board automation rules.
- `issue_list`: List issues filtered by board/status/assignee/label/priority/type.
- `issue_comment`: Add a comment to an issue as this agent.
- `issue_dependency`: Add or remove an issue dependency (blocks/relates/duplicate).
- `issue_attachment_add`: Attach a source file reference (sourceId + path) to an issue.
- `label_list`: List dispatch labels.
- `label_create`: Create a dispatch label.
- `label_delete`: Delete a dispatch label. Requires confirm=true.

### manager — Manager observation: manager_pulse / usage_report / thread_tail
- `manager_pulse`: Read-only org snapshot: agents with today spend vs daily budget, failed threads, pending approvals, open issues and total spend today. Start here for any "how is the org doing" question.
- `usage_report`: Token and cost usage aggregated by day or by agent (groupBy day|agent) over an optional from/to window. Rows carry input/output tokens, cost in USD and run count.
- `thread_tail`: Last events of a thread (run journal: runId, kind, timestamp, preview). threadId comes from thread_list rows or manager_pulse failedThreads; load missing tools via load_tools. limit 1..100, default 20.

### google — Google Workspace: calendar_list_events / calendar_create_event / calendar_update_event / calendar_delete_event / gmail_search_messages / gmail_read_message / gmail_read_thread / gmail_download_attachment / gmail_send_message
- `calendar_list_events`: List Google Calendar events with time-range and text filters.
- `calendar_create_event`: Create a Google Calendar event (summary, start/end, description, location, attendees).
- `calendar_update_event`: Update fields of a Google Calendar event.
- `calendar_delete_event`: Delete a Google Calendar event.
- `gmail_search_messages`: Search Gmail with Gmail search syntax; returns snippets and headers.
- `gmail_read_message`: Read one Gmail message: headers, text/plain body, and attachments list.
- `gmail_read_thread`: Read a Gmail thread: all messages with headers, bodies, and attachments lists.
- `gmail_download_attachment`: Download a Gmail attachment: attach it to the chat, or write it into the workspace via savePath.
- `gmail_send_message`: Send a plain-text email from the connected account.

### github — GitHub: repos and files, code search, issues, pull requests, CI runs, and webhook events of the connected installation
- `github_list_repos`: List repositories of the GitHub installation.
- `github_get_file`: Fetch a file from a repository.
- `github_search_code`: Search code across repositories.
- `github_issues_list`: List repository issues.
- `github_issues_get`: Read one issue.
- `github_issues_create`: Create an issue.
- `github_issues_comment`: Comment on an issue or pull request.
- `github_issues_close`: Close an issue.
- `github_issues_add_labels`: Add labels to an issue.
- `github_pr_list`: List pull requests.
- `github_pr_get`: Read one pull request.
- `github_pr_diff`: Unified diff of a pull request.
- `github_pr_review`: Submit a pull request review.
- `github_pr_create`: Open a pull request from a pushed branch.
- `github_pr_update`: Update pull request title, body, or state.
- `github_pr_merge`: Merge a pull request.
- `github_ci_workflow_runs`: Recent workflow runs.
- `github_ci_run_jobs`: Jobs of a workflow run.
- `github_ci_rerun`: Re-run a workflow run.
- `github_recent_events`: Recent webhook events of the installation.

### episodic-memory — Past-thread recall: recall_search
- `recall_search`: Search past thread experience (episodic recall). Read-only. Store a fact with memory_write.

### knowledge-memory — Indexed corpus: knowledge_search / knowledge_read
- `knowledge_search`: Search the knowledge corpus (docs / wiki)
- `knowledge_read`: Read a knowledge document by id from search hits

### pin-memory — Pinned rules visible to the agent: pin_set / pin_list / pin_remove
- `pin_set`: Upsert a pin that stays visible in the agent window
- `pin_remove`: Remove a pin by key
- `pin_list`: List all pins for this agent scope

### semantic-memory — Curated semantic memory: memory_write / memory_list / memory_update / memory_delete
- `memory_write`: Write a curated semantic memory fact (session or long)
- `memory_list`: List curated semantic memory facts
- `memory_update`: Update a semantic memory fact text by id
- `memory_delete`: Delete a semantic memory fact by id

### skills — Org skills management: create_skill / install_skill / search_skills
- `create_skill`: Create a new org skill from a description and markdown instructions.
- `install_skill`: Install skills into the org from a git repository.
- `search_skills`: Search the skills.sh registry for skills.

