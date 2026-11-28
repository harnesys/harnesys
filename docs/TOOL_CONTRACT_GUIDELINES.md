# Tool Contract Guidelines

Rules every agent-facing surface must satisfy, distilled from the AX audits (board `AX Feedback`) and the
fixes in `docs/AX_AUDIT_2_FIX_PLAN.md`. Applies to tool implementations in `packages/harnesys/src/packs/`,
their descriptions and pack meta, skill prose under `apps/server/assets/skills/`, and the server
use-cases/ports they call. Violations are defects, not style.

## Error messages

`runGuard` and its pack-level equivalents transport only the error message string to the agent
(e.g. `packages/harnesys/src/packs/issues/run-guard.ts`, `packages/harnesys/src/ports/...` result funnels).
Guidance placed only in `details` is invisible to agents. Therefore every error an agent can trigger
must embed, in the message text, in this order:

1. what is wrong, naming the exact invalid value;
2. the valid set or the object's identity (name next to id, never a bare UUID);
3. the next step, naming the tool or page that fixes it.

Exemplars to copy, do not rewrite:

- unknown label: `unknown label: X (no label with this id or title; create it first with label_create)`
  (`apps/server/src/app/application/issues/resolve-issue-labels.ts`)
- unknown status: `unknown statusKey: X (board statuses: ...; see issue_board_list)`
  (`apps/server/src/app/domain/issue/board.error.ts`, `UnknownBoardStatusException`)
- board missing: `apps/server/src/app/domain/issue/issue.error.ts`
- knowledge NOT_INDEXED: owner setup steps (`packages/harnesys/src/packs/memory/create-knowledge-tools.ts`)
- spawn target unknown/ambiguous: replies with the roster (`packages/harnesys/src/packs/agents/`)
- MCP vault key: `vault key "KEY" not found for server <id> — set it in the vault or fix the reference`
  (`apps/server/src/app/application/mcp/resolve-mcp-vault-placeholders.ts`)

Misconfiguration never masquerades as emptiness: an empty result is reserved for genuinely-empty state;
an unconfigured state returns the named gap plus setup steps. Silent fallbacks (empty-string secrets,
skipped servers with no signal, priced-at-zero from missing prices) are forbidden; fix the wiring or
surface the cause.

## Compact-by-default listings

Collection tools (rosters, inventories, catalogs) default to the minimally sufficient projection:
the fields needed to decide (identity, enablement, assignments, limits), never full prose bodies the
caller already carries in its system prompt. Full detail is opt-in and self-advertised:

- the tool description states both shapes;
- the compact result itself carries a `note` naming the exact flag (`packs_tools`: `pack:"<source>"` /
  `detail:true`; `agents_list`: single-agent filter or `verbose:true`).

Hard budget: a default listing must stay under `DEFAULT_TOOL_OUTPUT_MAX_CHARS`
(`packages/harnesys/src/constants.ts`) so the harness never clips the middle of an inventory.
When trimming, keep decision fields: dropping `instructions` from `agents_list` rows keeps
name/role/model/packs/budget, which is what delegation decisions read.

## Contract surfaces move together

A behavior change ships, in the same diff, every surface that describes it: tool description, pack meta
(`packages/harnesys/src/packs/*/index.ts`), `harnesys-system/references/packs.md`, affected skill prose.
Generated skill references (`scripts/gen-widget-skill-refs.ts`, CI `skills:check`) regenerate with the
code, not after it. Preset instructions (`apps/server/assets/presets/agents/`) describe user-configurable
environment conditionally ("the board's review column if it has one; check issue_board_list") because
boards, rosters and statuses are org data, never guaranteed.

## One owner per concept

Field-name sets, enums and validation live in one module consumed everywhere: budget schema fields and
tuning text in `packages/harnesys/src/packs/agents/budget-json-schema.ts`, rule conditions in
`packages/contracts/src/boards.ts` (`RULE_CONDITION_TYPES`), plan status derivation in
`apps/server/src/app/infra/runtime/packs/org-plan.port.ts` (`derivePlanStatus`). Retyped lists are
defects. A field plumbed but consumed by nobody is a contract lie: delete it or wire it.