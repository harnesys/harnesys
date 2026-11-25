---
name: workspace-ops
description: Set up and run a harnesys workspace - agents, packs, skills, schedules, memory, and delegation through spawn and handoff
when_to_use: "For workspace-level operations: configuring the agent catalog, packs, schedules, memory roots; delegating multi-agent work; verifying workspace state"
---

# Project Operations

Operate a harnesys workspace as a whole: inspect it, configure agents and their runtime, build memory, schedule recurring work, and get tasks done through other agents. Agent definitions, graphs, and node semantics are covered by `agent-creator`; this skill is the operator view above them.

## Project layout

Project meta lives under `<workspace>/.harnesys/`:

```
.harnesys/
  skills/             # workspace skills (<name>/SKILL.md)
  mcp.json            # MCP server configurations
  threads/            # thread attachments and logs
```

Skills load from three roots, ascending precedence: system (`~/.harnesys/skills/`), then workspace (`.harnesys/skills/`). A later root overrides an earlier one by `name`. Format: folder name = skill name (kebab-case `[a-z0-9][a-z0-9-]*`), `SKILL.md` inside with `name`, `description`, optional `when_to_use`, non-empty body. The registry scans once at server start.

## Inspect before any change

```bash
agents_list            # top-level agents plus this agent's own delegates
plan_get
pin_list / memory_list / knowledge_search "topic" / threads_search "query" scope=org
list_dir <path> ; read_file <workspace>/.harnesys/skills/<name>/SKILL.md
```

Cite the exact output or file path in your brief.

## Configure agents

Before creating anything, check what exists (`agents_list`). Creating a new top-level agent needs a reason: a missing handoff target with a durable role. One-shot research goes to spawned delegates, never to a new top-level agent.

When creating (`agents_create`) or reviewing an agent:

- `name`, `role`, `instructions` (required)
- `capabilities` (legacy key in Studio records and presets; the bridge maps it): `{}` = enabled with defaults, `{ spec: {...} }` = enabled with settings, absent/null = off. Booleans are rejected.
- `skills`: names from the registry; reference only skills that exist
- `mcpServers`: server IDs from `.harnesys/mcp.json`
- `budget`: omit `graph` and the host builds the default ReAct loop with `budget: { maxSteps: 50, policy: "ask" }` when budget is omitted. Custom cyclic graphs require `maxSteps` or `deadlineMs`; `policy` is `ask` or `error`; subagents use `error`.

Capability packs: a pack is a bundle of tools; value shapes are `{}` (enabled with defaults), `{ spec: {...} }` (enabled with settings), absent/null (off) — booleans are rejected. The full pack→tool inventory is maintained in one place: the `harnesys-system` skill, `references/packs.md` (load with `load_skill`). Wrong pack names are rejected on save (`400`) and fail the run target at start; they never load silently.

## Memory and knowledge

- `memory_write`: curated semantic fact, `scope: session` or `long`
- `pin_set`: persistent rules for all agents (conventions, forbidden patterns, budget policies); keep focused, max 32 items
- `knowledge_search` / `knowledge_read`: search the indexed corpus, read a hit by id; the index is built from knowledge roots, not from a write tool
- `threads_search`: past thread transcripts, read-only (`scope: thread` for this chat, `scope: org` for the project)

Verify memory state after any change (`pin_list`, `memory_list`, `knowledge_search`, `threads_search`).

## Schedules

Recurring runs are automation trigger instances: the host stores each instance with its agent, thread, permission mode, workspace and instructions, and starts a run whenever the trigger fires. The tools that create and list automations come from installed add-ons, not from the core; use the automation tools this agent actually has.

- One trigger instance per thread. Dedicated automation threads keep logs isolated from chat threads.
- The instance workspace is the target thread's working directory: the fired run and any manual message in that thread execute there.
- Instructions are appended to every fired run and are edited in the automation settings, not restated in the prompt.
- An instance can carry host-owned **pre/post scripts** with a gate (automation gear -> Scripts). The pre script runs before the fire limits and can suppress the run (`exit 2`, unmatched gate, or a failed command under `skip-run`); the post script runs after the run reaches a terminal status (`always | success | failure`). Their `pwd` is the instance workspace.
- Scripts cannot be set through trigger tool calls (`ctx.triggers.create/update` strips/preserves them); if a user wants a conditional "fire only when X changed" automation, point them to a pre-script gate instead of asking the add-on for a change.
- The operator creates and edits automations in the Automations screen; an agent without automation tools cannot do it.
- For a one-off mid-run delay use `wait(delayMs)`; automations are for recurring or next-session fires.

## Delegate

Decision rule: research (read-only, parallel) goes to `agents_spawn` delegates; ownership of a thread goes to a top-level specialist via `agents_handoff`.

Spawn (delegation):

- Resolve the target from `agents_list` first; `agentId` must be an exact id, unique prefix (8+ chars), or name. Ambiguous or unknown fails.
- Provide complete input in `{ messages: [{ role: "user", content: "..." }] }` format. Children run sandboxed: no user asks, no approval-gated tools, no spawning further children, no `control:interrupt`/`wait`/map workers.
- Children cannot answer asks: their budget needs `policy: "error"`, and their definitions must not enable the `agents` pack.
- Result = the child's last message. `barrier: { policy: "all" }` waits for all children.

Handoff (ownership transfer):

- `agentId` must resolve to a top-level agent; the host rejects handoff onto spawn delegates.
- Input usually passes messages plus accumulated state. The run rebinds to the target definition and continues from its `core:start` with the parent's messages; the limits come from the target's stored `budget` (the same run, counters keep their values).

State accumulation:

- `control:assign` with `patch: { key: Expr | literal }`; expressions read slots (`$input`, `$state`, `$output`, `$resume`).
- For concurrent spawn results set `state.reducers` (`replace` vs `merge`) to avoid race conditions.

Track execution with the plan pack: each step names an owner and exit criteria; update statuses with `plan_item_update` after each round. Re-spawn children with sharper questions rather than repeating the same prompt.

## Verify after changes

1. `agents_list` - agents exist with correct capabilities, skills, graph
2. Automations screen (or the installed automation tools) - correct cron, target thread/agent and instructions
3. `plan_get` - plan state if the plan pack is in use
4. `pin_list` / `memory_list` / `knowledge_search` / `threads_search` - memory state
5. `read_file` / `shell` - file-level check of `.harnesys/` meta

## Anti-patterns

| Anti-pattern | Correct approach |
|---|---|
| New top-level agent for one-shot research | `agents_list`, then `agents_spawn` a delegate |
| Creating or spawning without checking `agents_list` | Always list first; reuse by id or name |
| Spawn with ambiguous `agentId` or incomplete input | Exact id/prefix/name; full task in input, children cannot ask back |
| Handoff to a delegate or unknown agent | Handoff only to top-level; spawn delegates |
| Cyclic graph without `budget.maxSteps`/`deadlineMs` | Set the budget; `policy: "error"` for subagents |
| Reusing a chat thread for schedules | One schedule per thread, dedicated threads |
| Changing the workspace without verifying afterwards | Run the verify list above |
