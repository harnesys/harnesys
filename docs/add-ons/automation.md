# Автоматизации: триггеры, джобы, воркеры, хуки

Четыре механизма фоновой работы — с разной ответственностью ядра и аддона. Выбирайте по вопросу «кто должен решать, когда исполнять код аддона»: пользователь-инстанс (trigger), расписание ядра (job), сам аддон под надзором ядра (worker), шина событий (hook).

## Trigger: событие из внешнего мира решает пользователь

Семейство `trigger` объявляет **вид** триггера; администраторы организации создают **экземпляры**: конфиг по `configFields` + цель (тред/агент/режим). Каталог автоматизаций получает карточку вида (`<addonId>.<kind>`, `source: 'addon'`) — и показывает её только при включённом аддоне.

Жизненный цикл экземпляра:

```
создание/включение → ensureRunning → trigger.start { instanceId, kind, config, target }
выключение/удаление → trigger.stop { instanceId }
рестарт процесса → повтор trigger.start (idempotent!)
```

Аддон детектирует событие (webhook-маршрут, поллер, слушатель) и зовёт `ctx.triggers.fire`. Ядро на этом пути владеет всем:

1. экземпляр существует и принадлежит этому аддону (иначе ошибка `permission_denied`), включён (иначе `suppressed`);
2. дедупликация по `(instanceId, runKey)` в `addon_trigger_fires`, окно 7 суток, чистка reconciler'ом;
3. лимиты `limits.perDay / throttleSec / maxBurst` из дескриптора применяет `FireWindowTracker` (в-memory окно);
4. диспатч запуска в цель (`target`: `threadId`, `agentId`, `modeId`).

Ответ — `outcome`: `fired` (создан `runId`), `suppressed` (такой `runKey` уже был), `busy` (в цели идёт запуск), `failed`.

Паттерны идемпотентности из реальных аддонов:

- `harnesys.webhook`: `runKey = crypto.randomUUID()` — каждая HTTP-доставка уникальна, дедуп не мешает; статус экземпляра аддон держит в своей БД (`active/paused`) и сам отображает в HTTP-коды.
- `harnesys.scheduler`: `runKey` конструируется детерминированно из инстанса и времени тика; повторный `trigger.start` после рестрта не удваивает сработавшее (свой курсор `last_fired_at` в `schedule_state` + suppressed-лог).

Форма экземпляра: стандартные блоки (name+agent, wake thread, run mode, instructions) рисует хост; дескриптор может их переопределять через `standard`: `{ target: { disabled: true }, instructions: { label: 'Message' } }`.

Экземпляры из REST: `GET/POST/PATCH/DELETE /api/orgs/:orgId/addons/:addonId/triggers`, `POST .../triggers/:tid/enable|disable` (id экземпляра — UUID).

## Job: расписанием владеет ядро

Вклад `job` — периодическая задача с cron (`croner`, строго UTC; поле `timezone` в схеме есть, планировщик его не использует) или `everySec`. Ядро хранит расписание и состояние в `addon_job_state` (`next_run_at`, `last_run_at`, `last_status`, `enabled`), в срок делает `ensureRunning` → `job.run { jobId }` с таймаутом дескриптора (default 900 с, потолок 3600).

Правила:

- Пересечение запусков проускается: single-flight на джоб.
- `catchUp: 'once'` — один догоняющий запуск после простоя; `'none'` — пропуск.
- Администратор может выключить джоб (`PATCH .../jobs/:jobId { enabled }`) и запустить сейчас (`POST .../jobs/:jobId/run`) — на странице аддона в секции Jobs.
- Из кода аддона расписание не задаётся и не меняется.

Внутри `job.run` обычная работа: `ctx.db`, `ctx.http.fetch`, `ctx.triggers.fire`. Планировщик scheduler'а — job `tick` (каждые 60 с, `timeoutSec: 55`), который сам считает дедлайны cron'ов и.fire'ит триггеры: расписание ядра будит код, код будит триггеры.

## Worker: фоновый поток аддона под надзором ядра

Вклад `worker`: `autostart` (при каждом старте экземпляра приходит `worker.start`) и `restart: 'on-failure' | 'never'` (`workers.report(..., 'failed')` → автоперезапуск с паузой 5 с). Остановка: `worker.stop` + отмена `ctx.signal`.

Кодекс воркера (из поллера `harnesys.telegram-bot`):

```ts
start: async (_params, ctx) => {
  while (!ctx.signal.aborted) {
    const lease = await ctx.workers.lease('poller', 60_000);   // durable lease в org SQLite
    if (!lease.held) { await nap(5_000, ctx.signal); continue; }  // держит другой экземпляр
    try {
      await pollOnce(ctx);
      await ctx.workers.report('poller', 'running');
    } catch {
      await ctx.workers.report('poller', 'failed', 'network');
    }
  }
  await ctx.workers.release('poller');
  await ctx.workers.report('poller', 'stopped');
}
```

- `ctx.workers.lease(workerId, ttlMs?)` → `{ held, epoch, expiresAt }` — переживает рестарты, `ttlMs` 5 с–1 ч (default 60 с); вызывайте перед каждой итерацией. `release` снимает лизинг текущего держателя.
- Состояние (`running/stopped/failed`) видно в UI и метриках.
- Состояние для возобновляемой работы (offset, seen-ids) — в `ctx.db` (`getUpdates offset`, дедуп входящих), а не в памяти.
- Нет таймеров из кода: периодичность вне worker — это `job`.

## Hook: реакция на события, at-most-once

Вклад `hook` подписывает аддон на событие статически (подписок из кода нет):

```json
{ "id": "thread-created", "family": "hook", "descriptor": { "id": "thread-created", "on": { "event": "thread.created" } } }
```

- `on.event` — шаблон шины ядра (`thread.created`, `run.*`, `addon.<other>.*`); нужно `events.subscribe` scope `{ patterns }` с покрывающим паттерном (`thread.*`).
- `on.providerEvent` — события провайдера из Apps (`connection` + `types`): webhook-ивенты GitHub, status-события Telegram; фильтруются по типу и привязке аккаунта.
- Доставка `hook.deliver { hookId, event }`, event — `{ name, version, occurredAt, payload }`. Очередь на аддон 256, drop-oldest, вызов ≤ 10 с, процесс поднимается лениво если стоит.
- **At-most-once**: гарантия не доставлена повторо. Если нужна надёжность — триггеры с `runKey`-дедупом или джобы с курсором в `ctx.db`, не хуки.
- Ответ хендлера — сигнал противодавления; не гоняйте в хуке долгую работу — диспатчните себе через триггер/джоб или запишите в БД и обрабатывайте воркером.

## Выбор механизма

| Нужен | Берите |
|---|---|
| Пользователь настраивает «на событие X буди агента Y» | `trigger` |
| Внешний мир постит нам (вебхук) | `trigger` + `route` (см. webhook) или `hook.on.providerEvent` (ивенты Apps) |
| Периодическая работа по расписанию | `job` |
| Непрерывный приём (long-poll, сокет) | `worker` (+ lease) |
| Отреагировать на жизнь ядра (тред создан, запуск закончился) | `hook` |
| Стриминг ответа агента в чат | ничего не пишите — это делает хост ([transport sessions](transport.md)) |

---

Дальше: [Чат-транспорты](transport.md)
