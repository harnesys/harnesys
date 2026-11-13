# AddonContext — сервисы хоста из кода аддона

`ctx` — единственный способ аддона коснуться внешнего мира. Новый контекст строится на каждый вызов; он типизирован как `AddonContext` (`packages/sdk/src/addon-context.ts`) и собран поверх протокола — каждый метод это валидированный вызов хоста с проверкой права, лимитом частоты и аудитом.

Полный состав: `meta`, `signal`, `config`, `secrets`, `db`, `log`, `events`, `http`, `files`, `accounts`, `bindings`, `runs`, `threads`, `usage`, `skills`, `triggers`, `bridge`, `workers`, `org`, `approvals`, `progress`.

> В контексте **нет** `agents`, `chat`, `tools` — агенты и чаты доступны через `runs` / `threads` / `bridge` / `skills`, инструменты аддона объявляются манифестом, а не контекстом.

## ctx.meta и ctx.signal

```ts
ctx.meta.correlationId // сквозной id цепочки вызовов
ctx.meta.deadline      // абсолютное время (мс), когда хост отменит вызов
ctx.meta.principal     // { type: 'agent' | 'user' | 'system', id? }
ctx.meta.agentId?; ctx.meta.threadId?; ctx.meta.runId?; ctx.meta.orgId?
ctx.meta.locale        // язык пользователя — для L10n-вывода
ctx.signal             // AbortSignal: отменяется по дедлайну или $/cancel
```

Долгие циклы обязаны проверять `ctx.signal.aborted` и выходить. Аддон не получает прав агента — только личность вызывающего в `principal`.

## ctx.log

```ts
await ctx.log.info('webhook instance started', { instanceId });
await ctx.log.error('fire failed', { instanceId, reason });
```

Уровни `debug | info | warn | error`. Строки попадают в журнал экземпляра (кольцевой буфер + файл, видно на странице аддона и в `GET .../logs`). Базовое право, лимит 1000 строк/мин. Никогда не пишите в журнал значения секретов.

## ctx.db — собственная SQLite на организацию

```ts
await ctx.db.exec('create table if not exists notes (id text primary key, text text)');
const row = await ctx.db.get('select text from notes where id = ?', [id]);   // Row | null
const rows = await ctx.db.all('select * from notes');                        // Row[]
const res = await ctx.db.run('insert into notes (id, text) values (?, ?)', [id, text]);
// res: { changes, lastInsertRowid }
await ctx.db.batch([{ sql: 'delete from notes', params: [] }, { sql: 'insert ...', params: [...] }]); // атомарно, ≤ 100
```

- Файл: `orgDataDir/<org>/addons/<addonId>/data.db` (WAL, foreign keys). Друг к другу аддоны и организации не видят.
- Параметры: `string | number | boolean | null`; только подготовленные операторы.
- SQL-guard на стороне хоста: запрещены `ATTACH`/`DETACH`, `load_extension`, `PRAGMA` вне белого списка (`user_version`, `foreign_keys`).
- Лимиты: оператор ≤ 5 с, результат ≤ 8 MiB, `db.batch` ≤ 100.
- Квота `data.quotaMb` в манифесте: после превышения проходят только уменьшающие объём операторы (`DELETE`, `DROP`, `VACUUM`), остальное — `quota_exceeded`.
- Интерактивных транзакций через RPC нет — блокировки нельзя держать на время сетевых вызовов; для атомарности используйте `db.batch`.

Миграции схемы — каталогом `migrations/`, см. [Хранение данных](data-storage.md).

## ctx.config и ctx.secrets

```ts
const { commands } = await ctx.config.get(['commands']);   // все значения или по ключам
const token = await ctx.secrets.get('botToken');           // string | null
await ctx.secrets.set('botToken', '...');                  // ключ [A-Za-z0-9_.-]{1,128}, ≤ 8 KiB
await ctx.secrets.delete('botToken');
```

- Конфиг принадлежит хосту: значения per-organization из полей вклада `config`, объявленные defaults подмешиваются к сохранённым. Записать конфиг из аддона нельзя — только прочитать.
- Поля `type: 'secret'` не приходят в `config.get` — они в хранилище секретов, доступном только `ctx.secrets` своего пространства (`addon:<orgId>:<addonId>:<key>`). Чужие секреты физически недоступны.
- Паттерн «есть ли секрет» без утечки: `return { secretConfigured: (await ctx.secrets.get(key)) !== null }`.
- Изменение конфига из UI доставляется уведомлением `notifications['config.changed']` — перезагрузите значения в нём.

## ctx.http.fetch

```ts
const res = await ctx.http.fetch({
  url: 'https://api.github.com/user/repos',
  method: 'GET',
  headers: { accept: 'application/json' },
  auth: { connection: 'github', scheme: 'bearer' }, // инъекция учётных данных привязанного аккаунта
});
// res: { status, headers, body: string | null, bodyBase64? }
```

Требуется право `http.fetch` с scope `{ hosts: [...] }` — egress-политика: хост вне scope → `permission_denied`. Только https, приватные адреса блокируются политикой.

Ключевые параметры:

| Параметр | Назначение |
|---|---|
| `method` | по умолчанию `GET` |
| `body` / `bodyBase64` | текст или бинарное тело (base64) |
| `responseEncoding` | `'text'` (default) или `'base64'` для бинарных ответов |
| `auth.connection` | id потребности из манифеста |
| `auth.accountId?` | обязательен, если привязано несколько аккаунтов |
| `auth.scheme` | `'bearer'` \| `'basic'` \| `'header'` \| `'path'` |
| `auth.credentialKey?` | какой ключ учётных данных взять |
| `auth.header?` | имя заголовка для `scheme: 'header'` |
| `auth.placeholder?` | метка в URL для `scheme: 'path'` (default `{token}`) |

**Инъекция учётных данных** — главный путь: хост сам резолвит и подставляет токен привязанного аккаунта (с обновлением по истечении), токен **не попадает в процесс аддона**. `scheme: 'path'` подставляет кред в URL вместо placeholder — так работают Telegram-боты (`https://api.telegram.org/bot{token}/sendMessage`); credential обязан состоять из path-safe символов `A-Za-z0-9._~:-`, иначе `invalid_params`.

Ответ ≤ 8 MiB, запрос ≤ 30 с. При 401/403 хост по умолчанию сообщает аккаунту проблему (`accounts.report`) — аддону остаётся отразить статус в результат.

```ts
// типичный паттерн из harnesys.telegram-bot (bot-api.ts)
async function telegramCall(ctx: AddonContext, method: string, payload: Record<string, unknown>) {
  const res = await ctx.http.fetch({
    url: `https://api.telegram.org/bot{token}/${method}`,
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    auth: { connection: 'telegram-bot', scheme: 'path', credentialKey: 'botToken', placeholder: '{token}' },
  });
  if (res.status === 429) throw new AddonError('rate_limited', { retryable: true });
  if (res.status === 401 || res.status === 403) throw new AddonError('account_failed');
  if (res.status === 409) throw new AddonError('conflict');
  return res.body ? JSON.parse(res.body) : null;
}
```

## ctx.files — файлы workspace организации

```ts
const st = await ctx.files.stat('imports/data.csv');
// st: { path, name, size, mediaType, modifiedAt }
const chunk = await ctx.files.read({ path: 'imports/data.csv', offset: 0, length: 4 * 1024 * 1024 });
// chunk: { data: base64, eof, size, mediaType }
await ctx.files.write({ path: 'exports/report.pdf', data: base64, append: false });
```

- Пути относительные к workspace организации (`~/.harnesys/data/orgs/<orgId>/workspace`); абсолютные принимаются только внутри него.
- Хост канонализует путь, отсекает выходы за пределы и блок-лист (`.env`, `.ssh`, `.git`, `node_modules`, …).
- Права: `files.read` для stat/read, `files.write` для write.
- ≤ 4 MiB за вызов — большие файлы читаются/пишутся чанками (`append: true` докачивает).

## ctx.accounts — привязанные аккаунты

```ts
const accounts = await ctx.accounts.list('github');
// [{ accountId, label, externalAccountId, status }]
await ctx.accounts.report('github', 'account_failed', accountId);
const creds = await ctx.accounts.access('github'); // право accounts.credentials (high, аудируется)
// { credentials, expiresAt?, app? }
```

Правило резолва: явный `accountId` обязан быть привязан; без него привязка должна быть ровно одна (иначе `conflict`). Предпочтительный путь — инъекция в `http.fetch`, `access` — только когда сырой токен необходим по протоколу провайдера. Подробности — [Accounts и connections](accounts-connections.md).

## ctx.runs и ctx.threads — агенты

```ts
const { runId } = await ctx.runs.dispatch({ threadId?, agentId?, input });
await ctx.runs.cancel({ threadId, runId });
const runs = await ctx.runs.list({ threadId, status? }); // право runs.read

const { threadId } = await ctx.threads.create({ title?, agentId }); // agentId — uuid
await ctx.threads.compact({ threadId });  // право threads.compact
// → { compacted: true, id, coveredFrom, coveredUntil, tokensBefore, tokensAfter }
//   или { compacted: false, reason? }
```

`runs.dispatch` — право `runs.dispatch`, общий потолок 60 запусков/мин на аддон. Из триггеров запускаться надо через `ctx.triggers.fire` (учитывается политикой экземпляра), а не `runs.dispatch` напрямую.

## ctx.triggers.fire

```ts
const result = await ctx.triggers.fire({
  instanceId,
  runKey: `${instanceId}:${event.id}`, // дедупликация: повторный fire с тем же runKey → suppressed
  text: 'Что сделать агенту',
  payload: { raw: event },
});
// { outcome: 'fired' | 'suppressed' | 'busy' | 'failed', runId? }
```

Хост проверяет: экземпляр включён и принадлежит аддону, дедупликация по `(instanceId, runKey)` (окно 7 суток), лимиты `perDay`/`throttleSec`/`maxBurst` и политика организации; затем диспатчит запуск. `busy` — в тред-цели уже идёт активный запуск.

## ctx.bridge.inbound — приём входящих сообщений

```ts
await ctx.bridge.inbound({
  channel: `telegram:${chatId}`,
  from: 'telegram:123456789',
  text: message.text,
  payload: { provider: 'telegram', chatId, messageId, topicId },
  attachments: [{ name: 'photo.jpg', mediaType: 'image/jpeg', dataBase64 }],
});
```

Сообщение попадает в нейтральный мост ядра: авто-ответчик, политика эха, привязка чат↔тред, согласования. Право `bridge.inbound`; ≤ 10 вложений по 20 MiB, у каждого ровно один из `path` (файл workspace, крупный — через `ctx.files.write({ append })`) или `dataBase64`. Хост сам пишет строки привязки — читайте их через `ctx.bindings.channels`.

## ctx.bindings.channels

```ts
const channels = await ctx.bindings.channels('telegram');
// [{ provider, channel, threadId, createdAt }]
```

Только чтение, без права, видно привязки **этого** аддона. Хост создаёт их при первом `bridge.inbound` с новым каналом — своей таблицы привязок аддону не нужно. Топик-ось пока не в связке: тематическим каналам кодировать топик внутри `channel`.

## ctx.workers — состояние воркера и лизинг

```ts
await ctx.workers.report('poller', 'running');
await ctx.workers.report('poller', 'failed', 'network');

const lease = await ctx.workers.lease('poller', 60_000); // ttlMs 5 с … 1 ч, default 60 с
// { held: boolean, epoch, expiresAt }
if (lease.held) { /* поллим */ } else { /* другой экземпляр держит лизинг */ }
await ctx.workers.release('poller');
```

Лизинг живёт в SQLite организации, переживает перезапуск. Паттерн воркера-поллера: цикл `lease → работа → report`, проверка `ctx.signal.aborted`, `release` на `worker.stop`.

## ctx.events.emit

```ts
await ctx.events.emit('harnesys.acme.build.finished', { id: 42 }); // имя обязано начинаться с '<addonId>.', иначе invalid_params
```

≤ 64 KiB payload, публикуется на шине организации, видно в SSE-стриме `addon.*`, подписывается хуками других аддонов (право `events.subscribe`).

## ctx.usage, ctx.skills, ctx.org

```ts
const usage = await ctx.usage.summary({ threadId?, since? });
// { inputTokens, outputTokens, costUsd, byModel: [{ model, ... }] }

const skills = await ctx.skills.list({ threadId });
// [{ id, name, description, source }]

const { timezone } = await ctx.org.settings(); // например, для вычисления cron в зоне организации
```

## ctx.approvals.request — HITL из аддона

```ts
const { id } = await ctx.approvals.request({
  interruptId, agentId, threadId?,
  kind: 'question',                     // 'tool' | 'spend' | 'memory' | 'question' | 'file_access'
  question: 'Schedule missed — run it now?',
  options: ['approve', 'deny'],
  context: { source: 'schedule', note: 'missed 20:00' },
});
```

Создаёт элемент входящих согласований, по которому человек решает судьбу прерванного запуска. Право `approvals.request`. Пример живого использования: политика `escalate` в `harnesys.scheduler` (пропущенный запуск → вопрос в инбокс).

## ctx.progress

```ts
ctx.progress.progress('import-42', { stage: 'uploading', done: 7, total: 20 }); // синхронный fire-and-forget
```

Отправляет `$/progress`; хост публикует событие организации `addon.progress { orgId, addonId, token, value }`. Никакого ответа, права не нужны.

## Ошибки

Бросайте `AddonError` — наружу уйдёт код, а не текст стека:

```ts
import { AddonError } from '@harnesys/sdk';

if (!Number.isInteger(input.count)) {
  throw new AddonError('invalid_params', { detail: 'count must be an integer' });
}
```

| Причина | Когда |
|---|---|
| `invalid_params` | вход не годится (схема-валидация вклада ловит раньше) |
| `not_found` | сущности нет |
| `conflict` | состояние мешает (двойная привязка, дубликат) |
| `rate_limited` | вы сами бережёте API провайдера — ставьте `retryable: true` |
| `account_failed` | аккаунт сломан; добавьте `accountCode` |
| `unavailable` | временная недоступность, `retryable: true` |
| `internal` | всё прочее |

Результат инструмента, не прошедший `outputSchema` хоста, — `invalid_response`. Полный список причин и маппинг кодов — [Протокол](protocol.md#ошибки).

## Чего в контексте нет

- Часов и планировщиков: расписание — права хоста (`job`), ожидание — `ctx.meta.deadline` + `ctx.signal`.
- Записи конфига и грантов — только хост и UI организации.
- Прямых путей к ядру, чужим данным, другим процессам — только сервисы этой таблицы.

---

Дальше: [Contributions](contributions.md) · [Протокол](protocol.md) · [SDK API](sdk.md)
