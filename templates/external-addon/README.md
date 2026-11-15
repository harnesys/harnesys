# Example Bookmarks — external add-on template

A minimal, complete and runnable Harnesys add-on for external authors. It ships four
contributions and nothing else so you can copy it and grow it:

| Contribution | id | What it does |
|---|---|---|
| `tool-pack` | `pack` | Two agent tools, `add` and `list`, over a per-organization SQLite table |
| `route` | `items` | `GET /items` returning the stored rows |
| `config` | `settings` | A `default_tag` text field and an `api_note` secret field |
| `content` | `usage` | A skill (`content/usage/SKILL.md`) embedded into the tool pack |

Everything imports only `@harnesys/sdk` (and `@harnesys/sdk/testing` in tests).

## Build

```sh
bun install
bun run build       # -> dist/index.js, the manifest runtime.entry
bun run typecheck
bun test
```

## Install on a host

1. Copy this directory (with `dist/`) into `~/.harnesys/add-ons/acme.example/1.0.0/`.
   The version directory must equal the manifest `version`.
2. Open **Settings → Add-ons** in the desk, press **Reload**, then enable the add-on for
   your organization and approve the consent dialog if one appears.

Full instructions, packaging and troubleshooting: see `docs/external-addons/` in the
Harnesys repository (or the documentation shipped next to this template).

## Make it yours

- Rename the add-on: set `id`, `title`, `description`, `version` in `addon.json` (and the
  `homepage` `REPLACE_ME` placeholder; adjust `icon` when you replace the demo domain),
  the `name` in `package.json`, and `ADDON_ID` / `ADDON_VERSION` in `src/index.ts`. The
  package directory name must equal the manifest `id`.
- Add a contribution: add its descriptor to `addon.json` and its handler under the
  matching `defineAddon` key. Every contribution needs a handler and every handler needs
  a contribution, or the instance fails the handshake with `incompatible_handlers`.
- Change the schema: append a numbered migration under `migrations/` and bump `version`.
