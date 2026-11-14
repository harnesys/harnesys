# Анатомия аддона: harnesys.webhook целиком

`harnesys.webhook` — наименьший из реальных аддонов платформы (~220 строк со SQL). Он решает задачу «разбудить тред агента HTTP-вызовом» и покрывает типичный набор: trigger-вклад, публичный route, org-route для UI-таблицы, view, миграции, `ctx.triggers.fire`, `ctx.db`, `ctx.log`. Здесь он приведён построчно — копируйте эту форму.

## Пакет

```
add-ons/harnesys.webhook/
  addon.json          # манифест (89 строк)
  package.json        # deps: @harnesys/sdk, @harnesys/studio-shared; build: bun build --target=bun
  src/index.ts        # defineAddon + startAddonProcess (17 строк)
  src/hook.ts         # триггер-пара + route-хендлеры (100 строк)
  src/store.ts        # доступ к ctx.db (94 строки)
  migrations/
    0001_init.sql
    0002_instance_label.sql
  dist/index.js       # бандл — runtime.entry
```

Замечание: `@harnesys/studio-shared` — внутренняя shared-библиотека монорепо (промпт-хелперы). builtin-аддонам её импорт дозволен, внешнему пакету — нет: снаружи только `@harnesys/sdk`.

## Манифест

```json
{
  "id": "harnesys.webhook",
  "version": "1.0.0",
  "platform": 1,
  "title": "Webhook",
  "description": "HTTP triggers for agent threads. Every webhook.http trigger instance is bound to a thread and exposed on a public POST endpoint; a request wakes the thread with the payload text. A busy thread reports queued-behind-active-run, a paused instance reports paused.",
  "runtime": { "entry": "dist/index.js", "profile": "trusted" },
  "activation": "lazy",
  "connections": [],
  "permissions": [
    { "id": "trigger", "reason": "Fire webhook.http instances when their public endpoint is called" },
    { "id": "routes.public", "reason": "Expose the public POST endpoint that wakes the thread" }
  ],
  "data": { "migrations": "migrations", "quotaMb": 8 },
  "contributions": [
    {
      "id": "http",
      "family": "trigger",
      "descriptor": {
        "kind": "webhook.http",
        "title": "Webhook",
        "description": "Trigger from an HTTP POST endpoint",
        "configFields": [
          { "key": "detail", "label": "Fallback payload", "type": "textarea",
            "required": false, "help": "Sent when the request has no text" }
        ]
      }
    },
    {
      "id": "hook",
      "family": "route",
      "descriptor": { "id": "hook", "method": "POST", "path": "/:instanceId",
                      "role": "member", "exposure": "public", "bodyLimitKb": 64 }
    },
    {
      "id": "instances",
      "family": "route",
      "descriptor": { "id": "instances", "method": "GET", "path": "/instances", "role": "member" }
    },
    {
      "id": "main",
      "family": "view",
      "descriptor": {
        "id": "main",
        "title": "Webhook",
        "sections": [
          { "type": "status" },
          { "type": "capabilities" },
          { "type": "permissions" },
          { "type": "automations", "triggers": ["webhook.http"] },
          { "type": "table", "title": "Webhooks", "source": { "route": "/instances" },
            "columns": [
              { "key": "name", "label": "Name", "format": "text" },
              { "key": "endpoint", "label": "Endpoint", "format": "text" },
              { "key": "status", "label": "Status", "format": "badge" },
              { "key": "lastFiredAt", "label": "Last fired", "format": "datetime" },
              { "key": "fires", "label": "Fires", "format": "number" },
              { "key": "threadId", "label": "Thread", "format": "text" }
            ] },
          { "type": "markdown", "body": "Every webhook is a trigger instance bound to a thread and a public POST endpoint. …" }
        ]
      }
    }
  ]
}
```

Что здесь важно:

- Декларированы только **небазовые** права: `trigger` (для `triggers.fire`) и `routes.public` (high-risk, для публичного endpoint). `db`, `log`, `config.read` и прочие базовые — неявно.
- `activation: 'lazy'` — процесс стартует на первый запрос/событие и выключается после 5 минут покоя: слушателем вебхука является маршрут хоста, resident-процесс не нужен.
- Публичный route без аутентификации — поэтому в markdown прямо сказано «трактуйте URL как секрет».
- `view` собирает страницу из манифеста без единой строчки UI-кода; данные таблицы отдаёт тот же аддон через route `/instances` в контракте `{ rows }`.

## Точка входа

```ts
// src/index.ts
import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { hook, instances, webhookTrigger } from './hook.ts';

const ADDON_ID = 'harnesys.webhook';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  triggers: { 'webhook.http': webhookTrigger },
  routes: { hook, instances },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
```

- `triggers` ключуется **kind**-ом из дескриптора (`webhook.http`), а не id вклада (`http`).
- `routes` ключуется id вклада: вклад `hook` → хендлер `hook`.
- Именованный экспорт `addon` — контракт in-process-загрузчика хоста; `import.meta.main` — чтобы импорт бандла не поднимал stdio-цикл.

## Триггер и маршруты

```ts
// src/hook.ts (фрагменты)
export const webhookTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    await upsertWebhook(ctx, params.instanceId,
      typeof params.label === 'string' ? params.label : '', params.config);
    await ctx.log.info('webhook instance started', { instanceId: params.instanceId });
  },
  stop: async (params, ctx: AddonContext) => {
    await pauseWebhook(ctx, params.instanceId);
    await ctx.log.info('webhook instance paused', { instanceId: params.instanceId });
  },
};
```

`trigger.start` приходит при включении экземпляра триггера и при каждом старте экземпляра аддона (replay) — поэтому upsert идемпотентен. `trigger.stop` — при выключении.

Публичный хендлер:

```ts
export const hook: RouteHandler = async (call, ctx: AddonContext) => {
  const instanceId = instanceIdFromPath(call.request.path);   // путь несёт сырой subpath
  const webhook = await findWebhook(ctx, instanceId);
  if (!webhook) return { status: 404, body: { error: 'webhook not found' } };
  if (webhook.status !== 'active') return { status: 202, body: { status: 'paused' } };

  const result = await ctx.triggers.fire({
    instanceId,
    runKey: crypto.randomUUID(),
    text: webhookTaskText(webhook.name, payloadText(call.request.body) || webhook.detail || undefined),
  });
  if (result.outcome === 'failed') {
    await ctx.log.error('webhook fire failed', { instanceId });
    return { status: 500, body: { error: 'webhook fire failed' } };
  }
  if (result.outcome === 'busy')       return { status: 202, body: { status: 'queued-behind-active-run' } };
  if (result.outcome === 'suppressed') return { status: 202, body: { status: 'paused' } };
  await recordFire(ctx, instanceId, new Date().toISOString());
  return { status: 202, body: { status: 'fired', runId: result.runId ?? null } };
};
```

Паттерны:

- `:param` сегменты route описаны в манифесте (`path: "/:instanceId"`), но протокол несёт сырой `request.path` — параметры парсит хендлер.
- Единственный путь запуска из триггера — `ctx.triggers.fire` (политика, лимиты, дедуп на `(instanceId, runKey)` внутри ядра). Для вебхука `runKey` — новый uuid: каждая доставка уникальна; для источников событий с id это был бы `message.id`, и повторная доставка дедуплицировалась бы ядром.
- Отображение `outcome` в HTTP-коды — контракт самого аддона, UI-таблица читает те же состояния из своей БД.

Org-route `/instances` (роль member) отдаёт `{ rows: [...] }` — контракт секции `table`, включая собранный публичный endpoint:

```ts
export function endpointPath(orgId: string, instanceId: string): string {
  return `/addons/public/${orgId}/${ADDON_ID}/r/${instanceId}`;
}
```

## Слой данных

```ts
// src/store.ts — весь доступ к данным через ctx.db, без ORM
await ctx.db.run(
  "insert into webhooks (instance_id, label, config, status, updated_at) values (?, ?, ?, 'active', ?) " +
  "on conflict(instance_id) do update set label = excluded.label, config = excluded.config, status = 'active', updated_at = excluded.updated_at",
  [instanceId, label, JSON.stringify(config), new Date().toISOString()],
);
```

Стиль: сырой SQL с параметрами, маппинг строк в доменные объекты в одном месте (`mapRow`), конфиг экземпляра хранится JSON-строкой. Никаких прямых файлов БД — только `ctx.db` RPC.

## Миграции

```sql
-- migrations/0001_init.sql
create table if not exists webhooks (
  instance_id text primary key,
  config text not null,
  status text not null default 'active',
  last_fired_at text,
  fires integer not null default 0,
  updated_at text not null
);

-- migrations/0002_instance_label.sql
alter table webhooks add column label text not null default '';
```

Именование `NNNN_name.sql`, применяются на enable/update с бэкапом и откатом, `PRAGMA user_version` как счётчик. Эволюция схемы — только вперёд новыми файлами.

## Как это выглядит в работе

1. Администратор включает аддон организации, выдавая `trigger` + `routes.public` в диалоге согласия.
2. Пользователь создаёт автоматизацию «Webhook» (вклад trigger появился в каталоге как `harnesys.webhook/webhook.http`), выбирает тред-цель → хост вызывает `trigger.start`.
3. UI показывает endpoint; `curl -d '{"text":"..."}' <endpoint>` → `202 {"status":"fired","runId":"…"}` → агент просыпается в треде.
4. Повтор запроса с тем же `runKey` ядром не удваивает запуск; занятый тред → `queued-behind-active-run`.

## Соседи: что ещё демонстрируют встроенные аддоны

| Аддон | Паттерн, которого нет у webhook |
|---|---|
| `harnesys.scheduler` | resident-активация, job-планировщик поверх `everySec`, cron в timezone организации (`ctx.org.settings()`), политика пропусков через `ctx.approvals.request`, `widget: { kind: "cron" }` в configFields |
| `harnesys.telegram-bot` | `transport`-семейство + worker-поллер с `ctx.workers.lease/release`, `http.fetch` с `scheme: 'path'` (токен бота в URL без попадания в процесс), `bridge.inbound`, чанковая докачка файлов `ctx.files.write({ append })`, форма+таблица+destructive rowAction в view, `message.options` для HITL |
| `harnesys.github` | connection `github` (kind `github-installation`, cardinality many), tool-pack из 21 инструмента, доставка событий worker-poller-ом + trigger `github.repo` (без `hook`) |
| `harnesys.google-drive` | `source-kind`: облачная папка как знание-источник, `source.list/stat/download/upload/...`, баз64-чанки |
| `harnesys.telegram-feed` | `accounts.access` под MTProto-credentials, конфиг-поля select/number, чтение каналов в треды |

---

Дальше: [Манифест](manifest.md) · [Contributions](contributions.md)
