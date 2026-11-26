---
name: addon-creator
description: Build, ship, and operate a Harnesys add-on end to end - scaffold the package, write the manifest and handlers, build and install it on the host, then enable, connect, and configure it in an organization. Use when asked to create, extend, install, enable, connect, or troubleshoot an add-on.
when_to_use: "Before creating or changing an add-on under add-ons/<id>/, before installing or rescanning a package on the host, or when an admin needs the exact WebUI or REST steps to enable, connect, and configure one."
---

# Add-on Creator

An add-on is a package: an `addon.json` manifest plus a self-contained JS bundle. The host registers your declared contributions as **data** (your code does not run) and lazily starts one isolated process per (organization × add-on) only when a contribution is used. The authoring contract is `@harnesys/sdk`; nothing else is importable from outside the monorepo.

Start with `references/workflow.md` - it is the end-to-end path from scaffold to a feature that works in an organization.

## How to use this skill

| File | Contents | Load when |
|---|---|---|
| `references/workflow.md` | Which built-in to copy, scaffold, dev loop, `bun run addon:build`, local checks, install, enable, connect, verify | Starting any add-on task |
| `references/manifest.md` | `addon.json` fields, validation, id/version rules, `activation`, `permissions`, `connections`, what is forbidden | Writing or editing the manifest |
| `references/contributions.md` | All 14 contribution families, each with a minimal descriptor and where to copy a full example | Adding a capability |
| `references/code-contract.md` | `defineAddon`, `startAddonProcess`, handler/contribution parity, idempotency, errors, code style | Writing the handler code |
| `references/context-and-permissions.md` | The `ctx.*` services table, permission catalog, consent flow, skills shipped by add-ons | Touching host services or rights |
| `references/install-and-handoff.md` | Host directories, WebUI and REST install/enable/bind paths, curl recipes, health check, what to tell the user | Shipping and handing off |

## Ground rules

- The catalog directory name must equal the manifest `id` (`<publisher>.<name>`).
- Every declared contribution needs a matching handler and every handler needs a contribution; a mismatch fails the instance handshake (`incompatible_handlers`).
- `if (import.meta.main)` around `startAddonProcess` is mandatory: in-process mode imports the bundle and must not open a second stdio loop.
- Source of truth is code, not this skill: verify every field against `packages/sdk/src/families/*.ts` and a built-in add-on before shipping.
- Keep secrets out of `ctx.log` and out of `ctx.config`; use the `secret` field type and `ctx.secrets`.
- No `console` (use `ctx.log`), no polling timers, no `any` / `!`, kebab-case files, `interface` for object shapes.
- English only for all user-visible text in the package.

## Trigger scripts (agent-armed)

Every trigger instance can carry a **Scripts** block: pre/post shell commands with an optional
gate. An agent sets them through the add-on's own tools (scheduler `set`, webhook `create` /
`configure`) or any add-on calling `ctx.triggers.create/update`; the human UI edits the same
values. Non-empty scripts need `scripts.acknowledged: true`; the built-in tools set it.

- `AddonTriggerTarget` carries `scripts`; `ctx.triggers.get` returns the stored target, so an
  add-on can inspect and edit its own instances. An update that omits `scripts` keeps them.
- A pre script runs before the fire limits: `exit 2`, an unmatched gate, or a failed command
  under `onError: skip-run` suppresses the run without creating one. A post script runs after
  the run reaches a terminal status (`always | success | failure`).
- The script's `pwd` is the instance workspace, the same directory the fired run uses, not the
  add-on process cwd.
- A "fire only when something changed" need is a pre-script gate, not new polling machinery in
  the add-on. `standard.scripts` can relabel or disable the block; mention it in the handoff.
- Reference: `docs/external-addons/trigger-scripts.md`. UI path: Automations -> gear -> Scripts;
  the Test button runs the command in the current workspace without waiting for a fire.

Agents manage instances of your trigger through the core `automations` pack, so
`configFields` is the schema the pack validates (`required`, `type`, `options`, `pattern`,
`visibleWhen`, nested groups). Declare it accurately, including defaults and help. Do not ship
trigger CRUD tools in the add-on.

Add-on-specific operations are `descriptor.actions`: declare `{ id, title, description?,
inputSchema? }` and implement `action({ instanceId, kind, action, input }, ctx)` in the trigger
pair. The host routes them through `trigger.action`, the pack exposes them as
`automation_action`, and `input` is validated against `inputSchema` before the call. That is
where status, test deliveries, secret rotation and next-run state belong, not in a tool pack.
