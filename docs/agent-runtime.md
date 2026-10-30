# Agent runtime — what an agent actually sees and can do

Facts below are taken from the code, with file references. Treat this as the operator/authoring
reference for preset instructions, skills, and tool descriptions. If this document disagrees with
code, code wins — fix the document.

## 1. Boot seeding

On every server start (`apps/server/src/main.ts`):

1. `seedSystemSkills` copies `apps/server/assets/skills/*` into `~/.harnesys/skills/` (existing dirs
   are not overwritten; hash ledger in `.harnesys-seed.json` covers every file in a skill dir, so
   reference-file edits flag updates too — `sha256SkillDir` in `system-skills-seed.ts`). Bundled
   skills today: `find-skills`, `issue-ops`, `workspace-ops`, `agent-creator`, `harnesys-system`.
2. `systemPresetsSeed` reads `apps/server/assets/presets/agents/<name>/` (each preset is a folder:
   `config.json` with all body fields except `instructions`, plus `instructions.md` with the prompt)
   and `assets/presets/teams/*.json` into the machine-level `presets` table with origin `system`, id
   `harnesys/<file-stem>` (`apps/server/src/app/infra/presets/system-presets-seed.ts`). System rows
   that are no longer in the bundle are deleted on boot.
3. `importLegacyUserPresets` imports legacy `~/.harnesys/presets/agents/*.json` as `local/<stem>`
   user presets (`legacy-user-presets.ts`).

`AgentPresetBodySchema` (`packages/contracts/src/presets.ts`): `name`, `role`, `instructions`,
optional `color`, `skills[]`, `mcpServers[]`, `budget`, `capabilities` (pack map), `permissions`,
`graph`. Optional `description`/`tags` wrap the body in the asset files.

`harnesys/coder` and `harnesys/reviewer` are guarded by a role contract
(`apps/server/src/app/infra/agent/role-preset-contract.ts`): required/forbidden capabilities,
permission values, exact `maxSteps`. Team creation validates every role's `agentRef` against it.

## 2. Anatomy of one model call

Everything an LLM sees is assembled in `runLlmGenerate`
(`packages/harnesys/src/application/llm.ts`). System instructions are exactly five parts joined by
`\n\n`, in this order:

| # | Part | Source |
|---|------|--------|
| 1 | Preset prompt | `agent.prompts["main"].instructions` — the preset `instructions`, with `{$expr}` substitution |
| 2 | Channel note | Only for Telegram connector threads (`prepare-org-target.ts` → `CHANNEL_NOTE`) |
| 3 | Skills catalog | `## Available skills` list, one `- name: description (when: when_to_use)` line per allowed skill (`skills/skills-catalog.ts`); capped by `MAX_ENTRIES`/`MAX_CHARS` |
| 4 | Runtime section | `formatRuntimeSection`: host name, host/container, run root + kind, absolute-path rule, workspace lines (worktree / source / directory / scratch), shared sources with knowledge index state, `thread:` paths note |
| 5 | Tools section | Grouped one-liner `group: tool names` per `tool.group`; ends with "Use only capabilities listed here or tools exposed by the deferred tool catalog." |

After the history, tail notes are appended as one `user` message: `Runtime notes (refreshed before
this step):` followed by `<tag>` blocks (`llm-notes.ts`, `assembleNotes`). Current note sources:

| Tag | Producer |
|-----|----------|
| `budget` | steps/tokens/time left, warnings `soon`/`last`, final-step close-out (`budgetNote`) |
| `loop` | loop guard: repeated identical tool calls (`loopNote`) |
| `tools` | deferred tool catalog: `Deferred tools (schemas via load_tools): - name: description` (`tools/exposure.ts`) |
| `core-tools` | core pack: map / wait / ask_user guidance |
| `agent-tools` | agents pack: reuse roster, one-shot delegates, handoff rules |
| `issue-workflow` | issues pack: points to `load_skill("issue-ops")`, board rules via `board_rule_save` |
| `active-plan` | plan pack: full `<active-plan>` block with item ids and next task |
| `pin-memory`, `memory-pin` | pin pack: usage rule + projected pinned facts |
| `semantic-memory`, `memory-semantic` | semantic pack: usage rule + projected facts |
| `episodic-memory` | episodic pack: `recall_search` guidance |
| `knowledge-memory` | knowledge pack: `knowledge_search` → `knowledge_read` guidance |
| github/google | source-status notes when resolution changes (`packs/github/index.ts`, `packs/google/index.ts`) |

Compaction: the last `kind: "compaction"` message becomes a prefix shown as
`[Conversation summary of earlier messages]` before the live history (`projectCompacted`,
`buildRequestMessages`).

There is no other prompt source. In particular:

- Mode `instructions` are **not** injected into the prompt. A mode only affects packs, disabled
  tools, tool exposure (`mode-presets` → `ModeCapabilityFields` → `capability-set.ts`).
- `AGENTS.md` files inside bound sources are collected by the skills walk
  (`apps/server/src/app/infra/skills/skills-walk.ts` → `agentMarkdownPaths`) but are **not**
  injected anywhere today.

## 3. Tool availability pipeline

Per run (`org-runtime-run-target.ts`):

1. The host registers all wired packs (`packs/org-pack-registrations.ts`). Wired pack names:
   `core, files, image, shell, web, lsp, agents, mcp, plan, threads, scheduler, webhook, issues,
   manager, google, github, pin-memory, semantic-memory, episodic-memory, knowledge-memory, skills`.
2. `resolveCapabilitySet` (`capability-set.ts`) grants: host base tools (minus `load_tools`,
   `load_skill`, `Skill`, which are core services), pack tools (first pack wins on name
   collision), minus `disallowedTools` (alias-resolved), adjusted by the active mode (packs,
   `disabledTools`, per-tool `exposure`), minus agents tools in spawn sandbox.
3. `load_tools` + `load_skill` (+ `Skill` alias) are granted only when the agent enables the
   `core` pack and a skills registry exists.
4. Exposure: `direct` tools go into the tools wire section; `deferred` tools appear only in the
   `<tools>` tail catalog until the agent calls `load_tools` with exact names. MCP tools are
   always `deferred` (`mcp/create-mcp-tool.ts`); a mode can defer any tool.
5. Permissions (`allow | ask | deny` per `fs.write`, `process`, `network`, `mcp`) gate execution;
   `ask` produces a HITL approval.

Pack names: `web` is the only web pack (`fetch` and `web_search` were removed as legacy names;
an unknown pack name fails the run target at start).

If a preset omits `capabilities`, the mapper defaults to `{ core, files, shell }`
(`agent-definition.mapper.ts` → `packsFromConfig`).

### Tool inventory by pack (verified tool names)

- `core`: `ask_user`, `map`, `wait`
- `files`: `list_dir`, `glob`, `grep`, `read_file`, `file_read_image`, `edit_file`, `write_file`,
  `extract_file_text`, `write_docx`, `write_xlsx`
- `shell`: `shell`, `process_poll`, `process_kill`
- `web`: `fetch`, `web_search`, `browser_fetch`, `browser`, `browser_close` (managed headless
  browser on an engine sidecar). The pack also ships a pack-level `browser` skill — pack skills
  are not subject to the agent `skills` allowlist (§4).
- `issues`: `issue_board_list`, `source_list`, `board_create`, `board_update`, `board_rule_save`,
  `board_rule_delete`, `board_delete`, `issue_create`, `issue_move`, `issue_update`, `issue_nudge`,
  `issue_get`, `issue_list`, `issue_comment`, `issue_dependency`, `issue_attachment_add`,
  `label_list`, `label_create`, `label_delete`
- `manager`: `manager_pulse`, `usage_report`, `thread_tail`
- `plan`: `plan_save`, `plan_item_update`, `plan_get`
- `agents`: `agents_list`, `agents_create`, `agents_create_subagent`, `agents_spawn`,
  `agents_handoff`, `agents_update`, `agents_delete`
- `threads`: `thread_list`
- `scheduler`: `schedule_set`, `schedule_peek`, `schedule_list`, `schedule_pause`,
  `schedule_delete`
- `webhook`: `webhook_set`
- `google`: `calendar_list_events`, `calendar_create_event`, `calendar_update_event`,
  `gmail_search_messages`, `gmail_read_message`, `gmail_read_thread`,
  `gmail_download_attachment`, `gmail_send_message`
- `github`: `github_list_repos`, `github_get_file`, `github_search_code`, `github_recent_events`,
  `github_issues_list/get/create/comment/close/add_labels`, `github_pr_list/get/diff/create/
  update/review/merge`, `github_ci_workflow_runs`, `github_ci_run_jobs`, `github_ci_rerun`
- `lsp`: `lsp_diagnostics`, `lsp_definition`, `lsp_references`, `lsp_hover`
- `image`: `image_generate`
- `mcp`: `mcp_connect`, `mcp_list`, `mcp_check`, `mcp_toggle`, `mcp_remove`
- memory packs: `pin_set`, `pin_list`, `pin_remove`; `memory_write`, `memory_update`,
  `memory_delete`, `memory_list`; `recall_search`; `knowledge_search`, `knowledge_read`
- `skills`: `search_skills`, `install_skill`, `create_skill`
- core services: `load_tools`, `load_skill` (+ alias `Skill`)

## 4. Skills pipeline

Storage roots, composed by `composeSkillRegistries` (last root wins on name collision):

1. `~/.harnesys/skills/` — system tier, seeded from `apps/server/assets/skills` at boot.
2. `~/.agents/skills/` — host agent tier (`SkillsTierCache.registries()`).
3. `<org dir>/skills/` — org tier (`OrgSkillsAdapter`).
4. Plugin-provided skills.

Per run, if the org setting `skillsSourceAutoLoad` is on, `composeRunSkills` additionally scans
bound sources for `SKILL.md` dirs (`skills-walk.ts`: containers `skills/`, `skills/.curated`,
`skills/.experimental`, `skills/.system`, `.agents/skills`, `.claude/skills`, depth 3; name
dedup ranks container hits first).

`SKILL.md` frontmatter: `name`, `description`, optional `when_to_use`, body = instructions.

Grant model: `effectiveSkillRegistry` filters the fs registry by `agent.skills`
(`packs/pack-run.ts`). `skills: []` or missing means **no fs skills at all**; pack skills are
unaffected. The skills catalog section in the prompt lists only allowed skills, so an agent that
has no grant sees no catalog and `load_skill` fails with `unknown skill`. Thread-level grants
come through `sessionRequested` (`org-runtime-run-target.ts`).

`load_skill(name)` returns `{ instructions, files }`; `load_skill(name, file)` reads a supporting
file from the skill directory (`create-load-skill-tool.ts`).

## 5. Presets → runtime object

`toAgentDefinition` (`agent-definition.mapper.ts`):

- `instructions` becomes `prompts.main.instructions`; the default graph is the ReAct loop
  start → think → act → end (`FALLBACK_GRAPH`) when `graphJson` is absent.
- No budget in config → `{ maxSteps: 50, policy: "ask" }`. `policy` is what happens on
  exhaustion: `ask` (HITL) or `error` (fail the run).
- Creating an agent from a preset creates exactly that one agent — no implicit companions
  (`create-agent-from-preset.use-case.ts`). Org creation additionally seeds one top-level
  `harnesys/assistant` agent when that preset exists (`create-relay-org.use-case.ts`,
  silent skip when absent; failure to seed never fails org creation).

Team presets (`TeamPresetBodySchema`): roles reference agent presets by `agentRef`, plus a board
(columns, dispatch rules) and a digest schedule (`compose-team-plan.ts`,
`create-team-from-preset.use-case.ts`).

## 6. What preset authors get wrong (checked against code)

1. Naming tools that the agent's `capabilities` do not provide. Tool availability derives from
   packs, not from instruction text; the tools section and the wire schema are the only truth.
2. Using pack names that do not exist. There is no `fetch` / `web_search` pack: the only web pack
   is `web`. Unknown pack names fail the run target at start.
3. Assuming bundled skills are available without listing them in `skills`.
4. Assuming `issue_comment` does not exist (it does), or that agents can move their own issues to
   `done` freely (board rules and reviewer workflow own that transition).
5. Assuming delegates can ask the user (`ask_user` is sandbox-blocked for spawned children) or
   spawn (`agents` pack is forbidden for delegates).
6. Assuming mode instructions reach the prompt (they do not — see §2).
