Нет, вариант «выбрать одного владельца publish» — не единственный возможный. Правильных конечных состояний два, и они взаимоисключающие по контракту:

1. **Exactly-once на уровне процесса**: один commit → один publish; клиент идемпотентен только как защита от reconnect/replay.
2. **At-least-once**: несколько publish допустимы, но это явный контракт, все потребители обязаны быть идемпотентны, а дубликаты измеряются и не считаются нормой.

Сейчас система находится между ними: сервер молча публикует дубликаты, а идемпотентность реализована только в одном клиенте и только после появления бага. Это и есть архитектурный дефект, а не просто «две колбаски».

## 1. Фактическая причина, а не симптом

В текущем коде есть несколько независимых путей публикации:

- `packages/harnesys/src/application/run-engine-segment.ts:90` — `admit()` назначает `seq` и сразу делает `env.feed.publish(...)`.
- `apps/server/src/app/infra/runtime/sqlite-run-events.adapter.ts:160` — `append()`/`appendForThread()` после commit вызывают `onAppend`, который снова публикует те же события.
- `packages/harnesys/src/application/run-engine-segment.ts:144` — `guardedTransition()` после transition делает `tail()` и публикует события, записанные через `appendWithinTx`.
- `apps/server/src/app/infra/runtime/sqlite-run-lifecycle.adapter.ts:108` — `create()`/`transition()` пишут события через `appendWithinTx`, но `onAppend` там не вызывается; поэтому `guardedTransition` и нужен.
- `packages/harnesys/src/application/run-engine.ts:157` — child journal после `appendForThread` публикует ещё раз.
- `apps/server/src/app/infra/fleet-hub/work-executor.ts:307` — resume после `tail()` публикует ещё раз.
- `apps/server/src/app/application/threads/send-thread-message.use-case.ts:68` — user-сообщение публикуется вручную, потому что пишется в другую таблицу.

Старый per-run SSE маскировал проблему: `run-event-feed.ts` отфильтровывает `seq <= lastSeq`. Новый org-hub — это сырой fan-out, поэтому дубликаты стали видны.

Отсюда важный вывод: **не все publish — лишние**. Часть нужна, потому что запись идёт мимо `onAppend`. Нельзя просто удалить `admit.publish` и `guardedTransition`, иначе потеряются transition-события.

## 2. Почему клиентский dedupe нельзя оставлять единственным решением

Он скрывает не только баг, но и потерю порядка:

- дубликаты занимают ring buffer и трафик;
- каждый новый потребитель (Telegram, cron, webhook, retry, subagent, будущий мобильный клиент) должен повторить одну и ту же логику;
- ошибка в одном потребителе снова даёт двойные сообщения;
- невозможно отличить штатный replay от регрессии сервера.

Идемпотентный consumer нужен, но как **вторая линия защиты**, а не как основной механизм.

## 3. Рекомендуемая целевая модель

**Один post-commit publisher для всех run-событий.**

Инварианты:

- событие создаётся один раз и получает `runId + seq`;
- в БД/журнал событие попадает ровно один раз;
- publish вызывается только после успешного commit;
- все пути записи (`append`, `appendForThread`, `create`, `transition`, in-memory store) используют один и тот же publisher;
- `admit()` только назначает `seq` и складывает событие в pending, но не публикует;
- ручные `feed.publish`/`threadEvents.emit` для run-событий удаляются;
- клиент применяет события идемпотентно по `(runId, seq)`, но в нормальной работе счётчик дубликатов должен быть 0.

Это не «exactly-once по сети» — это **one publish per committed event in-process**. При падении процесса между commit и publish живой кадр может не уйти; клиент восстановит состояние через `Last-Event-ID`/resync из журнала. Это надо явно зафиксировать в контракте, иначе план будет обещать невозможное.

## 4. Что придётся изменить

Сервер:

- `packages/harnesys/src/application/run-engine-segment.ts`
  - `admit()`: убрать `env.feed.publish`.
  - `guardedTransition()`: убрать `tail()` и `feed.publish`, оставить только transition.
- `packages/harnesys/src/application/run-engine.ts`
  - убрать `.then(stored => deps.feed.publish(...))` для child journal.
- `packages/harnesys/src/adapters/in-memory-run-event-store.ts`
  - добавить post-append sink, чтобы fleet/in-memory runtime не потерял live-поток.
- `packages/harnesys/src/adapters/in-memory-run-lifecycle-store.ts`
  - публиковать события `create`/`transition` после записи.
- `apps/server/src/app/infra/runtime/sqlite-run-lifecycle.adapter.ts`
  - принимать `onAppend` и вызывать его после успешного commit для `create` и `transition`.
- `apps/server/src/app/infra/runtime/org-run-stores.ts`
  - передать один и тот же publisher в event store и lifecycle store.
- `apps/server/src/app/infra/fleet-hub/work-executor.ts`
  - убрать ручной `tail + feed.publish` после resume; публикация должна идти из lifecycle/store.
- `apps/server/src/app/infra/runtime/org-runtime-publish.ts`
  - оставить `observeThreadErrors` на post-commit пути.
- `apps/server/src/app/application/threads/send-thread-message.use-case.ts`
  - либо оставить отдельный publish для user-события и явно задокументировать отдельный источник, либо провести user-событие через общий thread-event writer. Я рекомендую второе, но это можно вынести в отдельный этап.

Клиент:

- `apps/webui/src/features/send-message/model/thread-events.ts`
  - оставить `seqCeil` как защиту от replay;
  - добавить счётчик `duplicateFrames` и логировать его в dev;
  - не считать dedupe исправлением бага.
- `apps/webui/src/shared/api/sse.ts`
  - не менять, кроме проверки exclusive replay по `Last-Event-ID`.
- `apply-incoming.ts`
  - использовать как единый idempotent merge, а не писать отдельную логику в dispatcher.

## 5. Латентность: главный компромисс

Если публиковать только после commit, delta-события не увидят до `flushJournal`. Сейчас `JOURNAL_BATCH = 16`, значит при потоке ~50 токенов/с возможна задержка до ~300 мс. Это уже деградация.

Решение: добавить time-based flush для delta-событий:

- в `runSegment` хранить `lastFlushAt`;
- flush при `pending >= JOURNAL_BATCH`, на tool boundary, **или** если прошло `LIVE_FLUSH_MS` (например, 16–25 мс);
- клиентский `RUN_EVENT_COALESCE_MS = 40` оставить;
- измерить p50/p95 до и после; цель — рост end-to-end latency не более чем на 30–50 мс.

Если измерение покажет больший рост, нельзя молча соглашаться. Тогда остаётся второй честный вариант: отдельный live-канал для дельт с commit-маркером и явным retract/resync. Это сложнее, но это осознанный выбор, а не скрытый костыль.

## 6. Пошаговый план внедрения

**Этап 0. Диагностика и метрики, без изменения поведения**

- Добавить счётчик publish по ключу `(runId, seq)` в `createOrgEventPublisher`.
- Добавить счётчик duplicate в web dispatcher.
- Воспроизвести Telegram-ответ и проверить:
  - одинаковый ли `runId` и `seq` у двух пузырей;
  - одинаковый ли `id` у `text-delta`;
  - не приходят ли события из двух разных run.
- Если seq одинаковый — это транспортный дубль. Если разный — это дубль на уровне генерации/проекции, и план надо корректировать до кода.

**Этап 1. Единый publisher на сервере**

- Ввести общий `RunEventPublisher`/sink.
- Подключить его к SQLite event store, SQLite lifecycle, in-memory store, in-memory lifecycle.
- Удалить `admit.publish` и ручные `feed.publish`.
- Удалить `guardedTransition.tail`.
- Убедиться, что `create`/`transition` публикуют ровно один раз после commit.
- Добавить time-based delta flush.
- Прогнать старый per-run SSE и новый org-hub одновременно.

**Этап 2. Клиент**

- Оставить idempotent merge.
- Добавить метрику дубликатов и тест, что при одном commit приходит один кадр.
- Проверить reconnect, `Last-Event-ID`, resync, org switch, вторую вкладку.

**Этап 3. Soak**

- 1–2 дня на реальном Telegram/cron/webhook/subagent.
- Смотреть метрики: duplicate rate = 0, resync rate, ring evictions, p95 latency.
- Сравнить с baseline до изменений.

**Этап 4. Удаление старого пути**

- Только после soak: удалить per-run SSE, `stream-run-events`, `thread-run-sse`, `getRunEventsStream`, `run-finish`.
- Это уже описано в `refactor.md`, этап 4.

## 7. Риски и их закрытие

| Риск | Закрытие |
|---|---|
| transition-события перестанут публиковаться | lifecycle store получает onAppend, тест на `create`/`transition` |
| in-memory/fleet runtime потеряет live-поток | sink в `InMemoryRunEventStore` и `InMemoryRunLifecycleStore` |
| delta-события станут запаздывать | time-based flush, замер p95, порог отката |
| crash между commit и publish | journal + resync; зафиксировать как контракт |
| дубликат всё же прошёл | idempotent merge + duplicate metric + алерт |
| медленный подписчик | существующий resync по overflow |
| user-события потеряются | отдельный источник user-событий или общий writer, тест на Telegram |

## 8. Тесты

Обязательные unit/integration:

- `admit()` не вызывает publish;
- `append()` публикует ровно один раз;
- `transition()` публикует ровно один раз;
- `create()` с events публикует ровно один раз;
- child journal публикует ровно один раз;
- повторный `append` с тем же `(runId, seq)` не создаёт второй кадр;
- hub replay от `Last-Event-ID` не дублирует последний кадр;
- web dispatcher применяет одинаковый кадр один раз и увеличивает duplicate counter;
- org isolation и resync не ломаются.

Ручные сценарии:

- Telegram: ответ приходит одним пузырём;
- web: отправка, стриминг, terminal, retry, HITL;
- cron/webhook/issue trigger;
- subagent в том же треде;
- вторая вкладка;
- offline → reconnect;
- switch org;
- серверный restart.

## 9. Definition of Done

- В нормальном прогоне duplicate rate = 0.
- Нет ни одного места, где run-событие публикуется в обход общего post-commit publisher.
- p95 задержки не выросла больше согласованного порога.
- Old per-run SSE ещё работает до этапа 4.
- `bun test`, typecheck, biome, webui build, health check зелёные.
- В `docs/` зафиксирован контракт доставки: stable id, cursor, at-most-once live, authoritative journal, resync.

Главный вопрос, который надо подтвердить до реализации: **какой порог роста latency считаем допустимым** и **считаем ли мы допустимым at-most-once live при crash с последующим resync**. Если да — план выше канонический и без скрытых дыр. Если нужен crash-proof exactly-once fan-out, потребуется transactional outbox, и это отдельный, более крупный этап.

---

# Статус на 05.11.2026

## Сделано

### Сервер: единый post-commit publisher

- `packages/harnesys/src/application/run-engine-segment.ts`
  - `admit()` больше не вызывает `feed.publish`; только назначает `seq` и возвращает событие.
  - `guardedTransition()` больше не делает `tail()` и повторный publish.
  - `runSegment()` flush-ит по `journalBatch`, tool boundary, journal-boundary card или `liveFlushMs`.
- `packages/harnesys/src/application/run-engine.ts`
  - убран ручной publish child journal после `appendForThread`;
  - `feed` удалён из `RunEngineDeps`;
  - delivery settings читаются на старте run.
- `packages/harnesys/src/application/run-engine-types.ts`
  - добавлены `DeliverySettings`, `DEFAULT_DELIVERY_SETTINGS`, `RunEngineDeps.delivery`.
- `packages/harnesys/src/constants.ts`
  - `DEFAULT_LIVE_FLUSH_MS = 100`, `MIN_LIVE_FLUSH_MS = 50`, `MAX_LIVE_FLUSH_MS = 2000`,
    `DEFAULT_JOURNAL_BATCH = 16`.
- `packages/harnesys/src/ports/run-event-store.ts` + `index.ts`
  - добавлен `RunEventAppendSink`.
- `packages/harnesys/src/adapters/in-memory-run-event-store.ts`
  - sink вызывается один раз после записи;
  - `appendForThread` передаёт реальный `threadId` (исправлено: раньше sink получал пустой threadId для child run).
- `packages/harnesys/src/adapters/in-memory-run-lifecycle-store.ts`
  - `create`/`transition` публикуют события через sink после записи, с правильным `threadId`.
- `apps/server/src/app/infra/runtime/sqlite-run-lifecycle.adapter.ts`
  - `create`/`transition` собирают записанные события внутри транзакции и вызывают `onAppend`
    только после успешного commit.
- `apps/server/src/app/infra/runtime/org-run-stores.ts`
  - один publisher подключён и к event store, и к lifecycle store.
- `apps/server/src/app/infra/runtime/org-runtime.ts`
  - delivery settings читаются из `OrgSettingsPort` на старте run.
- `apps/server/src/app/infra/fleet-hub/work-executor*.ts`
  - убран ручной `tail + feed.publish` после resume;
  - in-memory store публикует через bus.
- `apps/server/src/app/infra/runtime/org-runtime-publish.ts`
  - добавлен duplicate detector по `(runId, seq)` с окном 2048 и warning в dev/test-off.

### Контракт и настройки

- `packages/contracts/src/org-settings.ts`
  - `delivery.liveFlushMs` (50–2000, default 100),
    `delivery.journalBatch` (1–64, default 16);
  - экспортированы `DeliverySettingsSchema`, `DELIVERY_DEFAULTS`, min/max/default константы.
- `packages/contracts/src/domains-org.ts` — новые экспорты.
- `apps/webui/src/features/manage-org-general/ui/org-delivery-section.tsx`
  - UI-секция "Live delivery" с ползунком интервала (50–2000 ms), числовым вводом
    и batch (1–64), сохранение через `patchOrgSettings`.
- `apps/webui/src/features/manage-org-general/org-general-pane.tsx`
  - секция смонтирована рядом с timezone.

### Клиент

- `apps/webui/src/features/send-message/model/thread-events.ts`
  - идемпотентный guard по `(runId, seq)` оставлен как защита от reconnect/replay;
  - клиент больше не создаёт второй пузырь на повторный кадр.
- Удалены старые run-клиенты:
  - `apps/webui/src/features/send-message/model/client-registry.ts`;
  - `apps/webui/src/features/send-message/model/run-stream-client.ts`;
  - `apps/webui/src/widgets/chat-transcript/model/use-spawn-stream.ts`.
- `thread-sync.ts`, `send-message.ts`, `hitl-actions.ts`, `chat-composer.tsx` переведены на hub/`useRunState`.
- `sse.ts` умеет `id`, `Last-Event-ID`, `X-Org-Id`, ключ соединения по org, retry на 400.
- `events.ts` даёт `watchThreadEvents`, org-scoped `watchDeskEvents`, `watchResync`.
- `desk-sync.tsx` подписан на `thread-events` и `desk` для всех орг; `useActiveOrgStore.orgs`
  теперь синхронизируется из `OrgProvider`.

### Проверки, реально выполненные

- `bun test` — **1786 pass / 0 fail**, 358 файлов.
- `bun run --cwd apps/webui typecheck` — чисто.
- `bun run --cwd apps/server typecheck` — только pre-existing ошибка
  `apps/server/src/app/infra/runtime/packs/org-telegram.port.spec.ts(18,18)`.
- `bunx biome check` по всем изменённым файлам — чисто.
- `bun run --cwd apps/webui build` — успешно.
- `GET /health/ready` — **200**.
- `grep -rn "feed\\.publish"` по `packages` + `apps/server` — пусто.
- Добавлены тесты:
  - `InMemoryRunEventStore` sink публикует батч один раз и с правильным `threadId`;
  - `InMemoryRunLifecycleStore` публикует `create` и `transition` по одному разу.

### Исправлено по ходу

- `erasableSyntaxOnly`: constructor parameter property заменён на явное поле в `InMemoryRunEventStore`.
- `InMemoryRunEventStore.appendForThread` больше не теряет `threadId` для sink.
- Biome import/export ordering.

## Осталось

### Проверить вручную / soak

- Telegram-ответ приходит одним пузырём.
- Web: отправка, стриминг, terminal, retry, HITL.
- Cron/webhook/issue trigger.
- Subagent в том же треде.
- Вторая вкладка.
- Offline → reconnect.
- Switch org.
- Restart сервера.
- Смена настроек delivery применяется к следующему run.
- Проверить, что duplicate warning не появляется в логе.
- Soak 1–2 дня: duplicate rate = 0, resync rate, ring evictions, p95 latency.

### Не сделано

- Клиентский счётчик `duplicateFrames` в dispatcher (серверный detector есть, клиентского нет).
- Замер p50/p95 latency до/после в реальном UI.
- Этап 4 из `refactor.md`: удалить per-run SSE, `stream-run-events.use-case.ts`,
  `thread-run-sse.ts`, `LocalExecutorPort.stream`, `getRunEventsStream`, `run-finish`,
  убрать `refreshThread` из `thread-error`.
- Этап 5: phantom cleanup, метрики ring evictions/slow drops/resyncs, UX resync,
  runbook и обновление `docs/`.

### Известные компромиссы

- Live-доставка остаётся **at-most-once in-process**: при падении между commit и publish
  живой кадр может не уйти; журнал + resync восстанавливают состояние.
- `send-thread-message` по-прежнему публикует user-событие отдельно: это другая таблица
  и другой источник, дубля с run-журналом нет.
- Дефолт `liveFlushMs = 100`; при проблемах с SQLite его можно поднять через UI до 2000.

---

# Связка identity ↔ коннектор и зеркало тред↔Telegram (05.11.2026)

## Сделано

### Ядро (провайдер-агностично, без знаний о Telegram)

- `identity.db`: таблицы `identity_links(user_id, provider, provider_user_id)` (уникально `provider+provider_user_id`)
  и `identity_link_codes(code_hash, user_id, provider, expires_at)`.
- `apps/server/src/app/domain/identity/identity-link.port.ts` — порт `IdentityLinkRepository`.
- `apps/server/src/app/infra/identity-sqlite/identity-link.adapter.ts` — адаптер; код одноразовый, живёт 10 минут,
  новый код вытесняет предыдущий, чужой provider-аккаунт даёт `IdentityLinkConflictException`.
- `domain/one-time-code.ts` — общий генератор/хеш одноразовых кодов; `pair-code.ts` переведён на него.
- Use-cases: `CreateIdentityLinkCodeUseCase`, `ConfirmIdentityLinkUseCase`, `ListIdentityLinksUseCase`,
  `UnlinkIdentityUseCase`.
- REST: `GET /api/identity/links`, `POST /api/identity/links/:provider/code`,
  `DELETE /api/identity/links/:provider` (`identity-links.controller.ts`).
- Тесты: `identity-link.adapter.spec.ts` (6 сценариев).

### Telegram-коннектор (вся специфика — в модуле коннектора)

- `/link <code>` в приватном чате, работает без привязанного треда (`bot-commands`, `inbound-decision`,
  `apply-telegram-update.use-case`).
- Входящее сообщение от привязанного пользователя получает `startedByUserId` и имя из приложения
  (`apply-telegram-actions.ts`, `linkedAuthorOf`), т.е. прогон и usage атрибутируются app-юзеру.
- Модуль коннектора импортирует `IdentityUseCaseModule`/`IdentitySqliteModule` — зависимость только в сторону ядра.

### Зеркало тред → Telegram

- Маршруты проекции теперь по биндингам треда (`listBindingsByThread`), а не по `run.originConnectorId`
  (`project-connector-routes.ts`), провайдер передаётся селектором.
- Стрим прогона идёт во все привязанные Telegram-коннекторы; ключи inflight/session — per connector+run.
- User-события из кадра `events` эхо-ятся во все привязанные коннекторы, кроме источника, с подписью автора
  (`project-connector-echo.ts`, `appEchoText(author, text)`).
- `connector_deliveries.last_seq` — курсор применённых событий; при рестарте проекция продолжает с него,
  а не с seq 0, и переиспользует `external_message_id`; незавершённая доставка редактируется, а не шлётся заново.
  Миграция колонки идемпотентная (`migrateConnectorDeliveryCursor`).

### UI

- `apps/webui/src/shared/api/identity-links.ts` — query/mutations.
- `telegram-identity-card.tsx`: статус связи, код, инструкция `/link <code> @bot`, копирование, «I sent it · Refresh»,
  «Get a new code», Unlink с подтверждением. Смонтирована в `telegram-detail.tsx` сразу под чек-листом настройки.
- Deep link `https://t.me/<bot>?start=link_<code>` («Open @bot»), копируется целиком `/link CODE`;
  `decideStart` понимает префикс `link_`. В группе на `/link` бот отвечает «Send /link in a direct message to this bot.»
- В `identity_links` добавлены `display_name`/`handle` (миграция `migrateIdentityLinkProfileColumns`), карточка
  показывает имя и `@username` вместо числового id; ссылка общая для всех воркспейсов и обновляется по фокусу окна.
- `telegram-thread-badge.tsx` показывает «Link your Telegram account», если тред зеркалится, а аккаунт не связан.

### Проверки

- `bun test` — **1802 pass / 0 fail**.
- `bun run --cwd apps/server typecheck` — только pre-existing `org-telegram.port.spec.ts(18,18)`.
- `bun run --cwd apps/webui typecheck` — чисто.
- `bunx biome check` по всем изменённым файлам — чисто.
- `bun run --cwd apps/webui build` — успешно.
- `/health/ready` — 200, миграции применились на живой БД.

## Осталось

- Ручной прогон: линковка кода, эхо веб→Telegram, ответ агента из веб-прогона, отсутствие эха Telegram→Telegram.
- Файлы/картинки веб→Telegram (сейчас только текст).
- Мерж существующих `thread_participants` при линковке (сейчас линк влияет на новые сообщения).
- Полная инкапсуляция коннекторов (Telegram-код всё ещё в общих папках `application/connectors`, `api`).

---

# Telegram content management (05.11.2026)

- Восстановлены и расширены агентские инструменты Telegram: фото, документы, видео, анимации, аудио,
  голосовые, альбомы 2–10, правка подписей, пересылка, unpin, темы форума (создать/переименовать/
  закрыть/удалить), опросы и квизы. Текстовые посты получили HTML/MarkdownV2, silent, protect_content,
  управление превью ссылки и reply.
- Вход файлов: `filePath` (включая `thread:`), `fileId` или base64; путь проходит через file access policy.
- Инструменты: `packages/harnesys/src/packs/telegram` (`media-tools.ts`, `topic-tools.ts`,
  `extra-tools.ts`, `input.ts`); сервер — `OrgTelegramPort`, `org-telegram-actions.ts`,
  `TelegramApiAdapter` (`telegram-api-media.ts`, `telegram-api-chat.ts`, `telegram-api-files.ts`).
- Описание и ограничения — `docs/telegram-content-tools.md`.
