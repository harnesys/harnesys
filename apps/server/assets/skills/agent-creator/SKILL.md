---
name: agent-creator
description: Create and delegate to agents correctly - agents_create, agents_create_subagent, agents_spawn, agents_handoff; packs, budget, permissions, graphs, and why delegate calls fail
when_to_use: "Before calling agents_create or agents_create_subagent, and before any non-trivial agents_spawn: choosing create vs spawn vs handoff, writing packs/budget/permissions, custom graphs, diagnosing denied or failed children"
---

# Agent Creator

Build agents and delegate work to them without trial and error. Every rule below is host behavior: violations are rejected at call time or fail the child run.

Workspace-level concerns (schedules, memory roots, project layout) are covered by `workspace-ops`. This skill is the agent definition view.

## 1. Choose the mechanism first

| Goal | Tool |
|---|---|
| An agent that already exists can do it | `agents_spawn` it (see §5) |
| A reusable one-shot worker under you | `agents_create_subagent`, then `agents_spawn` |
| A missing durable specialist (own threads, visible to the user) | `agents_create` |
| A top-level thread should be owned by another top-level agent | `agents_handoff` |

Hard rules:

- Call `agents_list` before creating. Creating a duplicate name fails (`agent name taken in org: X`).
- Delegates (children) can never enable the `agents` pack: `packs.agents is forbidden for subagents (nesting ban)`. Children cannot spawn (a nested `agents_spawn` fails with `spawn is not allowed in a sandboxed run`).
- `agents_handoff` only accepts top-level agents; handing off to a delegate is rejected.
- `agents_update` / `agents_delete` work only on your own delegates; top-level agents are managed in the project UI. `agents_update` patches name/role/instructions/budget only (graph and packs are owner-only); budget replaces the stored value, omitted fields drop out.

## 2. Anatomy of a created agent

`agents_create` and `agents_create_subagent` share most fields. Required: `name`, `role`, `instructions`.

| Field | Notes |
|---|---|
| `instructions` | System prompt. The only prompt; it is registered as prompt key `main`. Write it self-contained (see §8). |
| `packs` | Sources of tools, not tool names (see §3). |
| `skills` | Registry skill names to attach (`search_skills` to browse). Names must exist; unknown names are rejected. |
| `mcpServers` | MCP server ids; tools arrive only for listed servers. |
| `model` | `{ provider, model, effort?, generation? }`. Must match the provider catalog (`model not found: provider/model` otherwise). Omitted: the creator's model is inherited; if you have no model either, creation fails with `model is required: no model ref given and creator has no model`. |
| `budget` | See §4. Omitted: host stores `{ maxSteps: 50, policy: "ask" }`. |
| `permissions` | Gate map, `agents_create_subagent` only (see §6). |
| `graph` | Optional custom graph (see §7). Omit for the default ReAct loop. |
| `color` | Optional avatar color shown in the user interface. One of the UI palette names: `red`, `orange`, `yellow`, `green`, `blue`, `purple`, `magenta`, `cyan`, `pink`. Hex is rejected for agents — pick a palette name so the avatar renders correctly. |

Differences:

- `agents_create` makes a top-level agent (level `top`, own threads, sidebar-visible).
- `agents_create_subagent` sets `parentId` to you (level `delegate`): spawn-only target, cannot ask the user, permissions are capped by yours.
- Custom graphs via tools reference `prompt: "main"` only; `state.initial` and `reducers` cannot be passed through `agents_create`/`agents_create_subagent`.

## 3. Packs

A pack is a bundle of tools. Tool availability derives from packs (plus `mcpServers`, `skills`), never from a stored tool-name list.

| Pack | Tools |
|---|---|
| `core` | `load_tools`, `load_skill` (runtime tool loading) |
| `files` | `read_file`, `write_file`, `edit_file`, `list_dir`, `glob`, `grep` |
| `shell` | `shell` |
| `fetch` | `fetch` |
| `web_search` | `web_search` |
| `lsp` | LSP diagnostics tools |
| `agents` | `agents_list`, `agents_create`, `agents_create_subagent`, `agents_spawn`, `agents_handoff`, `agents_update`, `agents_delete` |
| `plan` | `plan_save`, `plan_item_update`, `plan_get` |
| `threads` | `thread_list` |
| `scheduler` | `schedule_*` |
| `webhook` | `webhook_*` |
| `issues` | `issue_board_list`, `board_create`, `issue_create`, `issue_move`, `issue_update`, `issue_nudge`, `issue_get`, `issue_list`, `issue_comment`, `issue_dependency`, `issue_attachment_add`, `label_list`, `label_create`, `label_delete` |
| `manager` | `manager_pulse`, `usage_report` |
| `pin-memory` / `semantic-memory` / `episodic-memory` / `knowledge-memory` | `pin_*` / `memory_*` / `recall_search` / `knowledge_*` |
| `skills` | `search_skills` |

Value shapes: `true` (defaults), `{ spec?, disabledTools?, exposure? }` (per-tool overrides; `exposure` maps tool names to `direct` or `deferred`), `null`/`false` (off). Wrong shapes fail at call time (`invalid packs: packs.X must be ...`) and an unknown pack name fails the run target at start, never silently.

Gotchas that bite most often:

- Omitting `packs` or passing `{}` does NOT mean "no packs": the host defaults to `{ core: true, files: true, shell: true }`. To build a read-only analyst, pass an explicit map: `{ "core": true, "files": true }` and nothing else.
- Packs are sources: list `{"files": true}`, never `{"write_file": true}`.
- The `agents` pack is rejected for subagents.
- Give a delegate exactly the packs its bounded task needs; every pack widens the blast radius.

## 4. Budget

Fields: `maxSteps` (node executions), `maxTokens`, `deadlineMs`, `policy` (`ask` | `error`), plus tuning: `warnAtSteps` (default 3), `closeOnExhaustion`, `extendDefaultPct` (default 25), `spawnBudget` (`pool` | `inherit`).

- Any cycle in the graph requires `maxSteps` or `deadlineMs` (`graph has cycle but no budget.maxSteps/deadlineMs`). The default ReAct loop is cyclic.
- `policy: "ask"` means: when the budget runs out, the run pauses and asks the user to extend. Correct for top-level agents. A delegate has no user, so `ask` is unreachable for it; give delegates `policy: "error"` (or rely on closing reports, below).
- On budget exhaustion a spawned child never fails: it closes with a report and the result carries `budget: { kind, limit, used, closingStep: true }`. `used` may exceed `limit` by the closing report step. Read that field instead of treating the child as broken.
- Spawn fan-out pools by default: the parent's remaining budget is split in equal parts (`floor(remainder / N)`), and each child gets at most `min(requested, share)`. Set `spawnBudget: "inherit"` on the parent to give every child the full inherited budget instead.

## 5. Spawning children (`agents_spawn`)

Call shape: `calls: [{ agentId, input, budget?, permissions? }]`, max 32 calls. The parent waits at a barrier; children run with bounded concurrency (default width 4).

- `agentId` resolves as exact id, unique id prefix (8+ chars), or name. Unknown or ambiguous fails at call time with the roster listed: `unknown spawn target "X". Available agents: ...`.
- `input` is required: a plain string (wrapped into one user message) or `{ messages: [{ role: "user", content: "..." }] }`. Anything else is rejected: `input must be a string or { messages: [{ role, content }] }`.
- `budget` replaces the child budget entirely for this run (a partial object means the missing limits are unlimited). `policy` in it is accepted and ignored.
- `permissions` pre-approves gates for this child (see §6).
- Node-level `timeoutMs` / `onTimeout` (`partial` | `fail`) are graph-config concerns; default is no timeout. On timeout the remaining children abort and come back as `spawn_timeout` / `spawn_aborted` errors, so read every result entry.

A child run is sandboxed:

- No `ask_user`, no approvals, no `ask`-gated tool calls, no `control:interrupt`/`wait`/`map`. Violations return `denied in subagent context: <tool> requires ... no interactive user here; parent must provide, pre-approve, or do it itself`.
- State shared with the parent is parent-only: `plan_save`, `plan_item_update`, `pin_set`, `pin_remove`, `schedule_set`, `schedule_pause`, `schedule_delete`, `webhook_set`, `webhook_delete` are denied with `... writes state shared with the parent thread or project; the parent must do it itself`.
- All `agents` tools are removed from its registry; further spawning is impossible.
- If a child still ends with `needs_input` you get `sandbox_blocked` (`spawn child ended with status needs_input`): you under-specified the task or under-granted permissions.

Result item anatomy: `{ agentId, spawnId, output, error?, blocked?, budget?, usage? }`. `output` is the child's last message; `blocked` lists denied tool calls (diagnose permission gaps from it); `error.code` is one of `spawn_target_missing`, `agent_invalid` (broken child definition), `sandbox_blocked`, `spawn_timeout`, `spawn_aborted`, `stopped_by_hook`, `provider_rate_limited` / `provider_unavailable` / `provider_unauthorized` / `provider_error`, or the raw run status. A provider 5xx or 429 is retried by the host automatically; a persistent `provider_unavailable` means re-spawn later or use another model.

Write input as a complete subcontract: goal, constraints, file paths, expected output format. The child sees nothing but its instructions and this input.

## 6. Permissions

Gates per operation: `allow`, `ask`, `deny`. Operations: `fs.read`, `fs.write`, `process`, `network`, `mcp`, `agents`.

Defaults: `fs.read: allow`; everything else `ask`. In a sandboxed child `ask` behaves as deny.

Effective child rights at spawn:

```
base     = intersect(childDef.permissions ?? defaults, parentPermissions ?? defaults)
granted  = for each op in call.permissions:  parent says deny ? deny : call.permissions[op]
child    = granted ops override base, everything else stays base
```

Consequences:

- A grant lifts your own `ask` gate for the child: `permissions: { "fs.write": "allow" }` lets a files-capable delegate write.
- A grant never lifts an explicit `deny`. Read-only parents cannot delegate writes.
- Long-lived pre-approval belongs on the delegate definition (`agents_create_subagent` with `permissions`); one-off grants belong on the spawn call. Per-run grants win for that run.
- Gates are checked when the child calls a tool; the denial reason lands in the result's `blocked` list.

## 7. Handoff and custom graphs

`agents_handoff({ agentId })` passes the current thread to another top-level agent: same run, message history preserved, the graph jumps to `control:handoff`, limits come from the target's stored budget, counters keep their values. Use it for ownership ("Coder owns this fix now"), not for parallel research (that is spawn).

The default graph the host stores when `graph` is omitted (you rarely need to write this by hand):

```json
{
  "nodes": {
    "start":   { "type": "core:start" },
    "think":   { "type": "llm:generate", "prompt": "main", "messages": "$state.messages" },
    "act":     { "type": "tool:call", "calls": "$output.toolCalls", "concurrency": "parallel" },
    "spawn":   { "type": "control:spawn", "calls": "$state.spawns", "concurrency": "parallel", "barrier": { "policy": "all" } },
    "handoff": { "type": "control:handoff", "agentId": "$state.handoffAgentId", "input": "$input" },
    "end":     { "type": "core:end" }
  },
  "edges": [
    { "from": "start", "to": "think" },
    { "from": "think", "to": "act", "when": "$output.finishReason = \"tool-calls\"" },
    { "from": "think", "to": "end" },
    { "from": "act", "to": "spawn", "when": "exists($state.spawns) && length($state.spawns) > 0" },
    { "from": "act", "to": "handoff", "when": "exists($state.handoffAgentId)" },
    { "from": "act", "to": "think" },
    { "from": "spawn", "to": "handoff", "when": "exists($state.handoffAgentId)" },
    { "from": "spawn", "to": "think" },
    { "from": "handoff", "to": "end" }
  ]
}
```

Write a custom graph only for shapes the loop cannot express (forced pipelines, fixed tool calls, conditional exits). Node types: `core:start`, `core:end` (optional `output` expr), `llm:generate` (`prompt`, optional `messages` as `$state.*`, `model`, `tools`, `output` JSON schema), `tool:call` (fixed `name`+`args` XOR batch `calls`+`concurrency`, optional `approve`), `control:assign` (`patch`), `control:goto`, `control:spawn`, `control:map`, `control:handoff`, `control:wait`, `control:interrupt`, `control:yield`.

Validation you must satisfy (errors otherwise):

- Exactly one `core:start`; at least one `core:end`.
- Every node except `core:end` / `control:goto` / `control:yield` needs an outgoing edge.
- From any node with conditional (`when`) edges there must be exactly one default (no `when`) edge and it must be listed last.
- Cycles require `budget.maxSteps` or `deadlineMs`.
- `barrier.policy` must be `"all"`; `onTimeout` requires `timeoutMs`.
- `llm:generate.prompt` must exist in prompts; via tools that is always `"main"`. `messages` must be a `$state.*` path.
- `control:spawn` inside a sandboxed definition is rejected at run start (`spawn_in_sandbox`).
- Warnings (not fatal): unreachable nodes, non-static parallel spawn targets.

Expression language in `when`/`patch`/`args`: paths (`$input.x`, `$state.x`, `$output.x`, `$resume.x`), literals, `!`, `&&`, `||`, `=`, `==`, `!=`, `>`, `<`, `>=`, `<=`, parentheses, `exists($path)`, `length($path)`. There is NO arithmetic: `"$state.attempts + 1"` fails to parse. Reserved output keys to avoid: `input`, `state`, `output`, `resume`, `messages`, `toolCalls`, `finishReason`, `text`.

Example: a fixed pipeline (no loop, so no budget required, though you should still set one):

```json
{
  "nodes": {
    "start": { "type": "core:start" },
    "plan":  { "type": "llm:generate", "prompt": "main" },
    "save":  { "type": "tool:call", "name": "memory_write",
               "args": { "text": "$output.text", "scope": "long", "key": "digest" } },
    "end":   { "type": "core:end", "output": "$output.text" }
  },
  "edges": [
    { "from": "start", "to": "plan" },
    { "from": "plan", "to": "save" },
    { "from": "save", "to": "end" }
  ]
}
```

## 8. Instructions that work

A delegate sees only its `instructions` and the spawn input. Both must carry everything:

- Role and the single bounded job. No open-ended mandates.
- The runtime loop contract: think/act; a reply without tool calls ends the run and its text is the result the parent receives.
- Tool etiquette: read before write, which packs it has, what to do when a tool denies (report, never retry blindly).
- Output format the parent can parse (e.g. "last message: FINDINGS: ... / BLOCKERS: ...").
- Budget awareness: when the budget note shows few steps left, close with an honest partial report.

Reference examples live in `apps/server/assets/presets/agents/*.json` (researcher, coder, reviewer, tester, orchestrator). Copy their shape: title, method, runtime loop, tool etiquette, budget.

## 9. Failure playbook

| Error | Cause | Fix |
|---|---|---|
| `denied in subagent context: X requires permission...` | Child hit an `ask` gate | Grant `permissions` in the spawn call or on the delegate definition |
| `denied in subagent context: X writes state shared...` | Child called a parent-only tool | Parent runs `plan_save` / `pin_set` / etc. itself; child returns data |
| `packs.agents is forbidden for subagents` | `agents` pack on a delegate | Remove it; delegates never spawn |
| `spawn is not allowed in a sandboxed run` | A child tried `agents_spawn` | Fan out from the parent instead |
| `input must be a string or { messages: [...] }` | Bad spawn input shape | Pass a string or the messages array |
| `unknown spawn target "X"` | Wrong id/name | Resolve via `agents_list` (id, 8+ char prefix, or exact name) |
| `agent name taken in org: X` | Duplicate `agents_create` | Reuse the existing agent or rename |
| `model is required: no model ref given...` | Creator has no model | Pass `model: { provider, model }` explicitly |
| `model not found: p/m` | Model not in provider catalog | Use an existing provider/model pair |
| `graph has cycle but no budget...` | Cyclic custom graph | Set `budget.maxSteps` or `deadlineMs` |
| `prompt "verify" not found` | Custom graph references another prompt | Only `"main"` exists via creation tools |
| `sandbox_blocked` / `needs_input` | Child tried to ask | Complete the input, grant permissions, set `policy: "error"` |
| `provider_unavailable` on a child | Transient provider 5xx | Host already retries (3s/8s/20s); re-spawn if persistent |
| result `budget.closingStep: true` | Child ran out of budget | Not an error: read its closing report, re-spawn for the remainder |

## 10. Verify after creating or spawning

1. `agents_list` shows the agent with the intended packs, model, and level.
2. Smoke-test a new delegate with a read-only task before giving it write grants.
3. Read every spawn result entry: `error`, `blocked`, `budget` - not just `output`.
4. `manager_pulse` / `usage_report` after fan-outs to confirm the runs and their cost.
