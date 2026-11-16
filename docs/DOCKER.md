# Docker at Harnesys: architecture plan

Status: canonical plan. Everything the final version needs is decided here; the phases in
Section 17 are implementation order only, not scope. Nothing is left open.

Docker plays three roles. All live in one vertical slice (`domain|infra|application/docker`) and
one webui page (`features/docker/`). Agents' tools stay Docker-agnostic: they receive resolved
endpoints and process targets. New Docker needs extend this slice, not the packs.

| Role | What it is | Consumed by |
|---|---|---|
| **Host** | the Docker runtime itself: present, version, platform, endpoint | everything below |
| **Sandboxes** | workspace containers where agent code runs | shell, terminals, files, web, MCP, hooks (per policy) |
| **Services** | long-lived containers the app and agents use: SearXNG, Neko, ollama, … | web search, browser host, future tool seams |

## 1. Decisions

| Area | Decision |
|---|---|
| Data/workspace mounts in a containerized server | bind mounts + declared host roots (`HARNESYS_HOME`, `HARNESYS_HOST_ROOTS`); outside them = fail-closed |
| Socket proxy | `wollomatic/socket-proxy`, per-method regex allowlist + bind-mount restriction; transport with an ACL, not the boundary |
| Default sandbox egress | `sandbox` preset = **allowlist baseline** (package registries + VCS hosts); `strict` = `none` |
| Egress enforcement | one proxy service with DNS interception; RFC1918/link-local/metadata denied |
| Network topology | one internal bridge per org (`harness-org-<hash>`); services and egress proxy attached; `none` uses `--network none` |
| Process execution | `docker exec` only (no in-container daemon); pty via `script -qefc` wrapper, so no transport upgrade needed |
| Sandbox image | curated, published `harnesys/sandbox` image (Bun/Node, python, git, ripgrep, util-linux, certs); orgs may override with any image passing the capability probe |
| Hardening | `--read-only`, `--cap-drop ALL`, `no-new-privileges`, seccomp, `--pids-limit/--memory/--cpus`, `--init`, no socket, no host env |
| seccomp | one deny-list spec, two renderers: cBPF for the add-on bwrap launcher, Docker JSON for the sandbox; agent profile allows exec/socket |
| Sandbox mounts | curated (workspace + declared roots); `orgDataDir` never mounted |
| `files` surface | host (host+path-jail) or sandbox (ops executed via `docker exec`, `filesystem` policy enforced by the mounts) |
| Contributed plugin hooks / MCP | route into the sandbox by default; per-item `routing.overrides` can pin one to `host`; declared mounts (`binDirs`, data dirs) read-only |
| Unmountable host actions | **host-tools bridge** (declared, granted operations, exposed as an MCP server in the sandbox); no raw socket, no raw shell |
| Service placement | per-node instances (`ServiceInstance.nodeId`); org-global shared services are out of the model |
| Service spec | single-container `ServiceDefinition` rendered to `docker run`; multi-container services may reference a compose fragment; both supported |
| Neko | not a local engine — a **remote-browser provider** in the web pack (`ServiceAccess.browser-remote`, CDP/WebRTC endpoint) |
| searxng endpoint | service endpoint, with the existing per-agent `searxngUrl` override taking precedence |
| Container lifecycle | revision hash (image+argv+mounts+network+runtime); recreate only when the workspace is idle |
| Secrets into the sandbox | tmpfs env-file, never `docker exec -e` |
| Backend location | container exec backend moves into `infra/docker`, registered via the existing `ProcessSpawnBackend` seam |
| Add-ons | unchanged platform; never get Docker access (no new permission) |
| Worker wire | `TaskEnvelope` carries the resolved policy (with back-compat); presence carries the full capability set |

## 2. Goal and non-goals

Goal: connect and manage Docker-backed services from the app, and run agent code in a
configurable sandbox whose default is isolated. One settings surface for both. "Work directly on
the host" stays available as an explicit choice.

Non-goals (product boundaries, not deferrals): a multi-tenant microVM cloud, Windows sandboxes,
org-global services shared across nodes, per-command GVisor hybrid inside one workspace.

## 3. Current state (verified)

An agent run is not a spawned CLI. It is the `harnesys` graph engine in the server/worker process
(`packages/harnesys/src/application/run-engine.ts:44`, `create-runtime.ts:69`); LLM calls are
HTTP to the configured provider (`adapters/ai-llm-provider.ts:110`). OS processes are spawned
only for tools.

Surface routing today:

| Surface | Runs on | Reference |
|---|---|---|
| shell, terminals, background jobs | host or container | `packs/shell/shell.ts:138`; `application/process-jobs/process-job-registry.ts:56` |
| files (read/write/edit/grep/glob/lsp) | host server, path jail | `domain/file-access/`, `infra/content/path-jail.ts:35` |
| web (fetch/search) | host server | `packs/web/fetch.ts:44`, `packs/web/search.ts` |
| MCP stdio servers | host server | `adapters/mcp/ai-sdk-mcp-connector.ts` |
| hooks | host server | `application/hooks/command-run.ts` |

Container path: `DockerWorkspaceAdapter`
(`infra/process-runtime/docker-workspace.adapter.ts:48`) runs `docker run -d ... sleep infinity`
via `workspaceRunArgs` (`infra/process-runtime/workspace-container-args.ts:19`) with mounts of
`orgDataDir`, primary dir, thread dir, declared rule dirs
(`infra/runtime/workspace-target.ts:153`); commands run through `docker exec`
(`application/process-jobs/docker-process-backend.ts:10`).

Services are not app-managed. Browser engines are host-installed binaries
(`packs/web/browser/engine-catalog.ts`); `HostEngineEntry` describes a local binary
(`engine-resolve.ts:3`). SearXNG is a compose profile plus a **per-agent** `searxngUrl`
(`features/manage-agent/ui/web-pack-settings.tsx:187`, default `packs/web/search.ts:11`). Neko
does not exist in the codebase.

Gaps (confirmed against code):

1. Only shell/terminals route into the container; files, web, MCP, hooks do not.
2. Container network is the default bridge: full egress, no allowlist, no DNS control.
3. No hardening: no `--read-only`, `--cap-drop`, seccomp, or limits.
4. Create args are keyed by name only; image/args changes do not recreate
   (`docker-workspace.adapter.ts:48`), and recreating during a live run would kill its exec
   sessions.
5. `probeDocker` caches forever (`infra/fleet-hub/docker-probe.util.ts:4`).
6. The deploy host container has no docker CLI and no socket (`deploy/host.Dockerfile`).
7. `env` is not forwarded into `docker exec` (`docker-process-backend.ts:10`).
8. Container mode rejects pty (`shell.ts:139`).
9. The sandbox mounts the **whole `orgDataDir` rw** (`workspace-target.ts:155`), which holds
   `org.db`.
10. Identity bind mounts mean `filesystem.*`/`--read-only` only bind the process inside the
    sandbox; with `files: 'host'` no container filesystem policy applies.
11. `TaskEnvelope.isolation = { mode: 'container', image }`
    (`packages/contracts/src/fleet-secrets.ts:38`) is a published worker contract.
12. Node capabilities travel as `docker_available` only (`placement.ts:57`), not config.
13. Named volume `harnesys-data:/data` (`deploy/docker-compose.yml:36`) has no stable host path,
    so a containerized server cannot bind a sandbox to its own data.

## 4. One slice, one page

```
domain/docker/
  host/        DockerHostStatus, DockerHostPort
  image/       DockerImageDefinition (catalog, curated sandbox image), DockerImageStatus
  service/     ServiceDefinition (catalog), ServiceInstance, ServiceStatus,
               ServiceAccess (web-search | browser-remote | endpoint), ServicePort
  sandbox/     IsolationPolicy, IsolationPreset (+ built-ins), SandboxSpec, SandboxPort
  network/     SandboxEgressPolicy, HostToolEgressPolicy, EgressProxyPort, EndpointExposure
domain|infra/hostbridge/
  host-tool.ts          HostToolDefinition { id, label, input, execute, grant }
  bridge.module.ts      bridge MCP server (`harnesys-host`) + executors
infra/docker/
  docker-host.adapter.ts            probe (TTL), version, platform, runtimes, endpoint
  docker-image.adapter.ts           list, pull
  docker-service.adapter.ts         ensure/start/stop/status/remove, compose fragment support
  docker-workspace.adapter.ts       EVOLVED WorkspaceContainerPort (moved here); revision hash
  sandbox-args.ts                   hardened docker run argv + mount curation
  seccomp-to-docker.ts              shared deny-list -> Docker JSON profile
  docker-process-backend.ts         exec backend (moved from core), pty via `script -qefc`
  egress-proxy.adapter.ts           control plane for the egress proxy service
  isolation-preset-sqlite.ts        preset storage
  docker.module.ts                  global; exports the ports
application/docker/
  host: get-docker-host
  images: list, pull (SSE)
  services: list, install, stop, remove, update, expose
  sandboxes: list, release, reconcile
  presets: list, create, update, delete, set-default
api/rest/
  docker.schema.ts
  docker.controller.ts              one resource: /orgs/:orgId/docker/*
webui/src/features/docker/
  Host · Images · Services · Sandboxes · Network · Isolation presets · Host tools
```

`WorkspaceContainerPort` and `DockerWorkspaceAdapter` are **evolved, not duplicated** (reuse over
rebuild). The core keeps the `ProcessSpawnBackend` seam; the Docker backend is registered from
`infra/docker` at wiring time (`process-job-registry.ts:69` accepts `backendFor`).

## 5. Host

`DockerHostPort.status()` → `{ available, version, platform, endpoint, runtimes, socketProxy }`,
TTL-cached (gap 5). Reads `docker info` for runtimes and the platform. On macOS/Windows Docker
Desktop `runsc` is absent and several hardening flags behave differently, so the probe reports
this and the UI disables what the host cannot do.

## 6. Images

- `DockerImageDefinition` catalog: `{ id, label, image, purpose, kind: 'sandbox' | 'service' }`,
  in `domain/docker/image/image-catalog.ts`. `listImages(refs)` and `pull(image, onProgress)` (SSE).
- **Curated sandbox image** `harnesys/sandbox` (built in `deploy/`, published, versioned): Bun,
  Node, python3, git, ripgrep, curl, util-linux (`script`), ca-certificates, and the bridge MCP
  client. A capability probe checks any alternate image for the binaries the surfaces need.

## 7. Services (dependencies)

```
ServiceDefinition {
  id: string                     // 'searxng', 'neko', 'ollama', ...
  label: string
  image: string
  ports: number[]
  env?: Record<string, string>   // placeholders resolved from the vault
  volumes?: string[]
  healthcheck?: { cmd: string; intervalMs: number }
  composeFragment?: string       // multi-container services
  access: ServiceAccess
}

ServiceAccess =
  | { kind: 'web-search'; provider: 'searxng'; endpoint: string }
  | { kind: 'browser-remote'; engineId: string; protocol: 'cdp' | 'webrtc'; endpoint: string }
  | { kind: 'endpoint'; label: string; endpoint: string }

ServiceInstance {
  defId: string; orgId: string; nodeId: string
  source: 'managed' | 'external'
  endpointOverride?: string; containerRef?: string; endpoint?: string
  status: 'missing'|'starting'|'running'|'unhealthy'|'stopped'|'error'
}
```

Default `managed`: the app pulls the image, runs the container (or applies the compose fragment),
waits for the healthcheck, wires the access. `external` is for a user who already runs the
service: paste the endpoint, the app probes it and wires the access. Both land in the same
`ServiceAccess`. `ServicePort`: `ensure`, `start/stop`, `status`, `remove`, `endpoints`, `probe`.

Wiring:

- `searxng` `web-search` provides the endpoint; the existing per-agent `searxngUrl` override
  takes precedence (precedence rule, not a hardcode replacement).
- `neko` `browser-remote` registers a **remote-browser provider** in the web pack: the browser
  driver connects over CDP/WebRTC instead of launching a local binary. Neko is a service, not a
  drop-in `HostEngineEntry`.
- `endpoint` entries are available to future tool/MCP seams.
- `ServiceAccess.provider` is a new core literal (precedent `WebSearchProviderName`); a conscious
  exception per repo doctrine.

Install UX: a Services row shows state and a single **Install** (pull with SSE progress, create,
healthcheck, wire, flip to Running with endpoint), plus **Stop**, **Remove**, **Update image**,
**Probe**, **Connect existing**. Failures show a reason and an action, never silent.

## 8. Sandboxes (agent execution isolation)

```
IsolationPolicy {
  surfaces: { shell; terminals; files; web; mcp; hooks: 'host'|'sandbox' }
  sandbox: {
    image: string; runtime: 'runc'|'runsc'; readOnlyRoot: boolean; ephemeral: boolean
    resources: { cpus?: number; memoryMb?: number; pidsLimit?: number }
    extraMounts: string[]
  }
  filesystem: { writable: string[]; readOnly: string[]; protectConfig: boolean }
  network: { sandbox: 'none'|'allowlist'|'full'; allow: Array<{ host: string; ports: number[]; tunnel?: boolean }> }
  secrets: { inject: string[] }
  routing: {
    byOrigin?: { plugin?: 'host'|'sandbox' }
    overrides: Array<{ kind: 'hook'|'mcp'; id: string; target: 'host'|'sandbox'; reason: string }>
  }
  bridge: { exports: string[] }
}

IsolationPreset { id; orgId; name; system: boolean; policy: IsolationPolicy }
```

Built-ins (immutable; clone to edit): `host` (every surface host), `sandbox` (default: every
surface sandbox, `network.sandbox='allowlist'` baseline, hardening, fail-closed), `strict`
(`runsc`, `readOnlyRoot`, `ephemeral`, `network.sandbox='none'`).

`ExecutionProfile.policyPresetId` references a preset; resolution stays
thread → issue-rule → agent → org default. Fail-closed: if the host cannot satisfy the resolved
preset (no docker, no `runsc`, no proxy), the run stays queued with a reason and a "set up
sandbox" action. No silent fallback.

Routing granularity: surface default → `routing.byOrigin.plugin` → `routing.overrides` (per hook
binding / MCP server id, with a required reason, shown as the exception list) → declared mounts.
A binding needing something outside declared roots fails with a reason and a one-click override
(or a bridge grant), never a silent fallback.

Hardened argv (`sandbox-args.ts`): internal network, `--read-only`, curated writable bind,
sized `tmpfs /tmp`, `--cap-drop ALL`, `--security-opt no-new-privileges`,
`--security-opt seccomp=<converted profile>`, `--pids-limit`, `--memory`, `--cpus`, `--init`,
`--runtime`.

Sandbox mounts (curated, gap 9/10): workspace/primary dir rw; thread `sandbox/` rw;
`attachments/` ro; shared sources at their configured level; declared host roots read-only;
`orgDataDir` never mounted. Subject to the socket-proxy bind restriction.

seccomp: shared deny-list spec (`mount`, `ptrace`, `io_uring*`, `bpf`, module ops, `kexec`,
`keyctl`, `perf_event_open`, `userfaultfd`, `open_by_handle_at`, x32 range) → `seccomp-to-docker.ts`
emits Docker JSON; the same spec renders the add-on cBPF. Agent profile allows exec/socket;
network is governed by policy, not seccomp.

Execution: all process/terminal work runs through `docker exec`. pty uses
`/usr/bin/script -qefc '<cmd>' /dev/null` over a plain exec stream, so terminals work without any
transport upgrade. `files: 'sandbox'` executes file operations through `docker exec` under the
same path-jail and file rules, so the container mounts enforce `filesystem`.

Revision hash = image + argv + mounts + network + runtime. A changed revision recreates the
container, **only when the workspace is idle**; a running run keeps its container (gap 4).

## 9. Network

Two policies, deliberately separate:

- **`SandboxEgressPolicy`** — the sandbox container. `none` → `--network none`; `allowlist` →
  attached to the per-org internal bridge whose only reachable endpoint is the egress proxy;
  `full` → explicit opt-in, warned.
- **`HostToolEgressPolicy`** — host-mediated tools (`fetch`, MCP over http) and bridge calls.
  Separate switch, own default.

LLM provider calls are infrastructure, always host-side, never under either policy.

Egress proxy (`harness-egress`, one per host): the sandbox has no external route; `/etc/resolv.conf`
points at the proxy's resolver, which answers allowlisted zones and forwards only those; HTTP(S)
goes through the proxy (CONNECT for HTTPS); other protocols are denied unless an allow entry sets
`tunnel: true` for that host:port. RFC1918, link-local, and the cloud metadata IP are denied
regardless of the allowlist.

Service exposure: services publish on `127.0.0.1:<port>` for host-native runs and are reachable
by service DNS on the per-org bridge; a sandbox reaches a service only if `network.allow` lists
it or the service is co-attached. `ServiceAccess` endpoint resolution is contextual: local for
host-native, service DNS when the server shares the network.

## 10. Host tools bridge

A sandboxed hook/MCP/tool can need a host action that cannot be mounted (host Docker socket, a
host-only binary, a device). Instead of mounting it, the sandbox gets a narrow declared bridge.

- A host tool is `HostToolDefinition { id, label, input (Zod), execute, grant }`. Initial set
  from the docker slice: `docker.build`, `docker.composeUp`, `docker.composeDown`, `docker.logs`,
  `docker.imageLs`. Never a raw shell, never the raw socket. New host tools are added as declared
  operations by their owning slice.
- The bridge runs host-side and is presented **inside the sandbox as one MCP server**
  (`harnesys-host`), so any MCP-capable hook/MCP/agent calls it uniformly; a thin CLI wrapper
  covers non-MCP command hooks. No new graph plumbing.
- Grants: `IsolationPolicy.bridge.exports`, default none. Every call is schema-validated,
  rate-limited, timed out, and audited — same shape as the add-on `HostDispatcher`
  (`docs/add-ons/architecture.md:59`), reused.
- Bridge calls obey `HostToolEgressPolicy`. The sandbox still has no socket and no host env.

## 11. Routing seam, add-ons and plugins

The single decision point stays `resolveProcessTarget` (`infra/runtime/workspace-target.ts:94`):
resolve preset → build `SandboxSpec` for `sandbox` surfaces → `SandboxPort.ensure` → return
`ProcessJobTarget`. Consumers receive `ctx.process` and stay Docker-agnostic:

- shell / terminals: existing path, pty via the `script` wrapper;
- MCP stdio: new sandbox-routed `McpTransport` using `docker exec -i` (the connector hardcodes
  `Experimental_StdioMCPTransport`, `ai-sdk-mcp-connector.ts`);
- hooks: routed through the exec path while preserving the hook contract (JSON stdin payload,
  timeout/abort process-group kill, full stdout with `truncateHookString`) — not a naive reroute
  of the 1M-scrollback/16-per-cwd registry;
- files: host or sandbox per policy;
- web: honours `HostToolEgressPolicy`, optional sandbox routing.

Add-ons (`infra/addons`, `domain/addons`) are unchanged: own host OS sandbox, own process, and
they contribute tools/routes/triggers/workers/provider hooks. None of that flows through the
agent sandbox; add-on hooks arrive via `hook.providerEvent`/`events.subscribe` in the add-on
process. **Everything that enters a run routes into the sandbox when its surface is `sandbox`**,
including hooks and MCP servers contributed by the plugin system:

- Plugin hooks (`org-plugin-view.ts:46`) and plugin/org MCP servers (`bundle.mcpJson` →
  `mcpRegistry`, `org-plugin-wiring.ts:32`) run in the container; origin metadata on each
  binding/spec tells the router what to mount.
- Plugin `binDirsFor` path-entry dirs (`org-plugin-view.ts:56`) are mounted read-only and added
  to `PATH`.
- `http` egress obeys `SandboxEgressPolicy`; add-on `http.fetch` allowlist and host
  `forbiddenHosts` remain the add-on layer, with `HostToolEgressPolicy` sharing `forbiddenHosts`
  as a common deny-list.
- Using `orgDataDir` removal, `orgDataDir/<org>/addons/<id>/` (`data.db`, `logs`, secrets) leaves
  the agent's reach.
- Add-ons never get Docker: no new permission; a future add-on container need is a separate
  decision (new permission + port).

## 12. Placement, capabilities, and the worker wire

- `domain/fleet/placement.ts`: replace `docker_missing` with a preset-vs-capability match
  (runtime, readOnlyRoot, egress proxy), keeping the human-readable reason.
- Capabilities: extend the presence/CONNECT frame and the `docker_available` column/`NodeRecord`
  to carry `{ docker, version, platform, runtimes, egressProxy }`, consumed by placement and UI.
- Worker wire: `TaskEnvelope` carries the resolved policy (or `presetId` + node-side resolution)
  with back-compat so old workers keep working during rollout.

## 13. API and WebUI

One controller, `/orgs/:orgId/docker/*`: host, images, pull (SSE), services CRUD + status,
sandboxes + release, capabilities, host tools, presets CRUD, default preset.

One page `webui/src/features/docker/`:

1. **Host** — docker present, version, platform, runtimes, endpoint, re-check;
2. **Images** — catalog, status, pull with SSE progress;
3. **Services** — catalog rows: status; one-click **Install** (SSE progress), **Stop**,
   **Remove**, **Update image**, **Probe**, **Connect existing**; resolved endpoint and access
   target;
4. **Sandboxes** — live containers: name, image, workspace, status, release;
5. **Network** — sandbox egress mode + allowlist rows; host-tool egress; service exposure;
6. **Isolation presets** — list + editor: name, surface matrix (rows = surfaces, columns =
   host/sandbox, disabled cells driven by capabilities with reasons), sandbox fields, routing
   (origin default + per-item overrides), filesystem, resources, secrets allowlist, bridge grants;
7. **Host tools** — available host tools and which preset grants them;
8. **What runs where** — plain-language preview from the same policy the server enforces.

Settings nav: category `docker` (icon `ContainerIcon`). The execution profile page
(`features/manage-fleet/profile-detail.tsx`) drops the isolation editor and shows a preset picker
with a link here. `manage-org-browser` keeps working; Neko appears here as a service and there as
an available remote engine.

## 14. Deployment

- `wollomatic/socket-proxy`: regex allowlist for exactly `POST /containers/create`,
  `POST /exec/create`, `POST /exec/*/start`, `GET /containers/*`, `GET /images/*`, `GET /version`,
  network/volume create, and bind-mount restriction (`socket-proxy.allow.bindmountfrom`) to
  declared roots. (tecnativa is group-level and cannot restrict create, so it is not used.)
- Bind mounts: data and declared workspace roots are bind-mounted 1:1 (`HARNESYS_HOME`,
  `HARNESYS_HOST_ROOTS`); the server translates internal paths to host paths before `docker run -v`;
  outside the roots fails closed. Migration note for installs on the named volume.
- `harness-egress` (with DNS interception) and the per-org internal bridge network.
- The sandbox image build (`harnesys/sandbox`) with its capability manifest.
- Document in `docs/SAD/47-развёртывание-docker.md`.

## 15. Migration

- Contracts: remove `ExecutionProfileIsolationSchema`/`dockerImage`; add `policyPresetId`; add
  `IsolationPresetSchema`, `IsolationPolicySchema`, service contracts.
- DB: drop `isolation`/`docker_image`, add `policyPresetId` to `execution_profiles` and update the
  fresh DDL `CREATE_EXECUTION_PROFILES_SQL` (`org-sql.ts:876`). Column drops follow the existing
  precedent (`migrateAgentsPolicyColumns`, `org-sql.ts:79`; `approvals`, `:759`;
  `org_memory_settings`, `org-sql-ensure.ts:157`). New `isolation_presets` table.
- Bootstrap: seed built-in presets for every org, existing and new, via an org-open bootstrap hook.
- Row migration: `isolation='host'` → preset `host`; `'container'` → preset `sandbox` with
  `sandbox.image = docker_image`.
- Consumers: `execution-profile.adapter.ts` (multiple sites), the execution-profile use-cases,
  `resolve-run-placement.ts:106`, `runtime-prompt.ts:49`, webui `profile-detail.tsx`,
  `agent-execution-pane.tsx`, `packages/contracts/src/execution-profile.spec.ts`.
- Wire: `TaskEnvelope` isolation with back-compat; presence frame + column (Section 12).

## 16. Phases (implementation order, not scope)

0. Model + slice: contracts, DB + preset seeding, ports (`DockerHostPort`, `DockerImagePort`,
   `ServicePort`, `SandboxPort`, both egress policies, `HostToolBridgePort`), capability probe,
   read-only Docker page.
1. Host + images: socket proxy, bind path mapping, TTL probe, platform/runtimes, sandbox image
   build, pull with SSE.
2. Services: `ServicePort` + catalog; SearXNG (managed + external) with `searxngUrl` precedence;
   Neko remote-browser provider.
3. Sandbox for shell + terminals: curated mounts, hardened argv, seccomp renderer, allowlist
   egress + proxy, fail-closed, revision hash with idle-gated recreate, exec backend moved,
   pty via `script`, secrets via env-file.
4. Hooks + MCP + plugin-origin routing with contract preservation and `binDirs` mounts; host-tools
   bridge with granted docker tools.
5. `files: 'sandbox'` runtime + `filesystem` enforcement; `web` sandbox routing; per-surface
   overrides, resources and network editors live.
6. gVisor tier, ephemeral sandboxes, idle GC, audit log of sandbox denials.

Gates per phase: `tsc --noEmit`, `biome check`, server boot (DI is not caught by tsc, per
`AGENTS.md`), and a manual run on the live stand exercising one sandboxed and one host surface
plus one service.

## 17. Tests

One spec per pure seam: revision-hash stability and idle-gated recreate; hardened argv builder;
both egress policies; seccomp renderer output; preset migration + seeding; service catalog →
access resolution and `searxngUrl` precedence; hook/MCP routing includes plugin-origin bindings
and mounts their `binDirs`; bridge grant/deny and schema validation. No e2e/HTTP tests. Written
after the phase is hand-tested.

## 18. Risks and MANIFEST questionnaire

This change touches file access, permissions, secret redaction, and network — answer before code.

- What it changes (resource): agent execution boundary; three network controls (sandbox egress,
  host-tool egress, bridge); a configurable filesystem policy; app-managed services; the org data
  mount set.
- Trade-offs: container start latency; several components to run (socket proxy, egress proxy,
  sandbox image); `readOnlyRoot` and strict seccomp reduce tool compatibility; bind-based roots
  require operator configuration; the bridge and socket proxy are privileged surfaces.
- Failure modes: no docker (fail-closed, queued); proxy down (`none`/host tools safe, `allowlist`
  fails closed); recreate colliding with a live run (idle gate); container/volume GC leak (idle
  GC); bind path outside roots (fail-closed); bridge grant missing (clear reason).
- Secrets: LLM keys stay in the server; only `secrets.inject` names reach the sandbox, via
  tmpfs env-file not `-e`; service env placeholders resolve from the vault; the sandbox has no
  socket and no host env.
- Rollback: set the org default preset to `host` and stop services; no code change.
