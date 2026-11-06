# Integration Add-on Model

The contract between the Harnesys core and a pluggable integration (Telegram, Google, GitHub, and the hundreds after them). An integration is present today and absent tomorrow, so the core must not know its tables, its entities, its routes, or its UI forms.

Follows the decision already recorded in `docs/connector-identity-link-plan.md`: the core has no connector-specific code, integrations depend on the core, never the reverse.

## Rules

1. No core table for integration data. An integration gets one SQLite file it owns.
2. No new literal in a core union. `ThreadKindSchema`, `RunTriggerKind`, `PlacementTriggerKind`, `PickerChoice`, `IntegrationProvider` stay closed; integrations reuse `kind: 'connector'` and string ids.
3. No `if (provider === 'x')` in core code, no per-provider switch in the capability catalog.
4. No core REST path per integration. An integration mounts under its own namespace and the core proxies it.
5. No core UI component per integration. The WebUI has an integration registry, one line per integration, and generic surfaces render from data.
6. Uninstall is one removal from two lists (server registry, webui registry) plus deleting the data directory. Everything else disappears with it.
7. An uninstalled integration contributes nothing anywhere. An installed but unconnected integration keeps its picker card and shows a connect action that opens its own settings surface: hiding the card turns a setup step into an invisible dead end.

## Seam package

`packages/harnesys` exports a new subpath `./integration` (`packages/harnesys/integration.ts`). Both sides import it: the core implements the host, an integration package consumes it. `harnesys` already holds the same shape for packs (`src/ports/*`, `definePack`), so no new package is needed for the contract.

```ts
export interface IntegrationDefinition {
  id: string;                       // kebab, 'telegram'
  title: string;
  version: string;
  icon?: string;
  setup?(ctx: IntegrationContext): Promise<void>;   // own DDL, idempotent
  start?(ctx: IntegrationContext): Promise<void>;   // workers, subscriptions
  stop?(ctx: IntegrationContext): Promise<void>;
  automations?: AutomationContribution;
  connection?(ctx: IntegrationContext): Promise<IntegrationConnectionState>;
}

export function defineIntegration(def: IntegrationDefinition): IntegrationDefinition;
```

`IntegrationContext` is the whole surface an integration may touch:

| member | core backing | notes |
| --- | --- | --- |
| `ctx.orgId` | `OrgMachineStore` | one context per org |
| `ctx.db` | `AddonDatabasePort` | scoped `bun:sqlite` handle, integration writes its own DDL |
| `ctx.secrets` | `SecretStorePort` | keys namespaced `integration:<id>:<key>`, AES-GCM, write-only over REST |
| `ctx.workers` | `AddonWorkerPort` | background loops with `lease.ts` single ownership, `ModuleInitHook`/`DestroyHook` driven |
| `ctx.automations` | `AutomationSnapshots` in the host | publishes the integration's automation items, replace-on-publish |
| `ctx.threads` | `ThreadFactoryPort` | create/open a thread with an existing `kind` |
| `ctx.runs` | `RunDispatcherPort` | wraps `SendThreadRunUseCase`, `trigger: { kind: 'connector', id }` |
| `ctx.events` | `DeskEventsPort` / events-watch hub | live push to the UI, no polling |
| `ctx.http` | `IntegrationRouterPort` | routes under `/api/orgs/:orgId/integrations/:id/*` |
| `ctx.logger` | `Logger` child | context already carries `integrationId` |

`ctx.runs.dispatch` is the only path into an agent run. It reuses `RunTriggerKind = 'connector'`, which already exists, so placement, fleet, SSE, and the run journal need no change.

## Automations read-model

One generic aggregate the sidebar and the picker render from:

```ts
interface AutomationItem {
  id: string;
  integrationId: string;          // 'core' | 'telegram' | ...
  kind: string;                   // 'schedule' | 'webhook' | 'telegram.feed'
  label: string;
  description: string;
  status: 'active' | 'paused' | 'failed';
  threadId: string;
  targetAgentId: string;
  connection: { required: boolean; connected: boolean };
  meta: Record<string, string>;   // 'Cron schedule', source count, endpoint host
  availableAt: string | null;
}
```

`GET /api/orgs/:orgId/automations` returns `{ items: AutomationItem[] }`, composed by `ListAutomationsUseCase` from three sources: the existing `schedules` rows, the existing `webhooks` rows, and `integration.automations.list(orgId)` for every installed integration. Scheduler and webhook keep their own tables and endpoints; the read-model is a projection, not a migration.

Create, update, and delete stay with the owner: Scheduler and Webhook keep their own controllers and use-cases, an integration exposes its own routes under `/orgs/:orgId/integrations/:id/*` and publishes the resulting items through `ctx.automations.publish`. The core aggregate is read-only.

The picker stops being a literal. `automation-create-picker-dialog.tsx` renders one `AutomationCard` per contribution where `connection.connected === true`, plus the two core cards. `AutomationsSection` counts `items.length` instead of `schedules.length + webhooks.length`. A card whose integration is not connected is absent, not disabled.

## Storage

`AddonDatabasePort.open(orgId, integrationId)` returns a `bun:sqlite` handle at `layout.orgDataDir(orgId)/integrations/<id>/data.db`, created on demand, `PRAGMA journal_mode = WAL`, foreign keys on. `setup(ctx)` runs the integration's own idempotent DDL there.

Consequences:

- The core never sees a table name from an integration, and `org.db` does not grow with the number of integrations.
- Backups, per-org delete (`removeOrgDataDir`), and disk accounting keep working, because the file lives under the org data dir.
- Uninstall deletes the directory. No orphan rows, no schema to drop.
- Query power stays with the integration: joins, indexes, and FTS are available to it.

The alternative considered and rejected is a shared `addon_records(integration_id, collection, id, json)` KV table: one core table, no per-integration DDL, but every real query ("posts of this source where outcome is fired, newest first") turns into JSON scanning, and the core owns a growth surface it cannot index.

Secrets stay in `secrets` (`SecretStorePort`), never in the add-on database, so the org.db backup policy and the AES-GCM envelope keep covering them.

## WebUI registry

`apps/webui/src/integrations/<id>/index.ts` exports a descriptor: `{ id, title, icon, card, surfaces, automationKinds }`, listed once in `apps/webui/src/integrations/registry.ts`. Generic surfaces (`connectors-pane.tsx`, `automations-section.tsx`, `automation-surface.tsx`, the dialog host) look up the descriptor by `integrationId` and hand it the item. Today `connector-detail-page.tsx:160–184` is an `if`-chain over `telegram|google|github`; that chain becomes the registry lookup.

## Implemented surface

| piece | file |
| --- | --- |
| seam contract | `packages/harnesys/src/integration/{types,define-integration,index}.ts`, subpath `harnesys/integration` |
| read-model DTOs | `packages/contracts/src/automations.ts` (`AutomationItem`, `AutomationKind`) |
| add-on db | `domain/integration/addon-database.port.ts` (`open`, `close`, `remove`) + `infra/integrations/addon-database.adapter.ts` |
| host | `infra/integrations/integration-host.ts` (`sync(orgId)`, `automationItems(orgId)`, `automationKinds(orgId)`, `handle(request)`), behind `domain/integration/integration-host.port.ts` so REST never imports infra |
| workers | `infra/integrations/addon-workers.ts`, lease table `addon_leases` created by the host inside the add-on file |
| REST | `api/rest/automations.controller.ts` (`GET /orgs/:orgId/automations`, `GET .../kinds`), `api/rest/integration-routes.controller.ts` (forwarder for the five verbs under `/orgs/:orgId/integrations/:integrationId/*`) |
| live push | `packages/studio-shared/src/events-watch.ts` frame `automations-changed` (`{orgId, kind, action}`), no new `DeskEvent` variant |
| WebUI seam | `apps/webui/src/integrations/{types,registry}.ts`, `features/manage-automations/model/use-automation-config.ts`, `widgets/project-sidebar/ui/automation-row.tsx` |

`automationKinds(orgId)` drops contributions with `requiresConnection: true` while `connection(ctx)` reports the integration unconnected, and sets `connected` on the kinds it returns. The forwarder route replaced the `ctx.http` mount idea: boot stays static and an integration declares routes as data.

## Connection UX

An integration connection looks like the Google one: open the integration page, run the connect flow (register the app outside Harnesys, paste `api_id`/`api_hash`, or authorize OAuth), and the capabilities appear once the account is connected. Extra capabilities of the same service are sections of that same page, which is where the Telegram user account (reader) lives next to the Telegram bot.

A trigger card in Automations is contributed only by a connected integration. Before that the picker shows nothing for it, and the integration page is where the user finds the connect step.

## Registration list

`apps/server/src/app/infra/integrations/installed-integrations.ts` holds the only server-side reference to any integration:

```ts
export const INSTALLED_INTEGRATIONS: IntegrationDefinition[] = [telegramIntegration];
```

`IntegrationHostModule` iterates it, calls `setup` and `start` per org, builds the context, and registers routes. Adding an integration touches this one array and the webui registry file. Removing it touches the same two places.

A git-installed TS integration (the `plugins` path, `PluginKind` including the parsed-but-unexecuted `monitor`) is the eventual delivery vehicle for third-party code. That needs a module loader and a sandbox, which is separate work; the seam above does not change when it arrives, only the source of `INSTALLED_INTEGRATIONS`.

## Migration of what exists

Not part of this change, recorded so the direction is explicit:

| today | target |
| --- | --- |
| `connectors`, `connector_inbox`, `connector_deliveries` core tables | telegram add-on file, core keeps no chat-channel schema |
| `IntegrationProvider = 'google' \| 'github'` | string id from the descriptor |
| `CONNECTOR_CATALOG` with a 7-value `z.enum` | descriptors published by installed integrations |
| `integration-token-dispatch.adapter.ts:34–45` provider switch | token adapters registered by integrations |
| `org-pack-list.ts` `HOST_WIRED_PACKS` and two `registrationForPack` switches | pack registrations contributed by integrations |
| `PickerChoice = 'scheduler' \| 'webhook'` | contributions from the automations read-model |

## Open questions

- Two orgs on one machine sharing one integration process: the context is per org, so the add-on opens one db and one worker set per org. Whether a single MTProto session may be shared across orgs is a product decision, currently no.
- Whether `AutomationItem.meta` stays `Record<string, string>` or becomes a typed contribution with a render hint. Start with the record, revisit on the second integration that needs more.
- The Automations read-model refreshes on mount, on the `automations-changed` frame, and after local actions. A failed refresh after an event leaves the previous rows visible until the next successful fetch; there is no error banner for that slice yet.
- `IntegrationProvider = 'google' | 'github'`, `CONNECTOR_CATALOG`, and the `connector-detail-page.tsx` if-chain still describe integrations statically. Moving them onto descriptors is the next step, and the telegram bot connector (`connectors`, `connector_inbox`, `connector_deliveries`) is still core-schema debt against rule 1.
