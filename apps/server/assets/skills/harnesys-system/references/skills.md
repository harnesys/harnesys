# Skills system — roots, grants, format

## What a skill is

A skill is a directory with a `SKILL.md` (YAML frontmatter: `name`, `description`, optional `when_to_use`; then a markdown body of instructions) plus optional reference files. Follows the Agent Skills spec (agentskills.io): the catalog in your system prompt shows only metadata; `load_skill` loads the body; reference files load on demand via `load_skill_file` paths relative to the skill root. Keep one level of references; bodies under ~500 lines.

## Roots and precedence

Load order, later overrides earlier by skill `name`:

1. **System**: `~/.harnesys/skills/` — seeded at server boot from the app bundle (`apps/server/assets/skills/`). Seed copies new skills only; the WebUI shows an "update available" flag when the bundled copy's content hash differs from the installed one, and Restore re-copies the bundle over the installed dir.
2. **Workspace**: `<workspace>/.harnesys/skills/` — per-project skills, editable by agents with file tools.
3. **`~/.agents/skills/`** — cross-tool shared dir (compatible with other agent tools).
4. **Org dir** (managed via the WebUI Skills page), **plugins**, and **source-autoload** skill sources.

The registry scans roots at server start; a workspace skill added mid-session needs a reload (the WebUI Skills page triggers one) or a fresh run.

## Grant model (the `skills` field)

- An agent definition has `skills: string[]`. **Missing or empty = no filesystem skills**: `load_skill` fails for every name.
- Presets must list bundled skill names explicitly for them to load. Bundled today: `agent-creator`, `workspace-ops`, `issue-ops`, `find-skills`, `harnesys-system`.
- A pack may also grant its own skill (e.g. the `web` pack ships a `browser` skill) — pack skills bypass the agent's `skills` allowlist.
- Referencing a nonexistent skill name does not fail creation; it just never loads. Check `skills_list` / the registry before granting.

## Authoring a workspace skill

```
<workspace>/.harnesys/skills/my-skill/
  SKILL.md          # required: frontmatter + body
  references/       # optional: extra docs loaded on demand
```

- `name`: lowercase letters, digits, hyphens; must match the directory name; max 64 chars.
- `description`: what it does + when to use, with concrete keywords — this is all the catalog shows.
- Body: imperative instructions, checklists, exact tool names. Reference other files by relative path, one level deep.

Bundled skills are the style reference: read `agent-creator/SKILL.md` before writing your own.

## Finding and installing more

`find-skills` (bundled) searches known skill sources and explains installation into the workspace root. Ecosystem skills written for other harnesses usually reference foreign tool names (e.g. `Bash`, `Read`) — port by rewriting tool names to Harnesys equivalents (`shell`, `read_file`) before installing.
