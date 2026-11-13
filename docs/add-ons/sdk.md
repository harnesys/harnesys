# SDK API: `@harnesys/sdk`

`@harnesys/sdk` — leaf-пакет для авторов аддонов: манифест, протокол, семейства, права, `defineAddon`, контекст, тестирование. Единственная runtime-зависимость — `zod` (v4). Из кода SDK в ядро не импортируется ничего, и аддон по гейту линтера импортирует только SDK.

- Пакет: `@harnesys/sdk` (в монорепо `packages/sdk`, v0.1.0, скоро переедет в npm отдельным релизом).
- Экспортные пути: `@harnesys/sdk` (всё) и `@harnesys/sdk/testing` (fake-хост).
- Установка в монорепо-аддоне: `"@harnesys/sdk": "file:../../packages/sdk"`; в standalone-пакете — `bun add @harnesys/sdk`.

## Точка входа

### `defineAddon(definition): ResolvedAddonDefinition`

```ts
interface AddonDefinition {
  tools?:         Record<string, ToolHandler>;        // ключ — имя тула из tool-pack
  routes?:        Record<string, RouteHandler>;       // ключ — id route-вклада
  triggers?:      Record<string, TriggerPair>;        // ключ — descriptor.kind
  jobs?:          Record<string, JobHandler>;         // ключ — descriptor.id
  workers?:       Record<string, WorkerPair>;         // ключ — descriptor.id
  hooks?:         Record<string, HookHandler>;        // ключ — descriptor.id
  transport?:     TransportHandlers;                  // { send?, edit?, typing? }
  sources?:       Record<string, SourceBackendHandlers>; // ключ — id source-kind
  lifecycle?:     LifecycleHandlers;                  // { upgrade?({ fromVersion }, ctx) }
  notifications?: NotificationHandlers;               // 'config.changed' | 'permissions.changed' | 'accounts.changed'
}
```

Сигнатуры хендлеров (все получают второй аргумент `ctx: AddonContext`):

```ts
type ToolHandler    = (input: Record<string, unknown>, ctx) => unknown | Promise<unknown>;
type RouteHandler   = (params: { routeId: string; request: RouteRequest }, ctx) => { status; headers?; body? };
type JobHandler     = (params: { jobId: string }, ctx) => void | Promise<void>;
type HookHandler    = (params: { hookId: string; event: Record<string, unknown> }, ctx) => void | Promise<void>;
interface TriggerPair { start(params: { instanceId; kind; label?; config; target? }, ctx): void|Promise<void>;
                        stop(params:  { instanceId }, ctx): void|Promise<void>; }
interface WorkerPair  { start(params: { workerId }, ctx): void|Promise<void>;
                        stop(params:  { workerId }, ctx): void|Promise<void>; }
interface TransportHandlers {
  send?({ message, }, ctx): Promise<{ messageId?: string } | void>;
  edit?({ messageId, message }, ctx): void | Promise<void>;
  typing?({ channel, on }, ctx): void | Promise<void>;
}
interface SourceBackendHandlers {
  list; stat; download;                      // обязательные
  upload?; mkdir?; remove?; export?;         // опциональные — возможности выводятся из наличия
}
```

### `deriveHandlers`

`deriveHandlers(definition): string[]`. `defineAddon` добавляет к определению поле `handlers` — список методов host→addon, объявляемых в рукопожатии: всегда `['ping', 'shutdown']`, далее по непустым секциям: `tools → tools.call`; `routes → route.handle`; `triggers → trigger.start + trigger.stop`; `jobs → job.run`; `workers → worker.start + worker.stop`; транспорт поштучно (`transport.send/edit/typing`); `hooks → hook.deliver`; `sources → source.list/stat/download` плюс `source.upload/mkdir/remove/export` только если реализованы хоть у одного бэкенда; `lifecycle.upgrade` при наличии.

### `startAddonProcess(options): Promise<void>`

```ts
await startAddonProcess({
  definition: addon,                        // результат defineAddon
  addon: { id: 'acme.greeter', version: '1.0.0' },
  wiring?,                                  // опционально: свой stdin/stdout/stderr (для тестов/обёрток)
});
```

Поднимает NDJSON JSON-RPC поверх stdio: параллельный dispatch строк (ответы хоста не блокируют цикл), `$/cancel` → abort по id, ошибки → JSON-RPC коды, `PROTOCOL_PLATFORM` (=1). Стандартная форма входа:

```ts
if (import.meta.main) {
  await startAddonProcess({ definition: addon, addon: { id: ADDON_ID, version: ADDON_VERSION } });
}
```

### Низкий уровень: `createAddonRuntime`, каналы, meta

```ts
const runtime = createAddonRuntime({ definition, addon, channel, now? }); // in-process цикл без stdio
const channel = createStdioChannel(wiring);                               // stdio-канал (host-клиент+сервер)
createHostClient(channel, getMeta): HostServiceClient                     // типизированный клиент сервисов
createAddonContextFor(channel, meta, signal): AddonContext                // контекст поверх канала
parseCallMeta(raw): CallMeta                                              // разбор params._meta
```

`AddonRuntime` используется in-process загрузчиком хоста и fake-хостом; автору аддона обычно нужны только `defineAddon` + `startAddonProcess`.

## Ошибки

```ts
class AddonError extends Error {
  constructor(reason: AddonErrorReason, options?: { retryable?: boolean; detail?: string; accountCode?: string });
  toData(): AddonErrorData;
}
```

16 причин — `AddonErrorReason`: `invalid_params`, `invalid_response`, `permission_denied`, `not_found`, `conflict`, `quota_exceeded`, `rate_limited`, `timeout`, `cancelled`, `unavailable`, `unsupported`, `account_failed`, `incompatible_handlers`, `migration_failed`, `permission_revoked`, `internal`. Наружу из процесса уходят только коды (инвариант платформы), `detail` — в журнал.

## Манифест как код

```ts
import { parseAddonManifest, validateManifest, manifestJsonSchema,
         contributionDescriptorJsonSchema, resolveL10n, l10nKeys } from '@harnesys/sdk';

const manifest = parseAddonManifest(JSON.parse(raw));       // Zod-проверка, бросает при битом
const { manifest: m, violations } = validateManifest(raw);  // все нарушения разом, severity error|warning
```

Типы: `AddonManifest`, `Contribution`, `PermissionRequest`, `ConnectionRequirement`, `L10n`, `AddonRuntimeSpec`, `AddonDataSpec` — см. [Манифест](manifest.md).

## Права как код

```ts
BASELINE_PERMISSION_IDS   // ['config.read','log','db','secrets.own','events.emit.own','org.read']
KNOWN_PERMISSION_IDS      // полный каталог из 25 id (6 базовых + 19 привилегий) — см. [Права](permissions.md)
isKnownPermissionId(id) / isBaselinePermissionId(id)
type PermissionRequest = { id: string; scope?: JsonObject; reason: string; optional?: boolean };
type EffectivePermission = { id: string; scope?: JsonObject };
```

## Семейства как код

Для каждого семейства SDK экспортирует `*_SCHEMA_VERSION` (=1), TS-интерфейс дескриптора, Zod-схему и family-объект `{ family, versions, schema(v) }`: `toolPackFamily`, `triggerFamily`, `jobFamily`, `workerFamily`, `routeFamily`, `transportFamily`, `hookFamily`, `contentFamily`, `configFamily`, `viewFamily`, `sourceKindFamily`, `mcpFamily`, `lspFamily`. Реестр: `familyRegistry`, `FAMILY_NAMES` (13 имён), `familyDefinition(family)`.

Дескрипторные типы: `ToolPackDescriptor`, `ToolDescriptor`, `TriggerDescriptor` (+ `TriggerLimits`), `JobDescriptor`, `WorkerDescriptor`, `RouteDescriptor`, `TransportDescriptor` (+ `TransportCapabilities`), `HookDescriptor`, `ContentDescriptor`, `ConfigDescriptor`, `ViewDescriptor` (+ `ViewSection`, `Column`, `Action`, `RouteRef`), `SourceKindDescriptor`, `FieldSpec` (+ `fieldVisible`, `defaultConfigValues`), `JsonSchemaSubset` (+ `validateInputSchema`, `INPUT_SCHEMA_MAX_DEPTH/BYTES`).

Зачем это автору: типизировать свой `addon.json` в коде, генерировать манифесты инструментов, писать тесты манифеста:

```ts
import { ToolDescriptorSchema, FieldSpecSchema } from '@harnesys/sdk';
ToolDescriptorSchema.parse(myToolDescriptor); // та же схема, что у валидатора хоста
```

## Протокол как код

```ts
import { protocolMap, PROTOCOL_METHODS, methodSpec, protocolEntries } from '@harnesys/sdk';
import type { HostServiceClient, AddonDispatcher, CallMeta, TransportMessage, RouteRequest } from '@harnesys/sdk';

PROTOCOL_METHODS.length // 61 метод: host↔addon, сервисы, нотификации
const spec = methodSpec('db.run'); // { direction, params, result, permission }
```

Типы, выведенные из карты: `ParamsOf`, `ResultOf`, `HostRequestName`, `HostServiceName`, `AddonHandlerOf`, `HostNotify`, `AddonNotify`, `stripMeta`. Конверт: `encodeMessage`/`decodeMessage`, `MAX_MESSAGE_BYTES = 8 MiB`, `JSONRPC_VERSION`, `PROTOCOL_PLATFORM = 1`. Полное описание — [Протокол](protocol.md).

## `@harnesys/sdk/testing`

`createFakeHost`, `createFakeDb`, `guardSql`, `SqlAuthorizerError`, тип `FakeHost` — в [Тестировании](testing.md); фикстуры `validManifest()`/`demoDefinition()` — внутренний модуль `testing/fixtures.ts`, из `@harnesys/sdk/testing` не реэкспортируются.

## Каркас typical аддона

```ts
// src/index.ts
import { AddonError, defineAddon, startAddonProcess } from '@harnesys/sdk';
import type { AddonContext } from '@harnesys/sdk';

export const addon = defineAddon({
  tools: { /* … */ },
  routes: { /* … */ },
  hooks: { /* … */ },
  lifecycle: {
    upgrade: async ({ fromVersion }, ctx: AddonContext) => {
      // JS-миграции после SQL-миграций
    },
  },
  notifications: {
    'config.changed': async (params, ctx) => { await ctx.log.info('config changed', { keys: params.keys }); },
  },
});

if (import.meta.main) {
  await startAddonProcess({ definition: addon, addon: { id: 'acme.thing', version: '1.0.0' } });
}
```

---

Дальше: [AddonContext](context.md) · [Тестирование](testing.md)
