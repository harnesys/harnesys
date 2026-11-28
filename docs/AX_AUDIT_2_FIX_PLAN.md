# AX Audit #2: Verified Findings and Release Fix Plan

Source: internal AX audit by Genie (thread `e4d9d26a`, 2026-11-28), 12 issues on board `AX Feedback` (`c93cd490`).
Verification: 8 read-only code investigators (`qwen3.8-flash#xhigh`), one per tool family, every claim checked against source. Orchestrator spot-checks of load-bearing claims passed: `resolve-fire.ts:65`, `create-issue-link-tools.ts:70`, `usage-price-source.ts:77`, `constants.ts:40-42`, `resolve-mcp-vault-placeholders.ts:106`.
Result: no finding was fully hallucinated. 8 confirmed, 4 partial (mechanism or framing corrected). The filed P1 is a description defect, not a missing gate. Verification also surfaced 9 defects the audit did not file (section 3).

Implemented 2026-11-28 by 8 parallel zone fixers, one consolidated review pass and one fix pass. See section 9 for results, deferrals and owner actions.

## 1. Verdict table

| Issue | Filed | Verdict | Real priority | What is actually true |
|---|---|---|---|---|
| `2c07fca7` issue_move gate | P1 | Confirmed behavior, wrong framing | P2 contract | Moves are free by design (`create-issue-tools.ts:60,79`). Blockers suppress agent firing, not movement (`resolve-fire.ts:65`). The lie is one sentence in `issue_dependency` (`create-issue-link-tools.ts:70`); auditor misattributed it to `issue_create`. |
| `ef41fc60` packs_tools 64KB | P2 | Confirmed | P2 | Default returns full descriptions of ~130 tools; clip 30000/8000/8000 cuts the middle (`clip-tool-output.ts:108-117`, `constants.ts:40-42`; 63618−16000=47618 matches). Full output also spills to `tool-outputs/` with a pointer, so a file fallback exists (audit missed it). |
| `2991ab66` agents_list instructions | P2 | Confirmed | P2 | `instructions` returned unconditionally for every row (`create-agents-tools.ts:110`), advertised in the description. Design cost, plus an N+1 `deps.agents.get` per row (`:102`). |
| `943aed09` Board validation failed | P2 | Confirmed | P2 | Aggregate `BoardValidationException` (`board.error.ts:4-8`) carries `details.issues`, but the tool funnel keeps only `err.message` (`packs/issues/run-guard.ts:10`). Remote path is worse: relay reduces errors to `HTTP ${status}` (`relay-issue-tracker.port.ts:279-281`). |
| `3f4a682f` widgets_test GET | P2 | Confirmed | P2 | Agent test path raw-casts input, never Zod-parses (`create-widget-tools.ts:165-168`); create parses via `widget-doc-check.ts:49`; REST test parses via controller pipe. Catalog match compares raw `undefined` (`test-widget-source.use-case.ts:32-39`). `widgets_validate` unaffected. |
| `53ede69f` agent-creator skill | P2 | Confirmed | P2 | Skill wrong since introduction (`0d6978b6`). `agents_update` is org-wide by default, `ownDelegatesOnly` is an opt-in pack spec (`create-agent-update-tool.ts:64`); Coder preset opts in, Genie does not. `agents_delete` is always own-delegates (`create-agent-lifecycle-tools.ts:54`). |
| `5f7ddffb` Coder preset dead refs | P2 | Partial | P3 | `coder/instructions.md:12,13,31` hardcodes `in_review`/`tester`/`researcher`. Nothing auto-seeds boards or roster; the `dev` board template has `in_review` (`board-templates.ts:34-41`), `tester`/`researcher` exist only as preset catalog entries. Failures are explicit call-time errors, not silent. |
| `bbe6df2f` usage 0/0 | P2 | Partial | P3 | `unpriced` counts rows with `pricingSource='none'` (`usage.adapter.ts:67`); zero-rate models (Ollama, OpenRouter `:free`, subscription plans, provider-reported 0) are honestly priced at 0. 10M tokens at $0/unpriced 0 is plausible without a bug. Real hole: `?? '0'` defaults classify partially-priced models as fully priced (`usage-price-source.ts:77-78`, `discover/openrouter.ts:83-84`). Description states only one direction of the semantics. |
| `b63658e5` active-plan double tag | P3 | Confirmed | P3 | Plan pack pre-wraps (`packs/plan/index.ts:34,40`), assembler wraps again (`llm-notes.ts:23`). Every other notes provider returns raw text. |
| `10cfb829` map bare items | P3 | Partial | P3 | No overview parameter exists at all; `instruction` IS forwarded end-to-end (`graph-control.ts:34-41` → `graph-map.ts:179-182`) but optional and unadvertised. Bare path gives the worker zero fan-out context (`graph-map.ts:171-187`, `state.messages=[]` at `:199`). No self-contained warning anywhere. |
| `eeb9d00f` polish trio | P3 | Confirmed (all 3) | P3 | (1) NOT_INDEXED names sources by UUID only; name is available one layer down (`org-knowledge.port.ts` already injects `SourceRegistryPort`). (2) model asymmetry wider than filed: listing and create echo both return strings, drop `effort`; update budget schema rejects tuning fields that create silently persists. (3) "No endpoint found" is upstream OpenRouter text passed through bare (`create-image-tools.ts:96-104` decorates only size errors). |
| `e57a2183` brightdata 403 | P3 | External config + platform gap | P3 | 403 is the remote endpoint rejecting the token; owner must refresh credentials. Platform gap confirmed: probe results are ephemeral, no health field in `McpConfigServerSchema` (`contracts/src/mcp.ts:39-53`) or `mcp.json`; UI shows bare `Offline`. Auto-disable does not exist. |

Minor frictions from audit §4 (not filed as issues):

- `terminal_read until`: mechanism inverted by the auditor. Echo is in the matched buffer, so a pattern visible in echo yields premature `matched:true`, not `matched:false` (`read-until.ts:13-16`, `terminal-session-io.ts:53,68`). Real hazards: false-positive early match, ANSI escapes and 80-col wrapping breaking patterns. Fix is documentation.
- `plan_save status:'draft'`: worse than reported. Plan-level status is a dead field: `PLAN_BODY_INPUT` has no status property, the port defaults to `'draft'` (`org-plan.port.ts:30`), nothing ever updates it, 4 of 5 `PLAN_STATUSES` are unreachable, and the notes gate on `completed/cancelled` (`packs/plan/index.ts:77`) is dead code. Decision D2.
- `issue_get.rules:[]`: auditor's semantic guess refuted. `rules` = all rules of the issue's board (`get-issue.use-case.ts:89`), no column filter. `[]` with a non-empty board is only possible via a board lookup miss (dangling `boardId`, runtime data). One-word doc clarification suffices.

## 2. Root causes, grouped

1. **No size contract on listings.** `packs_tools` and `agents_list` emit full config dumps; the generic 30k clip then cuts the middle. At org input:output ~60:1 this is the most expensive defect class.
2. **Error guidance lives in `details`, the tool funnel transports only `message`.** `run-guard.ts:10` keeps `err.message`. The exemplary errors (unknown label, board-not-found, knowledge NOT_INDEXED) embed guidance in the message text; everything else goes blind.
3. **Multiple ingestion paths, one contract, partial parsing.** widgets_test is the third path for `WidgetSourceSchema` and the only parse-free one. Same pattern: agent model/budget projections shaped independently from input schemas.
4. **Static prose contracts drift from code.** Skill text, preset instructions, and one tool description were never synced after behavior changed. CI already has the cure for one skill (`skills:check` generates widget-creator references from code); the pattern does not extend to the others.
5. **Probe/check results are discarded.** MCP health, fire suppression, and partial pricing all produce signals that no read model persists.

## 3. Defects found during verification (not filed by the audit)

| # | Defect | Evidence | Priority |
|---|---|---|---|
| N1 | Relay drops server error body; remote workers see `worker org operation failed: HTTP 400` with no message | `relay-issue-tracker.port.ts:279-281` | P2 |
| N2 | Open blockers suppress even an explicit assignee, silently; result still says `reason:'override'` with `agentId:null`; `issue-ops/SKILL.md:25` claims explicit assignee overrides rules | `resolve-fire.ts:65-69` | P2, decision D1 |
| N3 | `board_rule_save` conditions enum exposes only `has_label`; the engine and UI support `has_open_blockers`, agents cannot configure it | `create-issue-meta-tools.ts:248` vs `rule-engine.ts:97-98`, `contracts/src/boards.ts:97-101` | P3 |
| N4 | Partial pricing metadata defaults missing prompt/completion to `'0'` and marks the model catalog-priced at zero | `usage-price-source.ts:77-78`, `discover/openrouter.ts:83-84` | P3 |
| N5 | Missing vault key at runtime resolves to empty string and the request goes out unauthenticated; `mcp_check` aborts on the same condition | `application/mcp/resolve-mcp-vault-placeholders.ts:104-108` vs `org-mcp-manage.port.ts:156-158` | P2 |
| N6 | `agents_update` description self-contradicts under `ownDelegatesOnly`; `AGENT_ID_INPUT` says "Delegate id or name" although any agent is acceptable by default | `create-agent-update-tool.ts:11,87-97` | P3 |
| N7 | `agents_create` budget schema lacks `additionalProperties:false`; `agents_update` rejects tuning fields; patch replaces `budgetJson` wholesale | `create-agents-tools.ts:174-184`, `create-agent-update-tool.ts:118-133`, `org-agents-catalog.port.ts:194-196` | P3 |
| N8 | Plan-level status dead field (see §1 frictions) | `org-plan.port.ts:30`, `constants.ts:189-195` | P3, decision D2 |
| N9 | `agents_list` performs `deps.agents.get` per row (N+1) | `create-agents-tools.ts:102` | P4 |

## 4. Fix waves

### Wave 1: context economy

#### W1.1 packs_tools compact default (`ef41fc60`)
Seam: `packages/harnesys/src/packs/agents/packs-tools-tool.ts`. Default result: per source, pack identity + tool names + enabled state, no descriptions. Full descriptions via `pack` filter or `detail:true`. Contract surfaces (tool description, pack meta, `packs.md`, `agent-creator/SKILL.md`) updated in the same diff. Compact result self-advertises the opt-in via a `note` field.
Spec: `packs-tools.spec.ts` — default shape has no description prose; filtered/detail shapes do.

Verification prompt:
```
Call packs_tools with no arguments, then packs_tools with pack:"issues".
PASS: first result lists packs with tool names only (no description strings), includes a note naming pack:"<source>" and detail:true, no "chars omitted" marker; second result includes full descriptions for the issues tools.
FAIL: first result contains any tool description text, or either result shows a "chars omitted" marker.
```

#### W1.2 agents_list compact default (`2991ab66`, N9)
Seam: `packages/harnesys/src/packs/agents/create-agents-tools.ts`. `instructions` omitted by default; included when a role/name filter isolates one agent or with `verbose:true`. N+1 removed via `AgentsCatalogPort.listDefinitions?` (batched server implementation; per-row `get` kept as fallback when the port lacks the method).
Spec: `create-agents-tools.spec.ts` — omits instructions by default, includes for single-name filter and `verbose:true`.

Verification prompt:
```
Call agents_list with no arguments, then agents_list with name set to your own agent name.
PASS: first result has no instructions field on any entry; second result has exactly one entry with full instructions.
FAIL: any entry in the first result carries instructions text.
```

#### W1.3 model and budget wire unification (`eeb9d00f` part 2, N7)
One owner of the agent wire format: the object `{provider, model, effort?}` in listings, create echoes and update patches (`AgentCatalogModel`); effort persists through patches. Budget: shared `budget-json-schema.ts` module feeds `agents_create`, `agents_create_subagent` (policy enum `["error"]`) and `agents_update`; tuning fields (`warnAtSteps`, `closeOnExhaustion`, `extendDefaultPct`) accepted everywhere, `additionalProperties:false` everywhere; `validateBudgetTuning` shared with the patch collector.
Spec: roundtrip listing → update passes the real Ajv path and persists.

Verification prompt:
```
Call agents_list, take any delegate's model and budget objects verbatim, and call agents_update on that delegate with model and budget copied unchanged.
PASS: update succeeds; a follow-up agents_list shows the same model object (provider/model fields) and budget values.
FAIL: validation error on model or budget, or any budget field disappears after the patch.
```

### Wave 2: contract honesty

#### W2.1 issue_dependency sentence, fire-suppression visibility, rule condition enum (`2c07fca7`, N2, N3)
Implemented per D1 (free transitions preserved):
1. `issue_dependency` description reworded: blockers suppress agent firing on entry to started columns; the move itself is allowed.
2. Suppression made visible: `ResolvedFire` carries `fireBlockedByBlockers` computed once in `resolve-fire.ts` (one owner); move and create results carry `fireSuppressed { blockers: [{id,title}], message }` through contracts → ports → relay → tool rendering; `issue_move` batch result reports `suppressed`.
3. `issue-ops/SKILL.md` Blockers/Override rows rewritten to the same semantics.
4. `board_rule_save` conditions derive from `RULE_CONDITION_TYPES` (all five engine conditions including `has_open_blockers`), no retyped enum.
Hard move-rejection gate rejected: contradicts three "transitions are free" contracts and breaks UI drag-and-drop on the same endpoint.

Verification prompt (post-review field names):
```
Create a scratch board with statuses todo/in_progress/done (board_create), create issues A and B on it,
link A blocked-by B (issue_dependency), then issue_move A to in_progress with assigneeAgentId set.
Read the issue_dependency description before starting.
PASS: description says blockers suppress agent firing (not movement); the move succeeds and its result
carries fireSuppressed with blockers [{id,title of B}] and a message containing "no agent was fired";
a move with statusKey "no_such_status" fails with "unknown statusKey: … (board statuses: …; see issue_board_list)";
board_rule_save accepts a condition {type:"has_open_blockers", value:true}.
FAIL: description still says "gate moving into work columns", fireSuppressed absent on the blocked move,
the unknown-status error lacks the key names, or has_open_blockers is rejected by board_rule_save.
Cleanup: board_delete the scratch board.
```

#### W2.2 UnknownBoardStatusException + relay error propagation (`943aed09`, N1)
`UnknownBoardStatusException` (`board.error.ts`): message `unknown statusKey: <key> (board statuses: <keys>; see issue_board_list)`, details `{statusKey, availableKeys}`, errorCode `UNKNOWN_BOARD_STATUS` mapped to 400 in the brix filter; thrown from all former aggregate sites (status update, create, commit). Relay port propagates the server error body (`HTTP <s> <errorCode>: <message>`) instead of the bare status line.
Spec: unknown-status message contains key + available keys (move and create paths).

Verification prompt:
```
Call issue_move on any issue with statusKey "no_such_status".
PASS: error text contains "no_such_status" and lists the board's actual status keys.
FAIL: error text is exactly "Board validation failed" or contains no status key names.
```

#### W2.3 widgets_test parses at the use-case entry (`3f4a682f`)
`TestWidgetSourceUseCase.execute` parses `WidgetSourceTestBodySchema` at entry (the same schema the REST route pipe uses); the pack port forwards `source: unknown` (no `as never`, no type-lie interface); catalog error prints the effective method. `widgets_validate` unaffected, left as is.
Spec: method-less orgApi source tests as GET.

Verification prompt:
```
Call dashboard_widgets_test with source {kind:"orgApi", id:"threads", path:"/orgs/<your orgId>/threads"} and no method field.
PASS: result validates against the catalog (no error), or any error prints "GET", never "undefined".
FAIL: error contains "matches undefined".
```

#### W2.4 agent-creator skill sync + agents_update description (`53ede69f`, N6)
Skill §1 rewritten: update org-wide by default with the `ownDelegatesOnly` pack-spec narrowing, delete always own-delegates, verified patch field list. Tool side: description composed spec-conditionally (no "Patch any agent" contradicting a suffix), `AGENT_ID_INPUT` says "Agent id or name from agents_list". No code restriction added.

Verification prompt:
```
Load the agent-creator skill and read its agents_update/agents_delete section, then read the agents_update tool description.
PASS: skill says update is org-wide by default with an ownDelegatesOnly opt-in, and delete is own-delegates-only; tool description matches your actual scope without contradicting itself.
FAIL: skill still says update works only on own delegates.
```

#### W2.5 Coder preset conditional phrasing (`5f7ddffb`)
Per D5: preset instructions prose made conditional (review column via `issue_board_list`, roster via `agents_list`, delegates via `agents_create`); same treatment for reviewer/researcher/planner presets. No env-slot machinery.

### Wave 3: polish and observability

#### W3.1 active-plan single wrap (`b63658e5`)
Pre-wrap removed from `activePlanText` (`packs/plan/index.ts`); `assembleNotes` stays the only tag owner.
Verification prompt:
```
Save a plan with plan_save (one item), then inspect the runtime notes block on your next step.
PASS: exactly one opening <active-plan> tag and one closing tag, no nesting.
FAIL: <active-plan> appears twice consecutively.
```

#### W3.2 map context contract (`10cfb829`)
Per D3 (description-only): `MAP_TOOL_DESCRIPTION` and the `items` schema state worker isolation (item text only, no thread history, no fan-out goal), self-contained items, and `instruction` as the shared-context channel; core-tools note and `packs.md` match. No speculative overview parameter.

#### W3.3 knowledge errors name the source (`eeb9d00f` part 1)
`KnowledgePort.sourceNames(ids)` implemented in `OrgKnowledgePort` via the injected `SourceRegistryPort`; `sourceNotShared`/`sourceNotIndexed`/`noSharedSourceIndexed` render `"<name>" (<id>)` with an id-only fallback; owner setup steps preserved; port call happens only on error paths.

#### W3.4 image_generate endpoint hint (`eeb9d00f` part 3)
`endpointErrorHint` in `create-image-tools.ts` (matcher `/no endpoint|not found for model|unsupported model|404/i`) appends provider-agnostic guidance naming the Image pack settings and the Models page; spec covers presence and absence.
Note (execution): this hunk landed in a file a parallel session was also editing; see §9 for its commit placement.

#### W3.5 pricing honesty (`bbe6df2f`, N4)
Per D6: `?? '0'` defaults removed in `usage-price-source.ts` and `discover/openrouter.ts` (a half price pair resolves to `none`, i.e. unpriced; explicit zeros stay priced); `zeroPriced` aggregate added through adapter SQL → contracts DTO → port → `usage_report`; description states the full semantics; imprecise comment fixed.
Spec: partial metadata → none; explicit zero → catalog-priced; full pair → computed cost.

#### W3.6 MCP health surfacing + vault fail-fast (`e57a2183`, N5)
Per D4 (surface, no auto-disable): `lastCheck {at, connected, error?}` persisted on the `mcp.json` entry by the manage port after health probes (best-effort, probe result unaffected), exposed via `McpConfigServerSchema` → REST → webui (Offline now shows the reason) and `mcp_list`. Vault: `resolveMcpVaultJson` reports skipped servers; the plugin runtime emits an `mcp_vault_key_missing` plugin diagnostic; org-config connects abort with the named-key error; descriptions match.

Verification prompt:
```
Call mcp_check on a configured server, then mcp_list.
PASS: the entry carries lastCheck with the check timestamp and outcome (error text on failure).
FAIL: mcp_list shows enabled/connected with no lastCheck.
```

#### W3.7 terminal until and issue_get.rules documentation
`terminal_read` description and pack meta document the raw-stream match semantics (echo + ANSI included, anchor to output). `issue_get.rules` semantics confirmed as all-board-rules; wording kept, board-missing marker deferred (runtime-data-dependent).

#### W3.8 plan-level status (N8)
Per D2: `derivePlanStatus(items)` in `OrgPlanPort` — empty/all-pending → `draft`, all settled (`completed`/`cancelled`) → `completed`, otherwise `in_progress`; recomputed on save and item updates, notes gate reads it, dead `status` input parameter removed from `PlanPort.save`.

## 5. Decision points (resolved as recommended)

| # | Question | Resolution |
|---|---|---|
| D1 | issue_move gate semantics | Free transitions kept; suppression visible via `fireSuppressed`; docs/skill corrected. |
| D2 | Plan status | Derived from item states (`derivePlanStatus`); field kept alive instead of deleted. |
| D3 | map overview | Description-only; `instruction` remains the context channel. |
| D4 | MCP dead servers | Surface `lastCheck` + vault fail-fast; auto-disable rejected as a product decision. |
| D5 | Preset dead refs | Conditional prose + self-discovery tools; env slots deferred. |
| D6 | usage 0/0 | Both code parts (`?? '0'` removal + `zeroPriced`) plus description semantics. |

## 6. System track

1. **Error guideline** → `docs/TOOL_CONTRACT_GUIDELINES.md`: every agent-facing error embeds guidance in the message text (what is wrong → exact invalid name → next step), because `run-guard` transports only `message`; exemplars listed; misconfiguration never masquerades as emptiness.
2. **Contract CI**: `scripts/gen-widget-skill-refs.ts` + `skills:check` remains the generate-from-code precedent; extending it to agent-creator/issue-ops sections is deferred (see §9) — the guidelines doc carries the rule meanwhile.
3. **Compact-by-default policy** → in the guidelines doc: decision fields kept, prose bodies opt-in, default listings must fit under `DEFAULT_TOOL_OUTPUT_MAX_CHARS`; W1.1/W1.2 are the reference applications.

## 7. Do not touch (verified good)

- Batch tools with per-entry `failed` (issues/labels/comments/files).
- Dry-run surfaces: `automation_script_test`, `widgets_validate`, delete `dry_run` with next-step hints.
- `toolUse.unused` + `caps` in spawn results; quota/budget/closingStep child accounting.
- Knowledge NOT_INDEXED owner steps, unknown-label and board-not-found messages, Chrome-warning fix command.
- `mcp_list` stale-`connected` caveat note.
- Browser `read` without session (previous audit's fix).
- `widgets_validate` parsing path.

## 8. Execution model

Fan-out per zone (Z1 agents, Z2 issues, Z3 dashboards, Z4 prose, Z5 runtime/plan/map/terminal, Z6 knowledge/image, Z7 usage, Z8 MCP), disjoint file lists, scoped biome + scoped specs per agent, no per-agent boot (shared tree; the orchestrator runs the final gates: full typecheck, lint, test suite, one-off DI boot, `skills:check`). Review: one consolidated read-only pass over the whole diff (regression chains, contract honesty, dead fields, heuristics, layers, info sufficiency, do-not-touch), then one fix pass applying all findings.

## 9. Execution results (2026-11-28)

Gates at branch tip: `bun run typecheck` clean (all packages); `bun run lint` clean (including two pre-existing `noNestedTernary` errors in `apps/webui/src/shared/ui/attachment-tile.tsx`, fixed as a CI-blocker side-carry, unrelated to the audit); `bun test` 3184 pass / 0 fail; one-off server boot clean (DI resolves, seeds OK); `bun run skills:check` fresh.

Review-pass deltas beyond section 4:
- `fireSuppressionForBlockers` reads the domain fact `ResolvedFire.fireBlockedByBlockers` instead of re-deriving the condition (one owner).
- `DashboardsPackPort.testSource(orgId, source: unknown)`; parsing lives only in `TestWidgetSourceUseCase.execute`.
- Budget schema single-owner module `packages/harnesys/src/packs/agents/budget-json-schema.ts`; subagent budget policy enum restricted to `error` with tuning fields and `additionalProperties:false`.
- `agents_list` N+1 removed via optional `listDefinitions` (batched server implementation, per-row fallback).
- `packs_tools` compact result carries a self-advertising `note`.
- Plugin-origin vault-key skips emit `mcp_vault_key_missing` diagnostics; `mcp_check` description states the real failure surface per path.
- `UNKNOWN_BOARD_STATUS: 400` added to the brix error map; REST status route typed `{ issue: UpdateIssueStatusResponse }`.
- Dead `status` parameter removed from `PlanPort.save`.

Parallel-session note: a concurrent agent in this repo landed commits `06e6db46` (image size enumeration) and `653c5bde` (schema hoisting) and holds uncommitted DashScope/model-execution work; its files were excluded from this branch's commits. The W3.4 `endpointErrorHint` hunks in `packages/harnesys/src/packs/image/*` are interleaved with that session's in-flight edits and are committed separately once their work lands.

Explicitly deferred (owner-visible):
1. Extend generated-contract CI beyond widget-creator references (§6.2).
2. WebUI usage view `zeroPriced` badge (`apps/webui/src/entities/usage/model/usage.ts` defines its own row type; field is additive).
3. `PLAN_STATUSES` members `approved`/`cancelled` kept for stored rows; derivation never emits `cancelled`.
4. MCP auto-disable (rejected in D4).
5. `SqliteKnowledgePort` dead wiring — removal is a user decision.
6. `board-rule-condition-row.tsx` keeps its hand-typed UI condition list (pre-existing; agent side now derives from `RULE_CONDITION_TYPES`).

Owner actions outside the repository:
1. brightdata MCP: refresh the token/subscription (the 403 is the remote endpoint rejecting credentials).
2. Re-run model discovery per org after deploy: catalog rows written by old discovery contain fabricated `"0"` prices that stay priced-at-zero until refreshed.
3. Run the section 4 live verification prompts in a platform-agent thread on the dev stand before closing the AX Feedback board issues.