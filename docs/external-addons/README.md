# External add-ons

Write, build and install a Harnesys add-on without access to the Harnesys monorepo.
Everything here works against a running Harnesys host and the public `@harnesys/sdk`
package; you never need the source of the host itself.

An **add-on** is a package: an `addon.json` manifest plus a self-contained JavaScript
bundle. The host reads the manifest as data (your code does not run at registration) and
starts one isolated process per (organization × add-on) only when one of your
contributions is actually used.

## Read in order

| # | Document | Covers |
|---|---|---|
| 1 | [Getting started](getting-started.md) | From an empty directory to a working tool: copy the template, build, test against the fake host, package, install, enable |
| 2 | [SDK and manifest](sdk-and-manifest.md) | `addon.json` fields, `defineAddon`, the handler contract, idempotency and lifecycle, `AddonError`, runtime limits, what you may import |
| 3 | [Contributions](contributions.md) | The map of all contribution families with minimal descriptors |
| 4 | [Build and package](build-and-package.md) | The bundle, what goes into the package, versioning, migrations, limits |
| 5 | [Install on a host](install-on-a-host.md) | Manual install, **Install package**, enabling in an organization, logs and health, quarantine — plus the exact handoff an agent gives the owner |
| 6 | [Troubleshooting](troubleshooting.md) | The common failures and what to check for each |
| 7 | [Trigger scripts](trigger-scripts.md) | Host-owned pre/post commands on trigger instances: gate, failure policy, cwd, audit, add-on contract |

## The template

`templates/external-addon/` in the Harnesys repository is a minimal but complete add-on
(`acme.example`): a tool pack with two tools, a read-only route, a config form with a
secret field and a skill. Copy it and rename it — it is the fastest path to a package
that installs.

The fastest path is the published scaffolder: `bunx @harnesys/create-addon <publisher>.<name>` copies this template and rewrites the identity for you.

## Prerequisites

- [Bun](https://bun.sh) 1.2 or newer (the bundle target and the test runner are Bun).
- An accessible Harnesys host to install onto — the desktop app, a `harnesys-host`
  binary, or a local dev stand. The host owns `~/.harnesys` (`~/.harnesys-dev` for the
  dev stand).
- `@harnesys/sdk` from your package registry. The template pins `"^1.0.0"`. If your
  registry does not carry the published SDK yet, see [Build and package](build-and-package.md)
  for the alternative; the SDK npm release is the only external dependency your add-on has.

## What an external add-on may import

Exactly one runtime import: `@harnesys/sdk` (and `@harnesys/sdk/testing` for tests).
No core packages, no other add-on internals. This is enforced by the add-on lint gate in
the repository and by the fact that the host bundles nothing for you.
