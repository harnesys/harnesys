# WebUI — navigation map

Routes come from `apps/webui/src/app/routes.tsx` and `apps/webui/src/shared/config/routes.ts`. Every org route is prefixed with `/o/<orgId>`; the app redirects `/` to the desk of the active org.

## Top-level routes

| Route | Screen |
|---|---|
| `/login`, `/signup`, `/accept` | Sign in, create the first owner account, accept an invite. |
| `/onboarding/choose` | First run: create an organization or join an existing relay. |
| `/onboarding/create` | Organization name and optional working folder. |
| `/onboarding/provider/:orgId` | Connect a model provider (name, driver, API URL, key) and discover models. |
| `/onboarding/models/:orgId` | Attach models the org may use; manual model name fallback; can skip. |
| `/onboarding/presets/:orgId` | Add agents from presets; Genie is pre-selected; “Model for all”; then enter the desk. |
| `/onboarding/join` | Join a relay as a worker (relay URL, org id, invite code). |
| `/o/<orgId>/` | Desk. |
| `/o/<orgId>/inbox` | Inbox page (approvals). |
| `/o/<orgId>/settings/<category>` | Settings page, defaulting to `appearance`. |
| `/o/<orgId>/settings/addons/<addonId>` | Add-on detail page. |
| `/o/<orgId>/settings/apps/<providerId>` | Provider-app detail (applications and connected accounts). |
| `/worker` | Worker relay view for accounts whose role is `worker`. |

Desk tabs are addressed under the desk route: `thread/<threadId>`, `board/<boardId>`, `dashboard/<dashboardId>`, `spawn/<threadId>/<spawnId>`, `terminal/<sessionId>`, `attachment/<issueId>/<attachmentId>`. File and diff tabs always carry a project id: `/o/<orgId>/<projectId>/file/*` and `/o/<orgId>/<projectId>/diff/*`.

## Desk shell

- **Left sidebar** (`widgets/project-sidebar`): org header, setup checklist, inbox bell and assistant toggle in the header; then accordion sections Inbox, Agents, Channels, Issues, Sources, Dashboards, Automations, Git, Terminal. Sections can be reordered, collapsed, hidden and resized; a collapsed sidebar becomes an icon rail. Footer holds the app version (links to Updates) and the section visibility/config menus.
- **Center**: an IDE-style tab area. Opening a thread, board, dashboard, file, diff or terminal adds a tab; with no tabs the desk shows the “Nothing open” home with actions to start a thread or an issue.
- **Right inspector**: for a thread it shows the agent inspector (Inspector, Files, Memory, Requests tabs), for a dashboard it shows the widget constructor, for a file it shows file details. Width is resizable.

## Sidebar sections

| Section | Lists | Actions |
|---|---|---|
| Inbox | Threads waiting for approval or errored (with counts/badges). | Open thread; bell opens the Inbox page. |
| Agents | Top-level agents, with their threads nested; delegates shown under parents. | `+` opens the preset marketplace; gear opens Configure agent. |
| Channels | Group threads (`kind: group`). | `+` opens the new-channel dialog (members, agent responders). |
| Issues | Boards, sorted by last update. | `+` creates a board from a template; gear opens board settings. |
| Sources | Attached folders and git repositories with file trees and index state. | `+` attaches a folder or remote git source; visibility/index controls. |
| Dashboards | Org dashboards. | `+` creates a dashboard; gear edits name/icon/color or deletes. |
| Automations | Installed add-on trigger automations with status and label. | `+` opens the trigger picker (only kinds whose add-on is connected); gear configures thread/mode/workspace and the **Scripts** block (pre/post commands, gate, Test, recent runs), the same values an agent sets through the add-on's trigger tools. |
| Git | Changed files per source. | Commit, Push, Update, Add all/selected, New Branch, branch checkout/delete, initialize repo, refresh. Clicking a file opens its diff tab. |
| Terminal | Terminal sessions (host, ssh, REPL). | `+` opens a new terminal tab. |

## Boards and issues

Open a board from Issues; it becomes a tab. The board surface (`features/manage-issues/ui/board-surface.tsx`) has columns for each status, filtered and sorted views, and a card per issue.

- **Board templates** (`packages/contracts/src/board-templates.ts`): `dev` (Backlog → Todo → In Progress → In Review → Done / Cancelled), `simple` (Todo/Doing/Done), `crm` (Lead → Qualified → Negotiation → Won/Lost), `blank` (Backlog/Done).
- **Statuses** carry `category` (`backlog`, `started`, `finished`, `cancelled`), a color and an optional entry flag. Transitions are free; moving an issue is drag-and-drop or the move dialog.
- **Rules** fire on `status_entered` or `issue_created`, with conditions (`has_label`, `has_not_label`, `has_priority`, `has_type`, `has_open_blockers`) and actions (`assign_agent`, `set_status`, `notify_owner`, `add_label`, `remove_label`, `unassign`, `stop`). `assign_agent` may pin an execution profile. Rules cascade up to 5 transitions and preview before save.
- **Issue drawer**: title and Markdown description, status, priority (1–4), type (`task`, `bug`, `research`, `feature`, `improvement`, `review`), assignee agent, labels, due date, parent issue/subtasks, dependencies (`blocks`, `relates`, `duplicate`), attachments (uploaded file or source-file reference), comments, fire trail, and the source/branch/worktree binding when the issue runs against a repo.
- **Dispatch**: an assigned issue entering a `started` status fires that agent in an issue thread (`kind: issue`). Only one active execution per issue; handoff is blocked by an active run, uncommitted changes or unpushed commits. “Nudge” re-fires the assignee after edits.
- **Board settings** (gear): board name, description, color, icon; statuses editor (add/rename/reorder/remove, entry status); rules editor with preview; danger zone (archive/delete board).

## Dashboards

Open from the Dashboards section; each dashboard is a tab with a pixel canvas and a right-hand inspector.

- Create via `+`: name, icon and color.
- Widgets are `WidgetDoc` JSON. The inspector edits the selected widget: layout rect, sources, props, derived values, state, bindings, events/actions, refresh; there is a raw JSON editor and a template gallery.
- Agent-authored widgets land as **drafts**. A human reviews the widget’s effects (sources, API calls, external invocations, vault entries) in the approve dialog, then activates it.
- Dashboard settings (gear) rename, recolor, change icon or delete; widgets can be moved on the 8 px grid, resized and deleted.
- Full authoring contract lives in the bundled `widget-creator` skill; the `dashboards` pack exposes `dashboards_*` and `dashboard_widgets_*` tools.

## Inbox

The bell opens `/o/<orgId>/inbox`: a board with **Pending** and **History** tabs. Each card is an approval (permission, plan, budget or question) with the originating thread, or a file/spend notice; cards offer approve/deny and a stop-run action. Pending approvals also appear in the sidebar Inbox section and as system notifications/sound when enabled.

## Agents

- Agents section `+` opens the preset marketplace (`features/preset-marketplace`): filter by origin, inspect a preset, create from it, import/export presets, compose a team preset.
- Gear on an agent opens **Configure agent** with categories: Identity, Model, Capabilities (packs), Access (sources, MCP, secrets), Execution (host/profile), Limits (budget, spend), Context (compaction), Memory, Graph, Subagents, Hooks, Modes.
- Threads are opened from the agent row; the thread view carries the journal (run events, tool calls, approvals). The right inspector has four tabs: Inspector (agent details and this thread’s plan), Files, Memory (pins and semantic facts), Requests (raw model requests).

## Assistant panel

`widgets/assistant-chat` renders a floating chat over the whole org layout (`AssistantChat` in `app/routes.tsx`).

- The sparkles button in the sidebar header toggles the panel; the collapsed form is a draggable launcher with unread and run-status dots.
- The header switches **agent** (every top-level agent in the org) and **thread** (that agent’s chat threads, plus “New chat”). The choice is remembered per agent in local storage.
- With no thread yet it starts one automatically. The empty state offers three starter prompts derived from pending onboarding checklist items, falling back to generic starters when setup is complete.
- Position, size and open state persist across reloads.

## Settings pages

`/o/<orgId>/settings/<category>` — the sidebar groups and each pane:

| Group | Category | Configures |
|---|---|---|
| Workspace | `appearance` | Theme, scale, accent. |
| Workspace | `vcs` | Commit message model and format instructions, git version and author on this host, git status colors. |
| Workspace | `chat` | Chat font size, follow mode, detail mode, detailed stats. |
| Workspace | `editor` | Editor font, tabs, wrapping, minimap, whitespace. |
| Workspace | `notifications` | Sound alerts for approval requests. |
| Workspace | `updates` | Version, release notes, auto-update. |
| Account | `account` | This user’s password and sessions on this host. |
| Agent setup | `skills` | Org, system, host, plugin and source skills; create, install, update, delete, reset system skills, reload, source auto-load. |
| Agent setup | `mcp` | Org MCP servers (`mcp.json`), check/toggle/remove. |
| Agent setup | `modes` | Mode presets: permissions per operation, pack preload, disabled tools, exposure, instructions, skills. |
| Agent setup | `plugins` | Org plugins under `pluginsDir` / `plugins-data`. |
| Agent setup | `packages` | Capability packs and the org tool catalog. |
| Agent setup | `lsp` | Org language-server defaults (`lsp.json`). |
| Agent setup | `toolchain` | Binary PATH resolution: shell, node version, extra dirs. |
| Agent setup | `addons` | Installed add-ons, install package, open add-on detail (activation, permissions, knowledge sources, diagnostics, logs). |
| Agent setup | `browser` | Browser engines per host and the org default engine. |
| Infrastructure | `fleet` | Machines in the org, sync status, invites, promote/rotate/disconnect/remove. |
| Infrastructure | `profiles` | Execution profiles: pools of hosts where agents may run. |
| Integrations | `apps` | Provider applications and connected accounts shared by add-ons. |
| Integrations | `providers` | LLM and embedding providers, model discovery/attach, import/export. |
| Integrations | `secrets` | Org secrets and variables for MCP and integrations. |
| Organization | `general` | Org name/description, leave, delete. |
| Organization | `members` | Members and invite codes. |
| Organization | `usage` | Token and cost usage, budgets. |
| Organization | `audit` | Security and fleet events. |
| Support | `support` | Ways to support the project. |

## First run

1. `/onboarding/choose` — create or join.
2. Create → provider → models → agents. Each step auto-skips when its signal is already satisfied (a provider exists, a model is attached, an agent exists); models also offers “Skip for now”.
3. Entering the desk the first time seeds a **“Getting started”** board from the `dev` template with four backlog issues (take the tour, run an agent, fire an agent from the board, ask for dashboards). It is created once per organization (tracked in org settings) and opens automatically.
4. The same seeding adds one board rule: entering **Todo** assigns the default agent (Genie) and starts a run, so the third issue demonstrates the rules engine. The rule is written only when the org already has an agent; otherwise the next desk visit retries.
5. The sidebar header shows a **setup checklist** popover next to the inbox bell, with a pulsing dot instead of a counter. Items in order: connect a provider, attach models, create an agent, create a board, add the first issue, finish an issue, build a dashboard. Each row has a one-line description, and clicking it either opens the matching settings page (provider, models), the preset step (agents) or opens the board and the matching demo issue in the issue drawer. Items tick from live data, can be hidden, and the popover disappears when all seven are done.
6. The assistant’s starter prompts follow the same checklist, asking about the first unfinished items.
