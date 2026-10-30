---
name: harnesys-system
description: Reference manual for the Harnesys platform itself - runtime anatomy, capability packs and tools, skills system, bundled presets, WebUI navigation, data layout. Use when you need to answer "how does Harnesys work", "where do I configure X", or before authoring agents, packs, or presets.
when_to_use: "Whenever a question touches the platform itself: what tools/packs exist, how the runtime drives you, where things are configured in the WebUI, how skills or presets work, where data lives. Load before creating or editing agents."
---

# Harnesys System Reference

You are running inside Harnesys — an agent platform with organizations, agents, threads, issues, plans, schedules, memory, and skills. This skill is the platform's own manual. It exists so you never have to guess how the system works or where a capability lives.

## How to use this skill

Load a reference file with `load_skill` when the question matches. Files are focused; load only what the task needs:

| File | Contents | Load when |
|---|---|---|
| `references/runtime.md` | Anatomy of one model call, system prompt sections, tail notes, budget and graph policies, tool pipeline (direct vs deferred), `load_tools` | You need to understand what drives your own loop, why a tool call was denied, or how budget exhaustion behaves |
| `references/packs.md` | The canonical inventory: all 21 capability packs → every tool with its description, value shapes, legacy aliases | Before creating or editing an agent (`packs` field), or answering "can Harnesys do X" |
| `references/skills.md` | Skill system: roots and precedence, grant model (`skills` field), file format per the Agent Skills spec, seeding and restore | You need to author, install, or troubleshoot skills |
| `references/presets.md` | Bundled agent presets catalog: role, packs, skills, budget, intended use; preset-to-agent mapping; team presets | Before `agents_create` from a preset, or advising the owner on team composition |
| `references/webui.md` | The owner-facing WebUI: navigation map, every settings page and form field, click paths, quick answers | The owner asks where to configure or find anything in the app |
| `references/data-layout.md` | On-disk and database layout: `~/.harnesys/`, machine/org databases, threads, memory stores, seeds | File-level questions, debugging storage, or explaining where data lives |

## Platform in one paragraph

One server process (`apps/server`, Bun + Hono) hosts many organizations. Each org has a fleet of agents; each agent runs a think/act loop driven by the runtime in `packages/harnesys`. What an agent can do is decided by three grants in its definition: `packs` (capability bundles → tools), `skills` (loadable instruction packages from the filesystem), `mcpServers` (external tool servers). Agents collaborate through delegation (`agents_spawn`, `agents_handoff`) and coordinate work through issues and plans. The owner drives everything from the WebUI; you (the agent) drive the same things through `agents_*`, `schedule_*`, `plan_*`, and memory tools.

## Ground rules

- Tool availability comes from packs, never from instruction text: if a tool is not in your Tools section, you do not have it, whatever any text says.
- Your own system prompt is authoritative about your grants; `references/packs.md` is authoritative about what each pack contains in general.
- Budget `policy: "ask"` pauses for the owner on exhaustion; `policy: "error"` fails the run. Subagents always run with `policy: "error"`.
- The `agents` pack is forbidden on subagents (nesting ban); delegates never spawn.
