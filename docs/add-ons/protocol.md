# Протокол хост ↔ аддон

Протокол — единственная граница между ядром и кодом аддона. Он двусторонний, описан Zod-схемами в `packages/sdk/src/protocol/` и является одновременно документацией: карта методов `protocolMap` — источник истины для типов SDK, golden-фикстур и диспетчера хоста.

Источник в коде: `packages/sdk/src/protocol/` (`map.ts` — карта методов, `envelope.ts` — конверт JSON-RPC, `shared.ts` — общие схемы).

## Транспорт

- **JSON-RPC 2.0**, одно сообщение — одна JSON-строка (NDJSON), UTF‑8.
- Канал по умолчанию — **stdio** запускаемого процесса аддона (`stdout` — протокол, `stderr` — журнал экземпляра). Для доверенных пакетов существует in-process-канал с той же семантикой: параметры и результаты проходят JSON-копирование ради паритета.
- Ограничение размера сообщения — **8 MiB** (`MAX_MESSAGE_BYTES`). Больше — разрыв, а не тихий обрез.
- Таймаут запуска экземпляра: 15 с до ответа на `initialize`.

## Рукопожатие

Хост запускает процесс и вызывает `initialize`; это единственный вызов до готовности аддона.

**host → addon, `initialize` (params):**

```ts
interface InitializeParams {
  platform: number;                 // выбранная мажорная версия протокола (текущая — 1)
  host: { version: string; features: string[] };
  instance: { orgId: string; generation: number; dataDir: string; locale: string };
  permissions: Array<{ id: string; scope?: Record<string, unknown> }>; // эффективные права
  experimental: string[];           // доступные experimental.* (пусто для external)
  deprecations: string[];           // что из используемого устарело
}
```

**addon → host (result):**

```ts
interface InitializeResult {
  addon: { id: string; version: string };
  handlers: string[];               // реализованные методы host → addon
  deactivateTimeoutMs?: number;
}
```

Правила:

- `handlers` SDK вычисляет сам из `defineAddon` (`deriveHandlers`) — см. [SDK API](sdk.md#derivehandlers).
- После ответа хост шлёт уведомление `initialized`. Аддон вправе вызывать сервисы хоста только после него.
- Хост сверяет `handlers` с тем, что **требуют** вклады манифеста: нехватка → остановка экземпляра с `incompatible_handlers`. Лишние обработчики в коде — мертвый код; вызов необъявленного метода аддон сам отклоняет как `unsupported`.
- Хост никогда не вызывает метод, которого нет в `handlers`.
- `platform` не совпал, манифест битый, контрольная сумма не та — fail-closed: отказ, а не деградация.

## Метаданные вызова

Каждый запрос host → addon несёт `params._meta`:

```ts
interface CallMeta {
  correlationId: string;            // сквозной идентификатор: запуск → вызов → http.fetch → аудит
  deadline: number;                 // абсолютное время мс epoch;runtime прерывает обработчик
  principal: { type: 'agent' | 'user' | 'system'; id?: string };
  agentId?: string; threadId?: string; runId?: string; orgId?: string;
  locale: string;
}
```

В `AddonContext` это `ctx.meta`; отмена по дедлайну или `$/cancel` приходит как `ctx.signal`. SDK толерантен к отсутствующему `_meta` (фолбэк: дедлайн +5 минут), но хост обязан его слать — контрактом закреплено, что params host-запросов содержат `_meta`.

## Методы host → addon

| Метод | Семейство | Параметры → Результат | Таймаут |
|---|---|---|---|
| `initialize` / `initialized` (увед.) | — | см. выше | 15 с |
| `ping` | — | `{}` → `{}` | 5 с (надзор) |
| `shutdown` | — | `{ reason, deadlineMs }` → `{}` | 5 с |
| `lifecycle.upgrade` | — | `{ fromVersion }` → `{}` | хост шлёт уведомлением, ответа не ждёт |
| `tools.call` | `tool-pack` | `{ pack, tool, input }` → `{ output }` | 60 с (дескриптор: до 600 с) |
| `route.handle` | `route` | `{ routeId, request }` → `{ status, headers?, body? }` | 30 с |
| `trigger.start` / `trigger.stop` | `trigger` | `{ instanceId, kind, label?, config, target? }` / `{ instanceId }` → `{}` | 15 с; требует права `trigger` |
| `job.run` | `job` | `{ jobId }` → `{}` | по дескриптору (до 3600 с) |
| `worker.start` / `worker.stop` | `worker` | `{ workerId }` → `{}` | 15 с |
| `transport.send` | `transport` | `{ message }` → `{ messageId? }` | 30 с |
| `transport.edit` | `transport` | `{ messageId, message }` → `{}` | 30 с |
| `transport.typing` | `transport` | `{ channel, on }` → `{}` | 30 с |
| `hook.deliver` | `hook` | `{ hookId, event }` → `{}` | 10 с |
| `source.list/stat/download/upload/mkdir/remove/export` | `source-kind` | см. [Contributions](contributions.md#source-kind--облачные-знание-источники) | 60 с; требует права `source` |

Уведомления хоста (без ответа, обрабатываются `notifications` в `defineAddon`): `config.changed { keys }`, `permissions.changed { permissions }`, `accounts.changed { connection, accountId, status }`.

Форма транспортного сообщения `TransportMessage` (общая для send/edit):

```ts
interface TransportMessage {
  channel: string;
  text: string;
  format?: 'text' | 'markdown' | 'html';
  replyTo?: string;
  topic?: string;
  attachments?: Array<{ name?: string; mimeType?: string; url?: string; path?: string; dataBase64?: string }>;
  options?: Array<{ id: string; label: string }>;   // HITL-вопрос: варианты ответа
}
```

Ровно один источник вложения: `url`, `path` (файл workspace; хост материализует его в `dataBase64` до вызова) или `dataBase64`.

## Методы addon → host (сервисы хоста)

Организация и аддон подставляются хостом по экземпляру — подделать их нельзя. В SDK доступны типизированными через `ctx.*` ([AddonContext](context.md)).

| Метод | Право | Через контекст |
|---|---|---|
| `config.get { keys? }` | базовое | `ctx.config.get` |
| `secrets.get / secrets.set / secrets.delete { key }` | базовое (`secrets.own`) | `ctx.secrets.*` |
| `db.exec / db.all / db.get / db.run / db.batch` | базовое (`db`) | `ctx.db.*` |
| `log.write { level, message, fields }` | базовое (`log`) | `ctx.log.*` |
| `events.emit { name, payload }` | базовое (`events.emit.own`) | `ctx.events.emit` |
| `bindings.channels { provider? }` | базовое | `ctx.bindings.channels` |
| `http.fetch { url, … }` | `http.fetch` | `ctx.http.fetch` |
| `files.stat / files.read / files.write` | `files.read` / `files.write` | `ctx.files.*` |
| `accounts.list / accounts.report` | `accounts.use` | `ctx.accounts.*` |
| `accounts.access` | `accounts.credentials` | `ctx.accounts.access` |
| `runs.dispatch / runs.cancel` | `runs.dispatch` | `ctx.runs.*` |
| `runs.list` | `runs.read` | `ctx.runs.list` |
| `threads.create` | `threads.create` | `ctx.threads.create` |
| `threads.compact` | `threads.compact` | `ctx.threads.compact` |
| `usage.summary` | `usage.read` | `ctx.usage.summary` |
| `skills.list` | `skills.read` | `ctx.skills.list` |
| `org.settings.get` | `org.read` | `ctx.org.settings` |
| `approvals.request` | `approvals.request` | `ctx.approvals.request` |
| `triggers.fire` | `trigger` (+ вклад `trigger`) | `ctx.triggers.fire` |
| `bridge.inbound` | `bridge.inbound` | `ctx.bridge.inbound` |
| `workers.report / workers.lease / workers.release` | `worker` | `ctx.workers.*` |

Уведомления addon → host: `$/progress { token, value }` — через `ctx.progress` (fire-and-forget). `$/cancel { id }` — в обе стороны, отмена конкретного запроса; служебные, префикс `$/`.

Подписок во время работы нет: подписки на события объявляются **статически** вкладом `hook`.

## Ограничения частоты и объёма

| Ресурс | Лимит |
|---|---|
| Вызовы addon → host | 200/с, всплеск 400 |
| Результат вызова addon → host | по умолчанию 256 KiB (`http.fetch` и `db.*` переопределяют на 8 MiB) |
| Результат `db.*` | 8 MiB, время оператора 5 с, `db.batch` ≤ 100 |
| `http.fetch` | ответ 8 MiB, 30 с |
| Секрет | ключ `[A-Za-z0-9_.-]{1,128}`, значение ≤ 8 KiB |
| Payload события `events.emit` | ≤ 64 KiB |
| Журнал | 1000 строк/мин |
| Вложения `bridge.inbound` | ≤ 10 файлов, 20 MiB каждый |

## Ошибки

Ошибки — JSON-RPC error с `data`:

```ts
interface AddonErrorData {
  reason: AddonErrorReason;   // см. ниже
  retryable: boolean;
  detail?: string;            // короткий диагностический текст; пользователю не показывается
  accountCode?: string;       // для account_failed — код ошибки Apps/Accounts
}
```

16 причин `AddonErrorReason`: `invalid_params`, `invalid_response`, `permission_denied`, `not_found`, `conflict`, `quota_exceeded`, `rate_limited`, `timeout`, `cancelled`, `unavailable`, `unsupported`, `account_failed`, `incompatible_handlers`, `migration_failed`, `permission_revoked`, `internal`.

Маппинг в JSON-RPC коды: `invalid_params` → `-32602`, `unsupported`/`not_found` → `-32601`, остальное → `-32000`. Из аддона бросается `new AddonError(reason, { retryable, detail })` — наружу из процесса уходят только коды, не тексты исключений (инвариант платформы).

## Совместимость версий

Три независимые оси:

1. **`platform`** — мажорная версия протокола и манифеста (сейчас `1`). Хост пока поддерживает только текущую мажорь (`HOST_PLATFORM_MAJOR = 1`, `addon-platform.ts`); helper `supportedPlatformMajors` (текущая + предыдущая) оставлен под будущие версии.
2. **`v` вклада** — версия схемы дескриптора семейства; все семейства сейчас на `v1`. Новая версия добавляется рядом со старой.
3. **semver аддона** — свободен; версия закрепляется за организацией.

Правила внутри мажорной версии аддитивны: новые необязательные поля, методы, семейства и члены enum разрешены; читатели терпимы к неизвестным полям. Устаревшее помечается через `deprecations[]` рукопожатия; удаление — только с новым `platform`.

Golden-фикстуры сообщений лежат в `packages/sdk/src/protocol/__fixtures__/` — контрактный тест гоняет их через схемы, расхождение схемы и реализации падает в CI, а не в рантайме.

---

Дальше: [AddonContext](context.md) · [SDK API](sdk.md) · [Ошибки и их обработка](context.md#ошибки)
