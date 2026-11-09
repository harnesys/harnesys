# Starter addon

Reference addon for the Harnesys addon platform. Uses every stable contribution family
once, so a new author can copy the shape and the platform can prove all families in one pass.

## Dev loop

```bash
cd add-ons/starter
bun run dev
```

No Harnesys application is involved: the SDK dev host registers the contributions in-process
and smoke-calls the tool. Watch mode restarts on change — the same entry point the production
host spawns.

## Contributions

| Family | Contribution | Where |
|---|---|---|
| `tool` | `starter.hello` | `src/tools/hello-addon.ts` logic, declared in `addon.json` |
| `content` | `starter.skills`, `starter.prompt` | `./contents/skills`, `./contents/prompts` |
| `view` | `starter.section` | `src/views/sidebar-section.ts` |
| `hook` | `starter.strip` | `src/hooks/strip.ts` |
| `route` | `starter.status` | `src/routes/status.ts` |

Each family is split the same way: `addon.json` holds the descriptor (data), `register` holds
the executable part. The host reads descriptors to build its registries and calls the
executable part only when the contribution fires.

## Files

```
add-ons/starter/
  addon.json        descriptors, entry points, assets
  src/index.ts      defineAddon: manifest + register
  src/dev.ts        dev host entry
  contents/         declarative assets, no code
```
