# План: единый org-канал событий и живые дельты без per-run SSE

## 1. Цель и инварианты

Цель: один транспорт на организацию, через который идут все события, включая содержимое тредов; источник запуска (Telegram, cron, webhook, retry, другой пользователь, субагент) не влияет на доставку.

Инварианты, которые проверяются тестами:

1. Каждый append в журнал порождает событие в org-канал после коммита.
2. Каждый live-дельт публикуется до append, чтобы не было батчинга; дубликаты дедуплицируются по `runId:seq`.
3. Порядок событий одного run строго по `seq`; шина не переупорядочивает.
4. `id` кадра — монотонный `seq` внутри организации; `Last-Event-ID` возобновляет с него.
5. Кадр организации не содержит данных другой организации.
6. При реконнекте нет потери и дублей: replay из ring, при gap — `resync` и перечитывание журнала.
7. Память ограничена: ring и очереди подписчиков имеют лимиты.

## 2. Целевая схема

```text
Telegram / cron / webhook / user / retry
              │
              ▼
SendThreadMessageUseCase / run-engine / ingest / hook-report
              │ append (journal)
              ▼
SqliteRunEventStore ──onAppend──► RunEventBus ──onPublish──► ThreadEventsPort
              ▲                        │
              │                        └──► run:<id> (fleet relay, legacy)
              │
run-engine admit ──publish──► RunEventBus
                                   │
                                   ▼
                         EventsWatchHub (per org)
                         seq + ring + fan-out
                                   │
                         /api/events/watch (SSE)
                                   │
                         client dispatcher
                    (sessionStore / threadStore / desk)
```

## 3. Ключевые решения

| Решение | Почему | Что отвергнуто |
|---|---|---|
| Орг-канал `/api/events/watch`, один SSE на организацию | Один курсор, один dispatcher, все триггеры равны | Per-thread и per-run потоки: N соединений и дублирование логики |
| Live-дельты публикуются в `admit` до append | `JOURNAL_BATCH = 16` даёт батчинг; нужен живой стриминг | Publish после append: дельты пачками |
| Live-курсор — `orgSeq`, не `threadSeq` | `threadSeq` в `admit` ломает порядок append и создаёт дыры; журнал остаётся истиной на resync | Аллокатор `threadSeq` в движке: сложно и рискованно |
| Ring + `resync` вместо replay всей истории | Дёшево; при gap перечитывается только открытый тред | Replay из журнала на каждый реконнект |
| Серверный фильтр по org | Сейчас watch отдаёт все org всем соединениям, это утечка | Клиентский фильтр |
| `thread-error` остаётся для бейджей, но не как триггер refresh | `lastError`/`unread` нужны, контент приходит отдельно | Полное удаление `thread-error` |

## 4. Этапы

### Этап 0. Подготовка

- Прочитать `docs/HARNESS_CHANGE_CRITERIA.md`, зафиксировать ответы по разделу 9.
- Снять baseline: количество `GET /threads/:t`, latency дельт, память SSE, число сетевых вызовов при Telegram-сообщении.
- Добавить тестовые каркасы для `EventsWatchHub`, `RunEventBus`, `applyIncoming`.

### Этап 1. Сервер: публикация с `threadId` и `onAppend`

Файлы:

- `packages/harnesys/src/adapters/run-event-bus.ts`: `publish(runId, threadId, events)`, опция `onPublish`, топики `run:<id>` и `thread:<id>`.
- `packages/harnesys/src/application/run-event-feed.ts`: проброс `threadId`.
- `packages/harnesys/src/application/run-engine-segment.ts`: `SegmentEnv.threadId`; `admit` и `guardedTransition` используют его.
- `packages/harnesys/src/application/run-engine.ts`: `envWith(leaseLost, threadId)`, child journal публикует с `record.threadId`.
- `apps/server/src/app/infra/runtime/hook-report.ts`: `feed.publish(runId, threadId, stored)`.
- `apps/server/src/app/infra/fleet-hub/work-executor.ts`: `feed.publish(envelope.runId, envelope.threadId, stored)`.
- `apps/server/src/app/infra/runtime/sqlite-run-events.adapter.ts`: опция `onAppend`, вызов после коммита для `append` и `appendForThread`; публикуются именно `stored` события с `threadSeq`.
- `apps/server/src/app/infra/runtime/org-run-stores.ts`: передать `onAppend` в стор.
- `apps/server/src/app/infra/runtime/org-runtime.ts`: создать `eventBus` до `createOrgRunStores`; `onAppend` публикует в bus; `onPublish` эмитит `threadEvents.emit(orgId, { type: 'events', threadId, runId, events })`.
- `apps/server/src/app/domain/thread/thread-events.port.ts`: вариант `{ type: 'events'; threadId; runId; events: SessionEvent[] }`.
- `apps/server/src/app/infra/runtime/observe-thread-errors.ts`: убрать ранний `return`, эмитить все распознанные события; запись `lastError` оставить в транзакции, эмит вынести после коммита.
- `apps/server/src/app/application/threads/send-thread-message.use-case.ts`: публиковать `user`-событие после `enqueueThreadMessage`.
- `apps/server/src/app/infra/org-sqlite/thread-transcript.store.ts`: `appendPeopleMessage` возвращает сохранённое событие вместе с `threadSeq`.
- `apps/server/src/app/application/threads/send-thread-dispatch.ts`: публиковать `placement.decided` после append.
- `apps/server/src/app/application/fleet/ingest-run-event.use-case.ts`: убрать `threadSeq` из входящих relay-событий; убрать лишний `publishEvents`, если `onAppend` уже покрывает.

Критерий: unit-тесты на сигнатуры bus, порядок `onAppend`, полный эмит `observeThreadErrors`; сервер бутается; старый run SSE ещё работает.

### Этап 2. Сервер: `EventsWatchHub`

Новые файлы:

- `apps/server/src/app/infra/events-watch/events-watch-hub.ts`
- `apps/server/src/app/infra/events-watch/events-watch.frames.ts`
- `apps/server/src/app/infra/events-watch/events-watch.module.ts`
- `apps/server/src/app/infra/events-watch/events-watch-hub.spec.ts`

Состав hub:

- `Map<orgId, { seq, ring, subscribers }>`.
- `publish(orgId, event, data)`: `seq += 1`, запись в ring, fan-out подписчикам.
- `subscribe(orgId, fromSeq)`: replay кадров `seq > fromSeq`; если `fromSeq` вне ring — кадр `resync`; затем live.
- Ring с лимитом по количеству и байтам; при вытеснении oldest, подписчики с устаревшим курсором получают `resync`.
- Очередь подписчика с лимитом; при переполнении — очистка и один `resync`.
- Фильтрация: только кадры этой организации.

Изменения:

- `apps/server/src/app/api/rest/events-watch.controller.ts`: тонкий фасад, инжектит hub, читает `Last-Event-ID`, пишет `id: <seq>`, keep-alive, заголовки, проверка членства в организации.
- `apps/server/src/app/api/api.module.ts`: регистрация `EventsWatchModule`.
- `apps/server/src/app/domain/source/source-registry.port.ts` + адаптер: `findBySourceId(sourceId)` для тегирования `index-state` организацией.
- `apps/server/src/app/infra/knowledge/knowledge-index-events.adapter.ts`: `index-state` получает `orgId`.
- `packages/studio-shared/src/events-watch.ts`: `EventsWatchThreadEventsFrame { orgId, threadId, runId, events }`; `EventsWatchIndexStateFrame` получает `orgId`.
- `apps/server/src/app/api/guards/session.guard.ts` или новый `org-access.guard.ts`: 403, если у principal нет membership для `X-Org-Id`. Применить к `EventsWatchController`.

Критерий: hub-тесты; две организации; отсутствие cross-org кадров; replay/resync; медленный подписчик не растёт в памяти.

### Этап 3. Клиент: транспорт и dispatcher

Файлы:

- `apps/webui/src/shared/api/sse.ts`:
  - `SseFrame` получает `id?: string`; `readSse` парсит `id:`.
  - `watchEventSource(url, event, onData, { orgId })`: ключ соединения `${url}::${orgId}`, заголовок `X-Org-Id` из опции, `Last-Event-ID` из `conn.lastId`, обновление после каждого кадра.
  - Обработка `resync`: отдельный listener; при 400 на `Last-Event-ID` сброс курсора и повтор без него.
- `apps/webui/src/shared/api/events.ts`: `watchThreadEvents(orgId, onFrame)`, `watchDeskEvents` с `orgId`, `watchResync(orgId, onResync)`.
- `apps/webui/src/features/desk/ui/desk-sync.tsx`: подписка на `thread-events` и `desk` для всех организаций из `useActiveOrgStore.orgs`; остальные топики — для активной.
- Новый `apps/webui/src/features/send-message/model/thread-events.ts`: dispatcher:
  - `appendEvent(threadId, event)`;
  - `run.started` → `startRun`, патч `activeRunId` в `useThreadStore`;
  - terminal → `finishRun`, reconcile, `markUnread`, bump `useOrgActivityStore` для неактивной организации;
  - `user` → `discardDelivered`, `maybeMarkUnread`;
  - `ask` → paused state;
  - `error` → `setFailure`;
  - `agent.handoff` → патч агента.
- `apps/webui/src/widgets/chat-transcript/model/thread-sync.ts`: убрать `connectLiveRun`; оставить только первичную загрузку через `refreshThread`.
- `apps/webui/src/features/send-message/model/send-message.ts`: убрать `connectThreadRun`; после POST выставить `activeRuns`/`runId`, дальше — hub.
- `apps/webui/src/features/send-message/model/hitl-actions.ts`: прямые `respondToRun`/`rejectRun`/`retryRun` без run-клиента.
- `apps/webui/src/widgets/chat-transcript/model/use-spawn-stream.ts`: удалить; события дочерних run приходят в тот же тред.
- `apps/webui/src/features/send-message/model/client-registry.ts`: заменить на `run-actions` и `useRunState`.
- `apps/webui/src/features/send-message/model/run-stream-client.ts`: удалить SSE-транспорт и state machine; оставить только мутации либо удалить целиком.
- `apps/webui/src/widgets/chat-composer/ui/chat-composer.tsx`: `useRunStreamState` → `useRunState`, состояние выводится из `activeRuns`, `ask`, connection state.

Критерий: Telegram-сообщение видно в реальном времени; в Network нет `/runs/:r/events`; две вкладки получают одинаково; реконнект без дублей; переключение организации не рвёт чужие каналы.

### Этап 4. Удаление старого пути

- `apps/server/src/app/api/rest/threads.controller.ts`: удалить `GET :threadId/runs/:runId/events`.
- `apps/server/src/app/application/threads/stream-run-events.use-case.ts`: удалить.
- `apps/server/src/app/api/rest/thread-run-sse.ts`: удалить.
- `apps/server/src/app/domain/thread/local-executor.port.ts`: удалить `stream` и `publishEvents`.
- `apps/server/src/app/infra/runtime/org-runtime.types.ts`, `org-runtime.ts`, `local-executor.adapter.ts`: удалить `stream`/`publishEvents`.
- `apps/server/src/app/application/fleet/ingest-run-event.use-case.ts` и фейки: убрать `publishEvents`.
- `apps/webui/src/shared/api/threads.ts`: удалить `getRunEventsStream`.
- `apps/webui/src/features/desk/ui/desk-sync.tsx`: убрать `refreshThread` из `thread-error`; оставить `setLastError`, `markUnread`, `syncThreadsFromServer`.
- `apps/webui/src/features/desk/model/apply-desk-event.ts`: удалить `run-finish`.
- `packages/studio-shared/src/desk-events.ts`: удалить `run-finish` из union.
- `apps/webui/src/features/desk/model/refresh-thread.ts`: убрать ранний `return`; при `activeRuns[threadId]` использовать `reconcileEvents`, иначе `replaceEvents`.
- `docs/`: обновить архитектурное описание доставки.

Критерий: `grep` не находит удалённые символы; `tsc --noEmit`, `biome check .`, `bun test`; сервер бутается.

### Этап 5. Hardening

- Phantom-события: при terminal reconcile удалять клиентские события терминального run, у которых `seq` больше максимума в журнале.
- Ring: лимит по байтам, метрика evictions.
- Подписчик: лимит очереди, метрика slow drops.
- `resync`: UX-поведение (перечитать открытый тред, инвалидировать список тредов).
- Метрики: frames/s, ring evictions, resyncs, active subscribers, slow drops.
- Документация и runbook.

## 5. Риски и закрытие дыр

| Риск | Механизм | Проверка |
|---|---|---|
| Нарушение порядка `seq` внутри run | Hub FIFO; никогда не replay по `threadSeq` в `appendEvent` | unit: publish 1,2,3 → subscriber 1,2,3 |
| Phantom pre-append событие | terminal reconcile + удаление `seq > journal max` | unit на reconcile |
| Дубли `admit` + `onAppend` | дедуп по `runId:seq` в `applyIncomingEvents` | unit: два одинаковых кадра |
| Gap при реконнекте | `Last-Event-ID` + ring; gap → `resync` + refetch | unit: reconnect с середины |
| Cross-org утечка | per-org канал + guard membership | unit: org A не видит org B |
| Рост памяти | ring cap + subscriber queue cap | unit: медленный подписчик |
| Рестарт сервера | `Last-Event-ID > latest` → `resync` | unit |
| Fleet relay `threadSeq` | strip remote `threadSeq`; hub назначает свой | unit на ingest |
| Ошибка DI (token erased) | value imports, boot | boot сервера |
| Лимит 6 SSE на host | один канал на org; при >6 org — HTTP/2 или cap | manual: 2 org |
| Refresh затирает live | reconcile при `activeRuns` | unit/manual |
| UI-состояние run | `useRunState` из событий + connection state | unit/manual |
| Субагенты | события дочерних run идут в тот же `thread-events` | manual: spawn |
| Source watch gate | acquire/release на соединение | manual |
| `index-state` без org | `findBySourceId` → org | unit |
| Proxy buffering | `X-Accel-Buffering: no`, keep-alive | manual |
| Закрытый stream | catch `enqueue`, unsubscribe | unit |

## 6. Тесты

`bun test`:

- `EventsWatchHub`: монотонный seq, ring replay, gap → resync, org filter, slow subscriber, restart.
- `RunEventBus`: `threadId` в publish, `onPublish`, `onAppend`.
- `observeThreadErrors`: все события в батче, не только первое.
- `ingest-run-event`: strip `threadSeq`, сохранение порядка.
- `applyIncoming`: дедуп, порядок, phantom cleanup.
- `sse`: парсинг `id`, `Last-Event-ID`, `resync`.

Ручные сценарии:

1. Telegram → открытый тред: `user` и дельты в реальном времени.
2. Cron/webhook/retry/второй пользователь: то же.
3. Две вкладки: одинаковый результат, без дублей.
4. Переключение организации: старый канал не рвётся, новый открывается с правильным `X-Org-Id`.
5. Kill сервера: реконнект, replay, без потерь.
6. Медленный клиент: `resync`, память не растёт.
7. Субагент: дельты в родительском треде.
8. Network: нет `GET /runs/:r/events`.

Команды: `bun test`, `tsc --noEmit`, `biome check .`, boot сервера.

## 7. Что теряем и что приобретаем

Приобретаем:

- один канал и одинаковое поведение для всех триггеров;
- живые дельты без батчинга;
- replay и предсказуемый реконнект;
- видимость чужих и дочерних run;
- отсутствие `refreshThread` по пушу и мёртвого `run-finish`;
- серверный org-фильтр вместо клиентского.

Теряем:

- per-run изоляция: падение единственного соединения затрагивает все треды организации;
- `run-stream-client` state machine: заменяется производным состоянием;
- remote relay остаётся с `RUN_EVENT_COALESCE_MS = 40`, то есть удалённые дельты идут пачками 40 мс, если не менять;
- при HTTP/1.1 один SSE на организацию упирается в лимит 6 соединений на host.

Почему это приемлемо: изоляция восстанавливается реконнектом и replay; состояние выводится из событий; 40 мс для удалённых run — существующее поведение, можно уменьшить отдельным решением; лимит соединений актуален только при >6 организациях, для локального стенда это не сценарий.

## 8. HARNESS_CHANGE_CRITERIA (кратко)

- Проблема: раздвоенная доставка, внешние запуски не видны в реальном времени.
- Критерий успеха: Telegram/cron/webhook/retry/другой пользователь доставляются одним каналом без `refreshThread`.
- Улучшается: task success (видимость), predictability (один инвариант доставки).
- Может ухудшиться: latency при реконнекте, память ring; закрывается лимитами и `resync`.
- Offload/pointers: нет.
- Security: серверный org-фильтр + membership guard; `index-state` тегируется org.
- Тесты: hub, bus, ingest, applyIncoming, sse; ручные сценарии.
- Rollback: клиентский switch откатывается, старый run SSE остаётся до этапа 4.

## 9. Решения, которые нужно подтвердить

1. Ring: предлагаю 4096 кадров и 8 МБ на организацию; при вытеснении — `resync`. Ок?
2. Remote relay: оставить `RUN_EVENT_COALESCE_MS = 40` или снизить до 16 мс для дельт? Предлагаю оставить 40 в этом плане, менять отдельно.
3. `thread-error` оставляем для бейджей (`lastError`, `unread`), но убираем как триггер refresh. Ок?
4. Удаление run SSE: отдельным этапом после soak, а не в том же релизе. Ок?
5. Для неактивных организаций подписываемся на `thread-events` и `desk`, остальные топики — только для активной. Ок?

Если подтверждаешь эти пять пунктов, начинаю с этапа 1 и не трогаю удаление старого пути до этапа 4.
