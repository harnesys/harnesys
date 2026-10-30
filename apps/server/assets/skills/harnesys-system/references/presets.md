# Presets — bundled agent catalog

System presets live in the app bundle (`apps/server/assets/presets/agents/<name>/{config.json, instructions.md}`) and are seeded at every server boot into the machine-level `presets` table with origin `system`, id `harnesys/<name>`. Seeding only inserts new presets and refreshes system rows; user modifications of user-origin presets are never touched. Deleting a bundled preset file removes its row on the next boot.

## Agent presets

| Preset | Role | Packs | Skills | Budget | Purpose |
|---|---|---|---|---|---|
| `assistant` | chief-of-staff | files, shell, web, skills, issues, manager, lsp, mcp, plan, agents, threads, scheduler, webhook, episodic+semantic+knowledge+pin memory, core | agent-creator, workspace-ops, find-skills | 400 steps / 1h / ask | The owner's right hand: configures the workspace, grows the team, plans and runs work. Widest grants. |
| `researcher` | researcher | files, web, plan, agents, threads, all four memory packs, core | agent-creator | 250 steps / 1h / ask | Deep dives and web research; can spawn read-only subagents. |
| `coder` | coder | files, shell, issues, lsp, plan, pin-memory, core | issue-ops | 300 steps / 45m / ask | Implementation work tracked through issues. |
| `reviewer` | reviewer | files, shell, issues, core | issue-ops | 120 steps / 20m / ask | Code review against issue criteria. |
| `tester` | tester | files, shell, plan, core | — | 150 steps / 30m / ask | Verification: runs tests, reproduces bugs. |
| `writer` | writer | files, web, core | — | 150 steps / 30m / ask | Prose and docs; has web search for sources. |
| `planner` | planner | files, plan, threads, core | — | 80 steps / 20m / ask | Decomposes tasks into plans. |
| `general` | helper | files, shell, plan, core | — | 100 steps / 15m / error | Flexible subagent for bounded tasks. |
| `explorer` | scout | files, core | — | 60 steps / 10m / error | Read-only scout: search and report, no shell. |

`explorer` and `general` end with `policy: "error"`: when their budget is gone, the run fails instead of asking. Scope their tasks accordingly.

## Using presets

- `agents_create` with `presetId` instantiates exactly one agent from the preset (name, role, instructions, packs, skills, budget, graph). No extra agents are created implicitly.
- Creating with a `parentId` produces a delegate (level `delegate`); delegates cannot enable the `agents` pack, so preset choice for children must respect that (e.g. `researcher` is not child-safe until its packs are trimmed).
- `agents_list` shows the presets actually available in this installation; the WebUI Presets page shows the same catalog with full bodies.

## Team presets

Team presets (`presets/teams/`) define role sets (roleKey → agentRef → agent preset) plus board automation rules. No team presets ship in the bundle yet; the compose-team flow accepts imported/user presets.

## Authoring notes (checked against code)

- `instructions` must be a non-empty string; empty or whitespace-only fails validation.
- The `capabilities` key in presets maps to the runtime `packs` concept (same object shape).
- `skills` must name skills that exist in the registry at creation time; missing names are not auto-created.
- `budget` omitted → host default `{ maxSteps: 50, policy: "ask" }`.
- Folder layout: `config.json` holds every body field except `instructions`; `instructions.md` holds the prompt; the loader stitches them before validation.
