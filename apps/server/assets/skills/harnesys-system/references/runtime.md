# Runtime — how one agent run works

What follows is what the Harnesys host does around you on every model call, as implemented in `packages/harnesys/src/application/llm.ts`, `graph.ts`, and `llm-request-plan.ts`. Knowing this removes most "why did that happen" mysteries.

## Your system prompt, assembled per run

Order of parts in one model call's system prompt:

1. **Your instructions** — the `instructions` text from your agent definition.
2. **Context note** — files attached to the thread, when the thread has any.
3. **Channel note** — connector-specific note, e.g. that the thread is Telegram.
4. **Available skills catalog** — one line per granted skill: `- name: description (when: when_to_use)`. Catalog lines are cheap; bodies load on demand with `load_skill`.
5. **Runtime section** — host name, environment (Host or Container), run root and its kind (`sandbox`, `directory`, `worktree`, `source`), scratch dir, shared sources with index state, and the rules for `thread:` paths and file links.
6. **Tools section** — `Capabilities available in this model call:` grouped by tool group, listing exactly the direct tools the run has.

## Tail notes, refreshed every step

After the prompt, the host appends short XML-tagged notes before each model call, from current run state:

| Note | Meaning |
|---|---|
| `budget` | Steps/tokens/time left and what to do (finish, wrap up, last step). |
| `loop` | Identical-call streak warning; one more identical call can stop the run. |
| `tools` | Deferred tool catalog with descriptions; load schemas via `load_tools`. |
| `core-tools` | When to use `map`, `wait`, `ask_user` (from the `core` pack). |
| `agent-tools` | Delegation etiquette (from the `agents` pack). |
| `issue-workflow` | Board etiquette and the `issue-ops` pointer (from the `issues` pack). |
| `active-plan` | Current plan, item ids and the next pending task (from the `plan` pack). |
| `pin-memory`, `semantic-memory`, `memory-semantic`, `knowledge-memory` | Memory guidance and projected facts, when those packs are on. |
| `hooks` | Context injected by agent hooks (e.g. session start). |
| `compaction` | Context pressure, compaction skipped/paused, or compaction failure. |
| `map_worker` | Per-item framing inside a `map` worker pass. |

Notes are wrapped as `<tag>…</tag>` under a `Runtime notes (refreshed before this step):` header. A note provider that throws is skipped and reported in run stats, not fatal.

## Tools: direct, deferred, and `load_tools`

- **Direct** tools appear in your Tools section and are callable immediately.
- **Deferred** tools are hidden from the section; the `tools` note catalogs them and `load_tools(["name"])` loads them for the rest of the run.
- Exposure is `direct` unless a pack override, mode preset, or tool default says otherwise. MCP server tools are deferred by default, so MCP needs `load_tools` first.
- A mode preset's `packs` list acts as a preload set: every pack outside it becomes deferred for that mode. `mode.exposure` overrides individual tools.
- `load_tools` is injected by the host when deferred tools exist; `load_skill` is injected for skills. Neither belongs to a pack.
- `disallowedTools` on the agent and mode remove tools after packs are assembled; aliases like `Read`/`Bash` resolve to `read_file`/`shell`.

## Budget and graphs

- Default graph for an agent without a custom `graph`: a ReAct think/act loop (`start → think → act → think … → end`, plus spawn/handoff nodes).
- Default budget when `budget` is omitted on a ReAct agent: `{ maxSteps: 50, policy: "ask" }`.
- `policy: "ask"`: on exhaustion the run parks with a budget interrupt and asks the owner to continue, extend or close.
- `policy: "error"`: on exhaustion the run fails. This is forced for sandboxed runs: `map` workers and spawned delegates.
- `map` workers inherit the parent budget with the policy forced to `error` (or `{ maxSteps: 50, policy: "error" }` when the parent has none).
- `agents_spawn` children use the child's own budget or the parent's, capped by any per-call `budget` and `permissions` grant; a child can never exceed its parent's gates.
- Custom graphs with cycles require `maxSteps` or `deadlineMs`, otherwise validation fails with `graph has cycle but no budget.maxSteps/deadlineMs`.

## Sandboxed children

- `agents_spawn` children run sandboxed: `ask` gates become `denied in subagent context: …` instead of a prompt. `agents_handoff` is not a sandboxed child — it hands the thread to another top-level agent with its own grants, and is forbidden inside a sandboxed run.
- Shared-state tools are refused in a child: `plan_save`, `plan_item_update`, `pin_set`, `pin_remove`.
- `agents_*` tools are removed inside the sandbox (nesting ban).
- A child's final message returns to the parent as a spawn result; it cannot ask questions back.

## Errors you will see

Every API error follows one contract: `{ statusCode, errorCode, message, path, timestamp, traceId?, details? }`. Validation failures are `400 VALIDATION_ERROR` with `details.issues`. Domain rejections (for example `packs.agents is forbidden for subagents`) surface as typed errors with explanatory text. On a denied or failed tool call: report it, adjust, retry differently — never retry the identical call blindly.

## Why a tool call "was denied"

Five causes, in rough order of frequency:

1. The tool is not granted: no pack provides it, or `disallowedTools`/mode removed it. Ask the owner to grant the pack; only the owner edits top-level agents.
2. The operation gate is `deny` in the effective permission map (agent definition, mode preset, or per-call grant).
3. The gate is `ask` and the run is sandboxed (subagent or `map` worker) — the answer is `denied in subagent context`, since there is no interactive user.
4. The gate is `ask`, the owner declined, or a `PermissionRequest` hook blocked it.
5. The tool writes shared state (`plan_*`, `pin_*`) from a child, which is always refused.
