# Contributions: семейства вкладов

Вклады — статические объявления в `addon.json.contributions`. Каждое **семейство** — точка расширения ядра: хост владеет политикой (лимиты, согласования, назначения), аддон приносит дескрипторы (данные) и обработчики (код в своём процессе). Реестр семейств — `packages/sdk/src/families/registry.ts` (SDK — источник истины, контракты сервера `AddonPlatformFamilySchema` переэкспортируют `FAMILY_NAMES`).

```json
{ "id": "pack", "family": "tool-pack", "v": 1, "optional": false, "descriptor": { } }
```

| Семейство | Ключ `defineAddon` | Вызов хоста | Право |
|---|---|---|---|
| `tool-pack` | `tools` (по имени тула) | `tools.call` | — |
| `route` | `routes` (по id вклада) | `route.handle` | `routes.public` для public |
| `trigger` | `triggers` (по `kind`) | `trigger.start/stop` + `ctx.triggers.fire` | `trigger` |
| `job` | `jobs` (по `descriptor.id`) | `job.run` | — |
| `worker` | `workers` (по `descriptor.id`) | `worker.start/stop` + `ctx.workers.*` | `worker` |
| `hook` | `hooks` (по `descriptor.id`) | `hook.deliver` | `events.subscribe` / `accounts.use` |
| `transport` | `transport` | `transport.send/edit/typing` + `ctx.bridge.inbound` | `bridge.inbound` |
| `source-kind` | `sources` (по id kind-а) | `source.*` | `source` |
| `content` | — (файлы пакета) | хост регистрирует скиллы | — |
| `config` | — (`notifications['config.changed']`) | уведомление | `config.read` (базовое) |
| `view` | — (данные через `route`) | рендер секций | — |
| `mcp`, `lsp` | — | **заглушки**: дескрипторы принимаются, потребителя нет | — |

Правило соответствия: вклад без обработчика → `incompatible_handlers` на рукопожатии; обработчик без вклада → хост его никогда не зовёт. `optional: true` на вкладе с неизвестным семейством — warning и пропуск, а не отказ.

## tool-pack — инструменты агентов

Единица назначения агенту — пак (не одиночный инструмент): имя, описание, иконка, скиллы, общие настройки.

```json
{
  "id": "pack", "family": "tool-pack",
  "descriptor": {
    "name": "github",
    "title": "GitHub tools",
    "description": "Read GitHub data",
    "connection": "github",
    "specFields": [{ "key": "default_repo", "label": "Default repo", "type": "text", "required": false }],
    "skills": ["triage-guide"],
    "tools": [{
      "name": "user",
      "description": "Fetch a user profile",
      "inputSchema": { "type": "object", "properties": { "login": { "type": "string" } }, "required": ["login"] },
      "effect": "read",
      "timeoutSec": 30,
      "maxResultKb": 64,
      "idempotent": true
    }]
  }
}
```

```ts
const addon = defineAddon({
  tools: {
    user: async (input, ctx) => {
      const res = await ctx.http.fetch({
        url: `https://api.github.com/users/${String(input.login)}`,
        auth: { connection: 'github', scheme: 'bearer' },
        responseEncoding: 'text',
      });
      return { status: res.status, profile: res.body ? JSON.parse(res.body) : null };
    },
  },
});
```

- Глобальное имя пака — `<addonId>.<name>`; имя инструмента для LLM — `<addonId>.<tool>` с заменой спецсимволов на `_`.
- Хост валидирует вход описанной `inputSchema` **до** вызова, результат — после (`invalid_params` / `invalid_response`).
- `inputSchema` — подмножество JSON Schema: `type, properties, required, items, enum, const, additionalProperties, мин/макс, pattern, minItems/maxItems, uniqueItems, ограниченные oneOf/anyOf, description, default, $defs/локальные $ref`; глубина ≤ 8, размер ≤ 64 KiB, внешних `$ref` нет. Валидатор — `validateInputSchema`.
- `effect: 'read' | 'write' | 'destructive'` — политика согласований ядра строится на нём; аддон понизить её не может. `idempotent` разрешает безопасные повторы.
- `timeoutSec` (default 60, потолок 600), `maxResultKb` (default 256).
- `connection` — пак требует привязку: без неё вызовы инструментов возвращают `account_failed` (`needs_setup` на UI).
- `specFields` — [FieldSpec](ui.md#fieldspec), параметры пака на уровне назначения агенту.
- `skills` — ссылки на вклады `content` kind `skill`, показываются вместе с паком.

## trigger — виды триггеров автоматизаций

Глобальный kind — `<addonId>.<descriptor.kind>`. Вклад появляется в каталоге автоматизаций (`AddonTriggerCatalogContributor`), карточка показывается только при включённом аддоне. Пользователь создаёт **экземпляры** (конфиг по `configFields` + цель), хост вызывает `trigger.start` при включении экземпляра и при каждом старте процесса (replay — будьте идемпотентны).

```json
{
  "id": "cron", "family": "trigger",
  "descriptor": {
    "kind": "scheduler.cron",
    "title": "Cron schedule",
    "description": "Run an agent on a cron schedule",
    "connection": "github",
    "configFields": [
      { "key": "cron", "label": "Cron", "type": "text", "required": true, "default": "0 9 * * *", "widget": { "kind": "cron" } },
      { "key": "miss_policy", "label": "If a run is missed", "type": "select", "required": false, "default": "catch-up",
        "options": [{ "value": "catch-up", "label": "Catch up" }, { "value": "skip", "label": "Skip" }] }
    ],
    "limits": { "perDay": 100, "throttleSec": 5, "maxBurst": 3 },
    "standard": { "instructions": { "label": "Message to the agent" } }
  }
}
```

```ts
const myTrigger: TriggerPair = {
  start: async (params, ctx) => {
    // params: { instanceId, kind, label?, config, target? }
    await ctx.db.run('insert into instances … ', [params.instanceId, JSON.stringify(params.config)]);
  },
  stop: async (params, ctx) => { /* instanceId выключен */ },
};

// когда событие произошло:
const { outcome } = await ctx.triggers.fire({
  instanceId, runKey: `${instanceId}:${event.id}`, text: 'Что сделать агенту', payload: { raw: event },
});
// outcome: fired | suppressed (дубль runKey) | busy (активный запуск в цели) | failed
```

- Цель экземпляра: `threadId`, `agentId`, `modeId` — хост подставляет в диспатч; `target` приходит в `trigger.start`.
- Дедупликация по `(instanceId, runKey)` в ядре, окно 7 суток; лимиты `perDay/throttleSec/maxBurst` enforcing хостом.
- `standard` — переопределение стандартных блоков формы (name/agent, wake thread, run mode, instructions): `disabled`, `label`, `help`, `required`.
- Право `trigger` обязательно для `ctx.triggers.fire`.

## job — периодические задачи

Расписанием владеет хост (Croner), состояние — `addon_job_state`; аддон просто реализует обработчик.

```json
{
  "id": "heartbeat", "family": "job",
  "descriptor": {
    "id": "heartbeat", "title": "Heartbeat",
    "schedule": { "everySec": 60 },
    "timezone": "org", "catchUp": "once", "defaultEnabled": true, "timeoutSec": 300
  }
}
```

```ts
const addon = defineAddon({ jobs: { heartbeat: async (params, ctx) => { /* ctx.db, ctx.http… */ } } });
```

- `schedule`: `{ cron: '*/5 * * * *' }` (croner) или `{ everySec: 60 }`; `timezone`: `org` (настройка организации) | `utc`.
- `catchUp: 'once'` — один догоняющий запуск после простоя, `'none'` — пропуск.
- Пересечение запусков пропускается (single-flight на джоб). Таймаут default 900 с, потолок 3600 с.
- Админ включает/выключает и жмёт **Run now** (`PATCH/POST .../jobs/:jobId`) на странице аддона.
- Расписание из кода задать нельзя — только вкладом.

## worker — фоновая активность

```json
{ "id": "poller", "family": "worker", "descriptor": { "id": "poller", "title": "Updates poller", "autostart": true, "restart": "on-failure" } }
```

```ts
const poller: WorkerPair = {
  start: async (_params, ctx) => {
    await ctx.workers.report('poller', 'running');
    while (!ctx.signal.aborted) {
      const lease = await ctx.workers.lease('poller', 60_000); // durable lease, переживает рестарт
      if (lease.held) {
        try { await pollOnce(ctx); }
        catch (e) { await ctx.workers.report('poller', 'failed', 'poll'); throw e; }
      } else {
        await sleep(5_000); // держит другой экземпляр
      }
    }
    await ctx.workers.report('poller', 'stopped');
  },
  stop: async (_params, ctx) => { await ctx.workers.release('poller'); },
};
```

- `autostart: true` — `worker.start` при каждом старте экземпляра (после replay); `restart: 'on-failure'` — автоперезапуск через 5 с после `report('failed')`.
- Лизинг (`ctx.workers.lease/release`, `ttlMs` 5 с–1 час) живёт в `addon_worker_leases` — два узла не будут поллить одновременно.
- Остановка — `worker.stop` и отмена `ctx.signal`.
- Право `worker`. Референс — поллер `harnesys.telegram-bot` (offset в `ctx.db`, дедуп входящих, `AbortController` снапшот).

## route — HTTP-эндпоинты

```json
{ "id": "items-create", "family": "route",
  "descriptor": { "id": "items-create", "method": "POST", "path": "/items", "role": "member",
                  "exposure": "org", "bodyLimitKb": 64, "requestSchema": { "type": "object", "required": ["text"] } } }
```

```ts
const create: RouteHandler = async (call, ctx) => {
  const body = call.request.body as { text?: string };
  await ctx.db.run('insert into items (text) values (?)', [body.text]);
  return { status: 201, body: { ok: true } };
};
```

- Org-маршруты: `/api/orgs/:orgId/addons/:addonId/r/<path>` (auth сессией организации; `role: 'member' | 'admin'`). В URL попадает **`path` дескриптора**, а не id вклада: `/items` → `.../r/items`, `.../r/items/:id`.
- Публичные (`exposure: 'public'`): `/api/addons/public/:orgId/:addonId/r/<path>` без org-auth; требуют `routes.public` (high), лимит 20 req/s (burst 40); комбинация `public + role: admin` запрещена.
- `:param` сегменты в path; хендлер получает сырой `request` (`{ method, path, query, headers, body? }`) и парсит параметры сам (см. `instanceIdFromPath` в [Анатомии](anatomy.md)).
- `requestSchema` (то же подмножество JSON Schema) валидирует тело хостом до вызова; `bodyLimitKb` ограничивает размер.
- Результат `{ status, headers?, body? }`. Те же маршруты обслуживают `table.source`, `form.submit`, `actions.route`, `optionsFrom.addonRoute`.

## transport — чат-транспорт

Делает аддон транспортом внешнего мессенджера; мост (привязка чат↔тред, эхо-политика, стриминг ответов агента) — на хосте.

```json
{ "id": "channel", "family": "transport",
  "descriptor": {
    "provider": "telegram", "title": "Telegram", "connection": "telegram-bot",
    "capabilities": { "threads": true, "edit": true, "typing": true, "attachments": true, "topics": true, "reactions": false, "readReceipts": false },
    "limits": { "textMax": 4096 }
  } }
```

```ts
const transport: TransportHandlers = {
  send: async ({ message }, ctx) => { /* вызов API провайдера; message.options — HITL-вопрос */ return { messageId }; },
  edit: async ({ messageId, message }, ctx) => { /* … */ },
  typing: async ({ channel, on }, ctx) => { /* … */ },
};
// входящие: из worker-поллера или route-вебхука
await ctx.bridge.inbound({ channel: `telegram:${chatId}`, from: `telegram:${userId}`, text, payload: {...} });
```

Полностью — [Чат-транспорты](transport.md).

## hook — события ядра и провайдера

```json
[
  { "id": "thread-created", "family": "hook", "descriptor": { "id": "thread-created", "on": { "event": "thread.created" } } },
  { "id": "push", "family": "hook", "descriptor": { "id": "push", "on": { "providerEvent": { "connection": "github", "types": ["push"] } } } }
]
```

```ts
const addon = defineAddon({
  hooks: { 'thread-created': async ({ hookId, event }, ctx) => { /* event: { name, version, occurredAt, payload } */ } },
});
```

- `on.event` — шаблон шины организации (`thread.created`, `run.started`, `run.finished`, `run.failed`, `run.parked`, `run.cleared`, `addon.*`); требует `events.subscribe` scope `{ patterns }` с покрывающим паттерном.
- `on.providerEvent` — события провайдера из Apps (webhook-доставки connection-аккаунтов), фильтруются по `types`, доставляются только если аккаунт привязан к `connection`.
- Доставка at-most-once: очередь на аддон 256 (drop-oldest), вызов ≤ 10 с, хост лениво поднимает процесс перед доставкой. Гарантии нужны — стройте на триггерах/джобах, не на хуках.

## content — скиллы и промпты

```json
{ "id": "howto", "family": "content", "descriptor": { "id": "howto", "title": "How to use", "kind": "skill", "path": "content/howto" } }
```

Файлы пакета (`path` от корня; skill — каталог с `SKILL.md`) регистрируются как скиллы организации; ни кода, ни обработчика нет. Ссылки из паков — `tool-pack.skills`.

## config — поля настроек

```json
{
  "id": "settings", "family": "config",
  "descriptor": { "fields": [
    { "key": "default_github_login", "label": "Default GitHub login", "type": "text", "required": true },
    { "key": "api_note", "label": "API note", "type": "secret", "help": "Stored in the host secret store" },
    { "key": "filters", "label": "Filters", "type": "group", "required": false, "advanced": true,
      "fields": [{ "key": "labels", "label": "Labels", "type": "select", "multi": true,
                   "required": false, "optionsFrom": { "kind": "addonRoute", "route": "labels", "valueKey": "id", "labelKey": "name" } }] }
  ] }
}
```

`type`: `text | secret | textarea | url | select | number | boolean | group`. Чтение в рантайме — `ctx.config.get` (секретные поля там не появляются, для них `ctx.secrets.get`). Полный [FieldSpec](ui.md#fieldspec).

## view — секции страницы аддона

```json
{ "id": "main", "family": "view",
  "descriptor": { "id": "main", "title": "Overview", "sections": [
    { "type": "status" }, { "type": "table", "title": "Schedules", "source": { "route": "/schedules" },
      "columns": [{ "key": "name", "label": "Name", "format": "text" }, { "key": "nextRunAt", "label": "Next run", "format": "datetime" }] }
  ] } }
```

Не более одного view на аддон. Закрытый набор типов секций, порядок расставляет фронтенд. Подробности — [UI аддона](ui.md).

## source-kind — облачные знание-источники

```json
{ "id": "google-drive", "family": "source-kind", "descriptor": { "id": "google-drive", "title": "Google Drive folder", "connection": "google" } }
```

Хост-пайплайн зеркалирования вызывает `source.list/stat/download` (обязательные) и `upload/mkdir/remove/export` (опциональные — capabilities выводятся из объявленных обработчиков). Байды идут base64-чанками (4 MiB на вызов в мосту), вендорный auth — на стороне аддона через `ctx.http.fetch auth`. Референс — `harnesys.google-drive`; право `source`.

## mcp / lsp

Дескрипторы принимаются и регистрируются, потребителей нет. Не стройте на них поведение интеграций; следите за [перспективой](roadmap.md).

---

Дальше: [SDK API](sdk.md) · [AddonContext](context.md)
