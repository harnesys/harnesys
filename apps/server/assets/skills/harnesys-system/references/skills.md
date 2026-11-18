# Skills system — roots, grants, format

## What a skill is

A skill is a directory with a `SKILL.md`: YAML frontmatter plus a Markdown body of instructions, and optional supporting files. The format follows the Agent Skills spec. `parseSkillFile` (`packages/harnesys/src/application/skills/parse-skill-file.ts`) requires:

- `name` — non-empty string.
- `description` — non-empty string.
- `when_to_use` (or `whenToUse`) — optional string.
- A non-empty Markdown body.

A `SKILL.md` that fails parsing is skipped from the catalog. The catalog in the system prompt shows only `name: description (when: when_to_use)`; bodies load on demand.

## Roots and precedence

At run time the skill registry is composed in this order (`composeSkills` in `apps/server/src/app/infra/plugins/plugin-runtime.adapter.ts`, then `composeRunSkills`):

1. **System** — `~/.harnesys/skills/`, seeded from `apps/server/assets/skills/` at every boot.
2. **Host** — `~/.agents/skills/`, shared with other agent tools; read-only in the app.
3. **Org** — `~/.harnesys/orgs/<orgId>/skills/`, managed from the Skills settings page or `create_skill`.
4. **Plugins** — skill components contributed by installed plugins, exposed as `plugin:skill` names.
5. **Sources** — skill directories discovered in connected repositories: `skills/`, `skills/.curated`, `skills/.experimental`, `skills/.system`, `.agents/skills`, `.claude/skills`. Gated by the org setting `skillsSourceAutoLoad` (default `true`); with it off, source skills still appear on the Skills page but are not part of the run registry.

Later registries win on a duplicate `name`; `load` resolves from the last registry backwards. A request like `my-skill` also matches a single `<prefix>:my-skill` name; several matches fail as ambiguous.

System seeding compares the installed directory hash with the bundled one and **overwrites the installed copy when they differ**. Do not edit system skills in place; create an org skill instead. The Skills page shows "Reset to bundled" when a runtime edit drifted from the seed marker.

## Grant model (the `skills` field)

- An agent has `skills: string[]`. Omitted or empty means **no filesystem skills**: `load_skill` fails for every name.
- The allowlist filters roots 1–5 only. Pack-granted skills bypass it: the `web` pack ships `browser`, the `dashboards` pack ships `dashboards-widget-authoring` (a pointer that expects the filesystem skill `widget-creator` to be granted as well).
- Referencing a nonexistent skill does not fail agent creation; it simply never loads. Confirm the name on the Skills page before granting it.
- `load_skill` input is `{ name }` to get instructions plus the supporting-file list, or `{ name, file }` to read one `references/...` file. There is no separate `load_skill_file` tool.

## Bundled skills

Seven ship in `apps/server/assets/skills/`: `agent-creator`, `addon-creator`, `find-skills`, `harnesys-system`, `issue-ops`, `widget-creator`, `workspace-ops`.

| Skill | Use |
|---|---|
| `agent-creator` | Graphs, packs, budgets, HITL and agent-authoring traps before `agents_create`. |
| `workspace-ops` | Workspace-level operations: agent catalog, packs, skills, memory, delegation. |
| `issue-ops` | Board dispatch cycle, rules, issue workflow recipes. |
| `widget-creator` | Dashboard WidgetDoc contract, catalog, recipes, validation. |
| `addon-creator` | Authoring an add-on package. |
| `find-skills` | Finding and installing skills from known sources. |
| `harnesys-system` | This manual. |

`agent-creator` is the style reference for writing a new skill.

## Authoring and installing

An org skill lives at `~/.harnesys/orgs/<orgId>/skills/<name>/SKILL.md` (plus `references/`, plus an optional `.harnesys-skill.json` sidecar recording the install URL).

- `name`: kebab-case matching `^[a-z0-9][a-z0-9-]*$`; for skills created through the API the directory name is the skill name.
- `description`: what it does and when to use it, with concrete keywords — this line is all the catalog shows.
- Body: imperative instructions, checklists, exact tool names. Keep references one level deep.
- Create through the Skills page (name, description, when-to-use, instructions) or the `create_skill` tool.
- Install from git through the `install_skill` tool or the page's install dialog (discover → install → update); the sidecar drives the "Update" action.
- The Skills page reload button (`POST /orgs/:orgId/skills/reload`) re-scans roots without a server restart.

## Porting foreign skills

Ecosystem skills written for other harnesses reference foreign tool names. Rewrite them before installing: `Read`→`read_file`, `Write`→`write_file`, `Edit`→`edit_file`, `Glob`→`glob`, `Grep`→`grep`, `LS`→`list_dir`, `Bash`→`shell`, `WebFetch`→`fetch`. `TodoWrite`, `WebSearch`, `NotebookEdit`, `Task` and similar have no Harnesys equivalent.
