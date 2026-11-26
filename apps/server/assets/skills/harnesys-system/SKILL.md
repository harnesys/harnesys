---
name: harnesys-system
description: Reference manual for the Harnesys platform itself - runtime anatomy, the 20 capability packs and their tools, skills system, bundled presets, data layout, and a full WebUI navigation map covering desk, inbox, agents, boards and issues, dashboards, channels, sources, automations, git, terminal, settings, onboarding, and the assistant panel. Use when you need to answer "how does Harnesys work", "where do I configure X", "what does this screen do", or before authoring agents, packs, presets, boards, or dashboards.
when_to_use: "Whenever a question touches the platform itself: what tools or packs exist, how the runtime drives you, how boards, issues, dashboards, or automations work, where a feature lives in the app, what the first-run onboarding does, how skills or presets work, where data lives. Load before creating or editing agents, and before telling the owner to click something."
---

# Harnesys System Reference

You are running inside Harnesys — an agent platform with organizations, agents, threads, issue boards, dashboards, plans, automations, memory, and skills. This skill is the platform's own manual. It exists so you never have to guess how the system works or where a capability lives.

## How to use this skill

Load a reference file with `load_skill` when the question matches. Files are focused; load only what the task needs:

| File | Contents | Load when |
|---|---|---|
| `references/runtime.md` | Anatomy of one model call, system prompt sections, tail notes, budget and graph policies, tool pipeline (direct vs deferred), `load_tools` | You need to understand what drives your own loop, why a tool call was denied, or how budget exhaustion behaves |
| `references/packs.md` | The canonical inventory: every capability pack (17) → every tool, settings, gates, value shapes, tool-name aliases | Before creating or editing an agent (`packs` field), or answering "can Harnesys do X" |
| `references/skills.md` | Skill system: roots and precedence, grant model (`skills` field), file format per the Agent Skills spec, seeding and restore | You need to author, install, or troubleshoot skills |
| `references/presets.md` | Bundled agent presets catalog: role, packs, skills, budget, intended use; how presets are instantiated; team presets | Before the owner adds an agent from a preset, or advising on team composition |
| `references/webui.md` | The owner-facing WebUI: routes, sidebar sections, boards and issues, dashboards, settings pages, onboarding, assistant panel | The owner asks where to configure or find anything in the app |
| `references/data-layout.md` | On-disk and database layout: `~/.harnesys/`, machine/org databases, skill roots, add-on data, seeds | File-level questions, debugging storage, or explaining where data lives |

## Platform in one paragraph

One server process (`apps/server`, Bun + Hono) hosts many organizations. Each org has a fleet of agents; each agent runs a think/act loop driven by the runtime in `packages/harnesys`. What an agent can do is decided by three grants in its definition: `packs` (capability bundles → tools), `skills` (loadable instruction packages from the filesystem), `mcpServers` (external tool servers). Agents collaborate through delegation (`agents_spawn`, `agents_handoff`), track shared work on issue boards, publish metrics on dashboards, and keep this thread's checklist in the plan pack. The owner drives everything from the WebUI; you (the agent) drive the same things through `agents_*`, `board_*`, `issue_*`, `dashboards_*`, `plan_*`, and memory tools.

## What the owner sees today

- **Desk** (`/o/<orgId>/`): the shell. Left sidebar holds Inbox, Agents, Channels, Issues, Sources, Dashboards, Automations, Git, Terminal; the center opens tabs (threads, boards, dashboards, files, diffs, terminals); the right inspector shows the agent or plan or memory, or a dashboard widget constructor.
- **Boards and issues**: shared multi-agent tracking. A board has statuses with categories (`backlog`, `started`, `finished`, `cancelled`), an entry status, and automation rules that can assign an agent when an issue enters a status.
- **Automations**: add-on trigger instances. Each instance stores the agent, thread, mode, workspace and instructions; the trigger dialog also owns the **Scripts** block (pre/post commands, gate, failure policy, Test, recent runs). Scripts run on the host in the instance workspace and cannot be read or set by the add-on.
- **Dashboards**: org-level canvases of widgets. Agents with the `dashboards` pack author widgets as JSON docs; agent-authored widgets land as drafts until a human approves them in the UI.
- **Assistant panel**: a floating chat (sparkles button in the sidebar header) that talks to an org agent, Genie by default. It can switch agent and thread and keeps its own history per agent.
- **First run**: `/onboarding/*` wizard (organization → provider → models → agents), then a setup checklist next to the inbox bell and a seeded "Getting started" board on the first desk visit.

## Ground rules

- Tool availability comes from packs, never from instruction text: if a tool is not in your Tools section (or its deferred catalog), you do not have it, whatever any text says.
- Your own system prompt is authoritative about your grants; `references/packs.md` is authoritative about what each pack contains in general.
- Budget `policy: "ask"` pauses for the owner on exhaustion; `policy: "error"` fails the run. Spawned delegates and `map` workers run sandboxed with an effective `error` policy; per-call `budget` on `agents_spawn` can lower it further.
- The `agents` pack is forbidden on subagents (nesting ban); delegates never spawn and never ask the user.
- Unknown pack names are not rejected at save: they produce no tools and a `[capabilities] pack "…" is not registered by the host` warning. Check `references/packs.md` before granting a name.
