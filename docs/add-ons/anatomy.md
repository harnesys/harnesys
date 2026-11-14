# Анатомия аддона: harnesys.webhook целиком

`harnesys.webhook` (2.1.0) — рабочий встроенный аддон, на котором видно сразу почти все механизмы платформы: trigger-вклад, публичный HTTP-маршрут с собственной проверкой подписи, org-маршруты для UI, декларативный `view`, `tool-pack` для агента, миграции и `ctx.db`. Фрагменты ниже — реальный код пакета (сокращённо, без веток обработки ошибок), а не учебный пример.

Размер честный: манифест 750 строк, `src/` — около 1 400. Это не самый маленький аддон (меньше всех `harnesys.drawio`: 50 строк манифеста и три файла `src/`), но самый плотный по механике на строку.

## Пакет

```
add-ons/harnesys.webhook/
  addon.json          # манифест (750 строк)
  notes.md            # текст секции Notes (markdown, 23 строки)
  package.json        # deps: @harnesys/sdk, @harnesys/studio-shared; build: bun build --target=bun
  src/index.ts        # defineAddon + startAddonProcess (29 строк)
  src/trigger.ts      # trigger.start/stop: upsert, token, secret (26 строк)
  src/hook-route.ts   # публичный POST/GET: token → auth → dedupe → fire → delivery (230 строк)
  src/org-routes.ts   # instances, deliveries, rotate-url, rotate-secret, test (88 строк)
  src/tools.ts        # tool-pack из 9 инструментов (224 строки)
  src/store.ts        # ctx.db: webhooks, deliveries, dedup (222 строки)
  src/auth.ts         # HMAC (sha256/sha1/sha512), API key, token/secret (116 строк)
  src/dedupe.ts       # идемпотентность, дедуп тела, throttle (98 строк)
  src/text.ts         # textPath → шаблон → payload-fallback, обрезка (94 строки)
  src/config.ts       # нормализация конфига: дефолты и клэмпы (96 строк)
  src/url.ts          # public-путь и сборка endpoint из заголовков (30 строк)
  migrations/         # 0001_init, 0002_instance_label, 0003_webhooks_v2
  dist/index.js       # бандл — runtime.entry
```

Замечание: `@harnesys/studio-shared` — внутренняя shared-библиотека монорепо (промпт-хелперы). builtin-аддонам её импорт дозволен, внешнему пакету — нет: снаружи только `@harnesys/sdk`.

## Манифест

```json
{
  "id": "harnesys.webhook",
  "version": "2.1.0",
  "platform": 1,
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
        "description": "Wake the thread when a public HTTP endpoint is called",
        "configFields": [
          { "key": "auth", "type": "select", "label": "Verification" },
          { "key": "signatureHeader", "type": "text", "label": "Signature header" },
          { "key": "signatureAlgo", "type": "select", "label": "Signature algorithm" },
          { "key": "signatureEncoding", "type": "select", "label": "Signature encoding" },
          { "key": "keyHeader", "type": "text", "label": "Key header" },
          { "key": "payload", "type": "group", "label": "Payload",
            "fields": [ … textPath, textTemplate, detail, maxTextKb, samplePayload ] },
          { "key": "noise", "type": "group", "label": "Noise control",
            "fields": [ … dedupeWindowSec, throttleSec, honorIdempotencyKey, allowGet ] },
          { "key": "response", "type": "group", "label": "Response",
            "fields": [ … respondMode, responseStatus, responseBody ] }
        ]
      }
    },
    {
      "id": "hook",
      "family": "route",
      "descriptor": { "id": "hook", "method": "POST", "path": "/:token",
                      "exposure": "public", "bodyLimitKb": 512 }
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
              { "key": "endpoint", "label": "Endpoint", "format": "copy" },
              { "key": "auth", "label": "Auth", "format": "text" },
              { "key": "status", "label": "Status", "format": "badge" }
            ],
            "rowActions": [ … test, rotate-url, rotate-secret ] },
          { "type": "table", "title": "Recent deliveries", "source": { "route": "/deliveries" } }
        ]
      }
    }
  ]
}
```

Что здесь важно:

- Декларированы только **небазовые** права: `trigger` (для `triggers.fire`) и `routes.public` (high-risk, для публичного endpoint). `db`, `log`, `secrets`, `config.read` и прочие базовые — неявно.
- `activation: 'lazy'` — процесс стартует на первый запрос/событие и выключается после 5 минут покоя: слушателем вебхука является маршрут хоста, resident-процесс не нужен.
- Публичных маршрутов два: `POST` (`hook`) и `GET` (`hook-get`) на один и тот же `/:token`; GET работает только при `allowGet` в конфиге инстанса.
- Аутентификацию публичного endpoint делает сам аддон, а не хост: токен в пути, дальше HMAC-подпись или API-ключ (или `none`).
- Вкладов кроме показанных ещё шесть: `hook-get`, `instances`, `deliveries`, `rotate-url`, `rotate-secret`, `test` — плюс `pack` (`tool-pack` из 9 инструментов).
- В `view` две таблицы: инстансы (endpoint с `format: "copy"`) и последние доставки. Данные отдают те же org-маршруты.
- Конфиг инстанса — контракт: три группы полей (`payload`, `noise`, `response`) плюс пять плоских полей auth. Значения нормализует `src/config.ts` (дефолты и клэмпы), манифест задаёт только форму.
- Текст секции Notes лежит в `notes.md` рядом с манифестом, а не строкой в `addon.json`: хост подставляет файл последней секцией сам, вклада `view` для этого не требуется.

## Точка входа

```ts
// src/index.ts
import { defineAddon, startAddonProcess } from '@harnesys/sdk';
import { hook, hookGet } from './hook-route.ts';
import { deliveries, instances, rotateSecret, rotateUrl, testHook } from './org-routes.ts';
import { webhookTools } from './tools.ts';
import { webhookTrigger } from './trigger.ts';

const ADDON_ID = 'harnesys.webhook';
const ADDON_VERSION = '2.1.0';

export const addon = defineAddon({
  tools: webhookTools,
  triggers: { 'webhook.http': webhookTrigger },
  routes: {
    hook,
    'hook-get': hookGet,
    instances,
    deliveries,
    'rotate-url': rotateUrl,
    'rotate-secret': rotateSecret,
    test: testHook,
  },
});

if (import.meta.main) {
  await startAddonProcess({
    definition: addon,
    addon: { id: ADDON_ID, version: ADDON_VERSION },
  });
}
```

- `triggers` ключуется **kind**-ом из дескриптора (`webhook.http`), а не id вклада (`http`).
- `routes` ключуется id вклада: `rotate-url` → `rotateUrl`, `test` → `testHook`. Kebab-id остаётся kebab-id в манифесте и в URL.
- Именованный экспорт `addon` — контракт in-process-загрузчика хоста; `import.meta.main` — чтобы импорт бандла не поднимал stdio-цикл.

## Триггер

```ts
// src/trigger.ts
export const webhookTrigger: TriggerPair = {
  start: async (params, ctx: AddonContext) => {
    const instanceId = params.instanceId;
    const label = typeof params.label === 'string' ? params.label : '';
    const rawConfig = params.config ?? {};
    await startWebhook(ctx, instanceId, label, rawConfig);
    const token = await ensureToken(ctx, instanceId);
    const config = parseHookConfig(rawConfig);
    if (config.auth !== 'none') {
      const key = secretKeyFor(instanceId);
      if ((await ctx.secrets.get(key)) === null) {
        await ctx.secrets.set(key, generateSecret());
      }
    }
    await ctx.log.info('webhook instance started', { instanceId, token });
  },
  stop: async (params, ctx: AddonContext) => {
    await pauseWebhook(ctx, params.instanceId);
  },
};
```

`trigger.start` приходит при включении экземпляра триггера и при каждом старте экземпляра аддона (replay) — поэтому upsert идемпотентен, а токен не перевыпускается, если уже есть. Секрет подписи живёт в `ctx.secrets`, не в базе; повторный `start` не затирает секрет, который уже отдан интегратору.

## Публичный маршрут

Порядок обработки одного запроса (`src/hook-route.ts`):

1. Токен — последний сегмент пути, паттерн `^[0-9a-f]{24}$`; не совпал → `404 webhook not found`.
2. Поиск инстанса по токену (`findByToken`). Нет строки → `404`.
3. `GET` без `allowGet` → `405 method not allowed` (тоже записывается в доставки).
4. Проверка подписи (если `auth !== 'none'`): неверная подпись → `401 invalid_signature`, неверный ключ → `403 invalid_key`, отсутствующий секрет → `500 webhook secret missing`.
5. `status !== 'active'` → `202 { status: "paused" }`, запуска нет.
6. Шум: повторный `Idempotency-Key` за 24 часа и совпадающее тело в окне `dedupeWindowSec` → `200` с исходным исходом; запрос внутри `throttleSec` → `429`.
7. Текст задачи, вызов `ctx.triggers.fire`, запись доставки.

```ts
async function handleHook(request: RouteRequest, ctx: AddonContext): Promise<HookResult> {
  const token = tokenFromPath(request.path);
  if (!TOKEN_PATTERN.test(token)) {
    return { status: 404, body: { error: 'webhook not found' }, outcome: 'rejected' };
  }
  const webhook = await findByToken(ctx, token);
  if (!webhook) {
    return { status: 404, body: { error: 'webhook not found' }, outcome: 'rejected' };
  }
  const source = sourceOf(request);
  if (request.method === 'GET' && !webhook.config.allowGet) {
    return deliver(ctx, webhook, source, { origin: 'hook', outcome: 'rejected',
      status: 405, body: { error: 'method not allowed' }, error: 'method not allowed' });
  }
  const rejected = await verifyAuth(ctx, webhook, source);
  if (rejected) {
    return rejected;
  }
  return executeDelivery(ctx, webhook, request, 'hook');
}
```

Отображение исхода `triggers.fire` в HTTP — контракт самого аддона:

| `result.outcome` | HTTP | Тело |
|---|---|---|
| `fired` | `202` (или кастомный статус из `respondMode: "custom"`) | `{ status: "fired", runId }` либо `responseBody` |
| `busy` | `202` | `{ status: "queued-behind-active-run" }` |
| `suppressed` | `202` | `{ status: "paused" }` |
| `failed` | `500` | `{ error: "webhook fire failed" }`, инстанс помечается `status: "failed"` |

`runKey` — новый uuid на каждую доставку: дедуп по `(instanceId, runKey)` в ядре не срабатывает, повторная защита — только на стороне аддона (шаг 6). Для источника событий с естественным id (`message.id`) `runKey` был бы им, и тогда дубли гасило бы ядро.

## Проверка подписи

`src/auth.ts`. Три режима (`auth`): `none`, `hmac`, `apiKey`.

- HMAC считается по **сырому** телу (`request.rawBody`), не по распарсенному JSON — иначе подпись не сойдётся с отправителем. Алгоритм (`sha256 | sha1 | sha512`) и кодировка (`hex | base64`) задаются конфигом; заголовок по умолчанию `x-hub-signature-256`, префикс вида `sha256=` отрезается.
- API key сравнивается константным временем (`constantTimeEqual`), заголовок по умолчанию `x-harnesys-key`.
- Секрет — 32 случайных байта в base64url, генерируется при `trigger.start` и ротируется маршрутом `/rotate-secret`; хост отдаёт его один раз в тосте ротации.

## Шум: идемпотентность, дедуп, throttle

`src/dedupe.ts` держит три ключа в таблице `dedup`:

- `idem:<instance>:<Idempotency-Key>` — повтор за 24 часа возвращает сохранённый исход (`honorIdempotencyKey`, по умолчанию включено);
- `hash:<instance>:<sha256(rawBody | canonicalQuery)>` — одинаковое тело (для GET — канонический query) внутри `dedupeWindowSec` не перезапускает тред;
- `thr:<instance>` — не чаще одного запуска в `throttleSec`, иначе `429 throttled`.

Записи старше 24 часов вычищаются лениво при каждой проверке (`dedupCleanup`). Обе защиты — на уровне аддона, поэтому работают и для `none`-аутентификации.

## Текст задачи

`src/text.ts`, порядок `extractText`:

1. `textTemplate` с плейсхолдерами `{{text}}` и `{{payload}}` (payload — pretty-JSON тела);
2. `textPath` — dot-путь в JSON-теле (`data.message.text`);
3. быстрый путь: `body.text`, тело-строка, `?text=` в query;
4. весь payload как JSON.

Результат обрезается до `maxTextKb` (по умолчанию 8, клэмп 1–512). Если после всего текст пуст, берётся `detail` из конфига; итог оборачивается `webhookTaskText(name, text)` из `@harnesys/studio-shared`.

## Org-маршруты и tool-pack

| Route (id) | Роль | Что делает |
|---|---|---|
| `instances` | member | строки для таблицы: `id = token`, `endpoint`, `auth`, `status`, `lastFiredAt`, `fires`, `lastError` |
| `deliveries` | member | последние доставки, `limit` 1–200 (по умолчанию 40) |
| `rotate-url/:token` | admin | перевыпуск токена; старый URL умирает сразу, тост несёт новый endpoint |
| `rotate-secret/:token` | admin | новый секрет в `ctx.secrets`; показывается один раз |
| `test/:token` | admin | прогон `executeDelivery` с `origin: "test"`: без auth и дедупа, с записью в доставки |

Endpoint собирается из заголовков запроса (`origin`, затем `x-forwarded-proto` + `x-forwarded-host`, затем `host`) и публичного пути хоста: `/api/addons/public/<orgId>/harnesys.webhook/r/<token>` (лимит 20/с, burst 40). UI копирует его из колонки `endpoint` (`format: "copy"`).

Те же операции доступны агенту как `tool-pack`: `list`, `deliveries`, `create`, `configure`, `pause`, `resume`, `rotate_url`, `rotate_secret`, `test`. `create` создаёт экземпляр триггера через `ctx.triggers.create` и по умолчанию целится в текущий тред; поэтому агент может завести себе вебхук без похода в настройки. Инструменты валидируют вход `AddonError('invalid_params')` — через RPC эта ошибка доезжает до клиента типизированной (см. [Протокол → Ошибки](protocol.md#ошибки)).

## Слой данных

```ts
// src/store.ts — весь доступ к данным через ctx.db, без ORM
await ctx.db.run(
  "insert into webhooks (instance_id, label, config, status, updated_at) values (?, ?, ?, 'active', ?) " +
    "on conflict(instance_id) do update set label = excluded.label, config = excluded.config, status = 'active', last_error = '', updated_at = excluded.updated_at",
  [instanceId, label, JSON.stringify(config), new Date().toISOString()],
);
```

Стиль: сырой SQL с параметрами, маппинг строк в доменные объекты в одном месте (`mapWebhook`), конфиг — JSON-строка, нормализуется при чтении. Никаких прямых файлов БД — только `ctx.db` RPC. Три таблицы: `webhooks`, `deliveries`, `dedup`.

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

-- migrations/0003_webhooks_v2.sql
alter table webhooks add column token text;
alter table webhooks add column last_error text not null default '';
create unique index if not exists webhooks_token on webhooks (token) where token is not null;

create table if not exists deliveries (
  id text primary key,
  instance_id text not null,
  source text not null default 'hook',
  method text not null,
  received_at text not null,
  outcome text not null,
  http_status integer not null,
  run_id text,
  summary text not null default '',
  error text not null default '',
  latency_ms integer not null default 0
);

create table if not exists dedup (
  key text primary key,
  instance_id text not null,
  outcome text not null,
  created_ms integer not null
);
```

Именование `NNNN_name.sql`, применяются на enable/update с бэкапом и откатом, `PRAGMA user_version` как счётчик. Эволюция схемы — только вперёд новыми файлами: `0003` добавила токен, ошибку и две новые таблицы, не переписывая `0001`.

## Как это выглядит в работе

1. Администратор включает аддон организации, выдавая `trigger` + `routes.public` в диалоге согласия.
2. Пользователь (или агент через `create`) заводит экземпляр «Webhook», выбирает тред-цель → `trigger.start` выдаёт токен и, если включена проверка, секрет.
3. UI показывает endpoint; `curl -d '{"text":"..."}' <endpoint>` → `202 {"status":"fired","runId":"…"}` → агент просыпается в треде.
4. Повтор с тем же `Idempotency-Key` → `200` и исход первой доставки; тот же payload в окне дедупа → тоже `200`, без нового запуска; второй запрос внутри throttle → `429`.
5. Выключенный или упавший инстанс → `202 {"status":"paused"}`, занятый тред → `queued-behind-active-run`. Каждый запрос, включая отказы, виден в «Recent deliveries».

## Соседи: что ещё демонстрируют встроенные аддоны

| Аддон | Паттерн, которого нет у webhook |
|---|---|
| `harnesys.scheduler` | resident-активация, job-планировщик поверх `everySec`, cron в timezone организации (`ctx.org.settings()`), политика пропусков через `ctx.approvals.request`, `widget: { kind: "cron" }` в configFields |
| `harnesys.telegram-bot` | `transport`-семейство + worker-поллер с `ctx.workers.lease/release`, `http.fetch` с `scheme: 'path'` (токен бота в URL без попадания в процесс), `bridge.inbound`, чанковая докачка файлов `ctx.files.write({ append })`, форма+таблица+destructive rowAction в view, `message.options` для HITL |
| `harnesys.github` | connection `github` (kind `github-installation`, cardinality many), tool-pack из 21 инструмента, доставка событий worker `repo-poller` + trigger `github.repo-events` (без `hook`) |
| `harnesys.google-drive` | `source-kind`: облачная папка как знание-источник, `source.list/stat/download/upload/...`, баз64-чанки |
| `harnesys.telegram-feed` | `accounts.access` под MTProto-credentials, конфиг-поля select/number, чтение каналов в треды |
| `harnesys.drawio` | `viewer`-семейство: `.drawio` из дерева источников открывается в редакторе, `mode: "edit"` + `create` |

---

Дальше: [Манифест](manifest.md) · [Contributions](contributions.md)
