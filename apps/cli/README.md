# @harnesys/cli

Single-binary CLI for Harnesys: relay sessions, owner initialization, and fleet operations (invite, enroll, retarget, promote, doctor). Built with `bun build --compile` into a self-contained `build/harnesys` binary — no runtime dependencies, no embedded server; it only talks HTTP(S) to local and remote hosts.

## Build

```bash
bun run build:cli      # from the repository root -> build/harnesys
harnesys --version
```

## Usage

```
harnesys help
harnesys --version
harnesys login <relayUrl>
harnesys owner init
harnesys host invite --org <orgId> --name <nodeName> [--ttl 15]
harnesys host enroll <relayUrl> <code> --org <orgId> --name <nodeName>
harnesys host retarget --org <orgId> <newRelayUrl>
harnesys host promote --org <orgId> --target-node <nodeId> --relay-url <url>
harnesys host promote --org <orgId> --accept --from <url> --token <token>
harnesys host doctor
```

`host *` commands require a session (`Authorization: Bearer` from `~/.harnesys/session.json`); on `401` the CLI refreshes the session once via `POST /api/session/refresh` and retries.

| Command | What it does |
|---|---|
| `login <relayUrl>` | sign in, store the token pair in `session.json` (0600) |
| `owner init` | create the first owner on a loopback host (only when no users exist) |
| `host invite` | issue an invite code and a ready-to-paste `host enroll` line |
| `host enroll` | pair a worker with a relay; writes worker identity to `nodes/<orgId>.json` |
| `host retarget` | point a worker at a new relay URL |
| `host promote` | start relay-role transfer (`--target-node`) or accept it (`--accept`) |
| `host doctor` | inspect machine home, file permissions, org data, and relay reachability |

Errors are printed as `errorCode — message` from the common contract (`{statusCode, errorCode, message, path, timestamp, traceId?}`).

## Files

Everything lives under `HARNESYS_HOME` (default `~/.harnesys`):

| File | Purpose |
|---|---|
| `session.json` | `{relayUrl, accessToken, accessExpiresAt, refreshToken}` after `login` |
| `config.json` | host public origin / listen address for local calls |
| `machine.json` | `{orgs, activeOrgId}` machine membership |
| `nodes/<orgId>.json` | worker identity `{relayUrl?, token?, ticketKey?}` (written by the server) |

No other environment variables are read.

## Development

```bash
bun test apps/cli              # parser + doctor tests
bun run --cwd apps/cli typecheck
```

Source layout: `index.ts` (parser, USAGE, dispatch), `paths.ts`, `prompt.ts`, `session-store.ts`, `session-client.ts`, one `host-*.ts` / `login.ts` / `owner-init.ts` file per command.
