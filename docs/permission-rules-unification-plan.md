# Permission Rules Unification Plan

Status: complete. Decision: option A (unified Rules store), phased; "Always" stays in ask prompts and writes rules.

## Progress

- [x] Phase 1: unified Rules pane (`agent-rules-pane.tsx`: File paths + Shell commands + Operations in one list, add/revoke); tabbed `agent-always-allowed-pane.tsx` deleted
- [x] Phase 1: shell allowlist/blocklist editing moved from Capabilities pack settings into Rules; Shell pack settings keep timeout only
- [x] Phase 1 exit checks: `tsc --noEmit`, `biome check` clean, `bun test` 1651 pass
- [x] Phase 2.1: `PermissionRule` contract in `@harnesys/contracts` (`packages/contracts/src/permission-rules.ts`: kind/pattern/effect/agentId/hostId/action/decidedBy/createdAt; list/create payloads)
- [x] Phase 2.2: `permission_rules` table (`org-sqlite/schema/permission-rules.ts`) + `PermissionRuleStorePort` (`domain/permissions/permission-rule-store.port.ts`) + uniqueness `permission_rules_identity_idx`; migration `org-sql-permission-rules.ts` backfills `file_access_rules`, `permission_grants`, shell spec allowlist/blocklist from agents.config and mode_presets.packs_json and drops both legacy tables; `INSERT OR IGNORE` + unique index keep re-runs no-op
- [x] Phase 2.3: shell gate reads allow/deny patterns through the port (runtime rule lookup in `infra/runtime/org-runtime-permission-rules.ts`, `org-runtime-run-target.ts`); `applyPermissionGate` resolves op rules from `PermissionRuleStorePort`
- [x] Phase 2.4: writers unified — `persist-decision.ts`/`persist-file-rule.ts`/`persist-shell-rule.ts` and `record-operation-rules.ts` write single-shape rules; grant/revoke/file-rule APIs replaced by `permission-rules` endpoint (`list-permission-rules.use-case.ts`, create/revoke use-cases)
- [x] Phase 2 exit checks: `tsc --noEmit` clean, `biome check .` clean, `bun test` 801 pass; gate-order tests in `packages/harnesys` (`shell-gate.spec.ts`, `tool-permission.spec.ts`); backfill idempotency in `org-sql-permission-rules.spec.ts`; boot check via live `bun --watch` stand (`/api/health` 200)

## Phase 2 Pre-Work Questionnaire (HARNESS_CHANGE_CRITERIA §6.1)

1. **Problem**: durable permission exceptions live in three stores (file rules table, shell spec in agent/mode config, `permission_grants`) with different APIs and UI; "what is this agent allowed to do" has no single answer, and revoking an always-allow requires knowing which of three places owns it.
2. **Bad scenario today**: user grants "Always allow" for a shell command, then cannot find it in the UI (it hides in Capabilities draft); mode-preset shell rules are invisible in the agent dialog; op grants were invisible until this branch.
3. **Success criterion**: one `permission_rules` table is the only durable exception store; UI Rules list and all runtime gates (file access, shell gate, op gate) read from it; "Always" in any ask lands there; revoke in UI makes the gate ask again after restart.
4. **Improved resource**: predictability (C8 round-trip: UI → API → storage → gates → UI, single source of truth); task success (user can grant and revoke correctly); moves (fewer wrong-path edits).
5. **Possibly degraded**: none directly; migration risk (see Risks) could break shell matching if command-glob semantics drift — mitigated by reusing `firstMatchingCommandPattern` and gate-order tests.
6. **Gain > loss**: C8 violation (three sources of truth for one concept) is a standing correctness defect; migration is mechanical and covered by idempotency tests.
7. **Criteria affected**: C8 (improved), C6 (same policy applied to all rule kinds), C7 (rules capped by unique keys + revoke; no growth without user action).
8. **Offloads/pointers**: none. No files, no truncation, no agent-facing pointers introduced; agents see gate outcomes only.
9-11. **Re-read rate**: not applicable (no offload).
12. **Tests**: gate order (deny-rule > allow-rule > posture deny > ask), command-glob preservation, backfill idempotency (agents + mode presets), ask "Always" writes exactly one row, revoke re-enables the ask. Boot check for DI.

## Problem

Durable permission exceptions live in three parallel mechanisms with three storages, three APIs, and three UI surfaces:

| Mechanism | Storage | API | UI |
|---|---|---|---|
| File rules (path glob, read/edit, allow/deny) | sqlite `file_access_rules` via `FileAccessRulePort` | `orgs/:orgId/file-rules` | `agent-rules-pane.tsx` |
| Shell allowlist/blocklist (command glob) | agent config `capabilitiesJson.shell.spec` | agent update (draft save) | Capabilities → Shell pack settings (`pack-settings.tsx`) |
| Operation grants (always-allow per op) | sqlite `permission_grants` via `PermissionGrantStorePort` | `orgs/:orgId/permission-grants` | `agent-always-allowed-pane.tsx` (tabs) |

On top of that: posture gates (`permissionsJson`: allow/ask/deny per op, also per mode preset) and per-source access levels. Answering "what is this agent allowed to do" requires walking all of the above.

## Target model

One decision pipeline per risky action:

```
deny (posture deny or deny-rule)  >  rule match  >  posture allow  >  ask
                                                        ask answer: once | this run | always -> new rule row
```

- **Posture**: unchanged. Five ops (`fs.write`, `process`, `network`, `mcp`, `agents`), allow/ask/deny, per agent and per mode preset.
- **Rules**: the single exception store. One row shape: `{ kind: 'fs-path' | 'shell-cmd' | 'op', pattern, effect: 'allow' | 'deny', agentId | null, decidedBy, createdAt }`. `pattern` is a path glob, a command glob, or an operation name, discriminated by `kind`. `agentId: null` means org-wide (file rules already work this way).
- Ephemeral grants (once, this run, per-call checkpoints) stay runtime state, never rendered as rules.

## Phase 1: UX only (no data migration)

One "Rules" section in Access & security replaces three surfaces:

- Delete the tabbed `agent-always-allowed-pane.tsx` and the separate file-rules pane body; one pane, rows grouped by kind: File paths, Shell commands, Operations.
- Add-rule form: kind selector (File path / Shell command), pattern input, effect (allow/deny), plus read/edit for file kind and agent/org scope for file kind. Operations are not manually addable: they appear only from "Always" answers (a manual op-allow duplicates the posture toggle).
- Shell rows in phase 1 read/write the capabilities draft (`capabilitiesJson`), same as today's pack settings; allowlist renders as `allow` rows, blocklist as `deny` rows.
- Remove Allowlist/Blocklist fields from Shell pack settings (`pack-settings.tsx`); timeout and other spec fields stay there.
- Files touched: `apps/webui/src/features/manage-agent/ui/agent-rules-pane.tsx` (becomes the unified pane), `agent-config-category-panes.tsx`, `pack-settings.tsx`; delete `agent-always-allowed-pane.tsx`.

Exit: single list, add/revoke works for all three kinds, `tsc`/`biome`/`bun test` green.

## Phase 2: unified store and gate

Before code: answer the `docs/HARNESS_CHANGE_CRITERIA.md` questionnaire (touches file access and permissions).

1. Contract: `PermissionRule` (kind/pattern/effect/agentId/decidedBy/createdAt) in `@harnesys/contracts`; replaces the `PermissionGrantPublic` payload and complements `FileRulePublic`.
2. Server: one port `PermissionRulesPort` (`match(orgId, agentId, subject)`, `list`, `record`, `revoke`) over one table (new `permission_rules` or widened `permission_grants`; prefer new table + backfill, drop `permission_grants` after). Adapter keeps the command-glob matcher for `kind=shell-cmd` and path-glob for `fs-path`.
3. Shell gate: `gateShellCommand` (`packages/harnesys/src/packs/shell/shell-gate.ts`) receives allow/deny pattern lists from the rule store instead of pack spec; `SHELL_FLOOR_PATTERNS` and taint checks unchanged.
4. Runtime lookup: `applyPermissionGate` (`tool-permission.ts`) resolves kind-specific rules through the existing `PermissionGrantsPort` channel (widened to rules) before throwing `AskUserInterrupt`. Deny keeps priority over grants.
5. Migration: backfill `capabilitiesJson.shell.spec.allowlist` and `.blocklist` into rules per agent; same for mode preset shell specs or rules stay agent-level (decision below); drop the spec fields after backfill; idempotent backfill keyed by (agentId, kind, pattern).
6. Writers: `recordOperationGrants` and `persistFileDecision`/`persistShellDecision` (`apps/server/src/app/application/approvals/`) write single-shape rules. `persistShellDecision` stops writing mode preset allowlists.

Decision (default, flag to override): rules are agent-level with nullable org scope; mode presets keep only posture overrides. Shell rules created from an ask inside a mode run still land agent-level.

## Tests (critical only)

1. Gate order: deny-rule beats allow-rule beats posture allow; posture deny beats everything.
2. Shell matching through the port preserves `command-glob` semantics (spot: `git status*`, nested command segments, redirects outside cwd).
3. Backfill idempotency: second run inserts nothing; config fields removed after backfill.
4. Ask "Always" on network/shell/file lands exactly one rule row with decidedBy.
5. Revoke endpoint deletes the row and the gate asks again on next call.

## Risks

- Command-glob drift when moving the matcher source: keep `firstMatchingCommandPattern` as-is, feed it from the adapter.
- Mode preset shell specs in existing orgs: backfill must scan modes, not only agents.
- Delegated/subagent caps (`isDelegate`) restrict ops but not rules; rules of the parent do not leak to the subagent because lookups are per agentId.
