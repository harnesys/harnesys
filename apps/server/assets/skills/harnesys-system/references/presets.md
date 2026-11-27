# Presets — bundled agent catalog

Bundled agent presets live in `apps/server/assets/presets/agents/<name>/{config.json, instructions.md}`. On every boot `systemPresetsSeed` (`apps/server/src/app/infra/presets/system-presets-seed.ts`) reads them into the machine-level `presets` table in `machine.db` with origin `system`, id `harnesys/<dirname>`, version `1.0.0`. System rows are upserted on each boot, and a system row whose bundle directory disappeared is deleted. User-origin presets are never touched. Legacy single-file presets in `~/.harnesys/presets/agents/*.json` are imported once as `local/<stem>` and marked with `~/.harnesys/presets/.legacy-agents-imported`.

## Agent presets (9)

| Preset id | Name / role | Packs | Skills | Budget | Purpose |
|---|---|---|---|---|---|
| `harnesys/genie` | Genie / chief-of-staff | files, shell, web, skills, issues, manager, lsp, mcp, plan, agents, threads, semantic-memory, knowledge-memory, pin-memory, core, automations | agent-creator, workspace-ops, find-skills, harnesys-system, addon-creator, widget-creator, automations | 400 steps / 1h / ask | The owner's right hand: configures the workspace, grows the team, plans work. Widest grants. |
| `harnesys/coder` | Coder / coder | files, shell (command blocklist), issues, lsp, plan, pin-memory, core, agents (`ownDelegatesOnly`, `agents_handoff` and `agents_create` disabled) | issue-ops, addon-creator | 300 steps / 45m / ask | Implementation work tracked through issues. |
| `harnesys/reviewer` | Reviewer / reviewer | files, shell (command blocklist), issues, core | issue-ops | 120 steps / 20m / ask | Code review against issue criteria. |
| `harnesys/tester` | Tester / tester | files, shell (command blocklist), plan, core | — | 150 steps / 30m / ask | Writes and runs the checks a change needs. |
| `harnesys/researcher` | Researcher / researcher | files, web, plan, agents, threads, knowledge-memory, semantic-memory, pin-memory, core | agent-creator | 250 steps / 1h / ask | Deep dives with sources; can spawn read-only subagents. |
| `harnesys/planner` | Planner / planner | files, plan, threads, core | — | 80 steps / 20m / ask | Decomposes tasks into plans. |
| `harnesys/writer` | Writer / writer | files, web, core | — | 150 steps / 30m / ask | Prose and docs; web search for sources. |
| `harnesys/general` | General / helper | files, shell (command blocklist), plan, core | — | 100 steps / 15m / error | Flexible subagent for bounded tasks. |
| `harnesys/explorer` | Explorer / scout | files, core | — | 60 steps / 10m / error | Read-only scout: search and report, no shell. |

`explorer` and `general` run with `policy: "error"` and are the usual spawn targets; all other presets use `ask`, so an exhausted run parks for the owner.

**No dead pack names ship today:** the bundled Genie config lists 16 packs, all registered (see `genie/config.json`). The host pack list (`apps/server/src/app/domain/runtime/org-pack-list.ts`) has 20 names; scheduling and webhooks are not among them — they are add-on capabilities surfaced through the `automations` pack, not core pack names. An unregistered name in any agent config logs `pack "x" is not registered by the host` and grants no tools; do not put invented pack names into `capabilities`.

## How presets become agents

- The WebUI creates an agent from a preset through `POST /api/orgs/:orgId/agents/from-preset` (`CreateAgentFromPresetBody`: `presetId`, optional `name`, `modelId`, `parentId`). The Agents section `+` button opens the preset marketplace; the onboarding "Agents" step pre-selects `harnesys/genie`.
- `modelId` is optional in the request; when omitted the agent is created against the literal `stub` model id, so always pass a real model.
- `parentId` makes the result a delegate (`level: delegate`); without it the agent is top-level.
- The `agents_create` tool does **not** accept a `presetId`. An agent that wants preset-shaped agents must either create them field by field or ask the owner to use the marketplace.
- Team presets are created with `POST /api/orgs/:orgId/teams` (`presetId` + `models` map) and return the created agents plus a board. `apps/server/assets/presets/teams/` does not exist, so no team presets ship today; the compose-team dialog works from imported or user presets.
- Coder, reviewer and Genie are guarded by `role-preset-contract.spec.ts`: their packs, permissions and budget are asserted, so change them through the preset files rather than ad-hoc agent patches.

## Authoring notes (checked against code)

- `instructions` must be a non-empty string; empty or whitespace-only fails validation.
- The `capabilities` key in presets maps to the runtime `packs` concept (same value shapes as `references/packs.md`).
- `skills` must name skills that exist in the registry at creation time; missing names are not created and simply never load.
- `budget` omitted → host default `{ maxSteps: 50, policy: "ask" }` for a default ReAct graph.
- A preset may carry its own `graph`, `permissions`, `toolOutput`, `color`, `mcpServers`; `description` and `tags` are accepted extras used only for catalog display.
- Folder layout: `config.json` holds every body field except `instructions`; `instructions.md` holds the prompt; the loader stitches them before validation.
