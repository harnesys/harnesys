# Runtime — how one agent run works

What follows is what the Harnesys host does around you on every model call. Knowing this removes most "why did that happen" mysteries.

## Your system prompt, assembled per run

Order of sections in one model call's system prompt:

1. **Your instructions** — the `instructions` text from your agent definition (authored in the preset / Configure agent dialog).
2. **Channel note** — only in Telegram-connector threads: a note that the channel is Telegram.
3. **Available skills catalog** — one line per granted skill: `name: description (when: when_to_use)`. Catalog lines are cheap; bodies load on demand via `load_skill`.
4. **Runtime section** — how the think/act loop works (you are driven by a graph; every tool call executes and returns before your next message; a text reply with no tool calls ends the run).
5. **Tools section** — grouped by pack, exactly the tools your packs grant. This section is authoritative about your abilities.

## Tail notes, refreshed every step

After the sections above, the host appends short status notes before each model call, from the current run state:

- **budget** — steps used / max steps, remaining time; policy on exhaustion.
- **loop** — reminder how the loop ends.
- **tools deferred** — if you have `exposure: deferred` tools, a note that `load_tools` can load them.
- **core-tools** — guidance for `map` / `wait` / `ask_user` (fan out, park, clarify).
- **agent-tools** — for agents with the `agents` pack: delegation etiquette.
- **issue-workflow** — for agents with the `issues` pack: board etiquette.
- **active-plan** — current plan steps and statuses, if a plan is in use.
- **memory** — notes from pin/semantic memory relevant to the run.

Read them: they are the host telling you the live state.

## Tools: direct, deferred, and load_tools

- **Direct** tools appear in your Tools section and are callable immediately.
- **Deferred** tools (a pack configured with `exposure: { tool: "deferred" }`) are not listed; the tail note catalogs them and `load_tools` loads them into context for the rest of the run. This saves context when a pack is wide (e.g. `lsp`, `google`).
- `load_tools` lives in the `core` pack. Loading a tool is safe and reversible within the run.

## Budget and graphs

- Default graph for an agent without a custom `graph`: a ReAct think/act loop.
- Default budget when `budget` is omitted: `{ maxSteps: 50, policy: "ask" }` — the host injects it at creation.
- `policy: "ask"`: on exhaustion the run pauses and asks the owner for more steps.
- `policy: "error"`: on exhaustion the run fails. Bundled subagents (`explorer`, `general`) use it — if you spawn them, scope the task to their budget.
- Subagents always run sandboxed: no owner asks, no approval-gated tools, no nested spawning.
- Custom cyclic graphs require `maxSteps` or `deadlineMs` explicitly.

## Errors you will see

Every error from the API follows one contract: `{ statusCode, errorCode, message, path, timestamp, traceId?, details? }`. Validation failures are `400 VALIDATION_ERROR` with `details.issues`. Domain rejections (e.g. `packs.agents is forbidden for subagents`) surface as typed errors with explanatory messages. On a denied or failed tool call: report it, adjust, retry differently — never retry the identical call blindly.

## Why your tool call "was denied"

Three common cases: (1) the tool is not in your packs at all; (2) the tool is approval-gated and the run is sandboxed (subagent) or the owner declined; (3) a permissions rule (`permissions` map on the agent definition) denies it. Fixes: request the pack from the owner (top-level agents are edited in the WebUI), or delegate differently.
