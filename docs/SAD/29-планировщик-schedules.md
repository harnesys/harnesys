# 29. Планировщик расписаний (schedules)

## Обзор

Планировщик запускает потоки (threads) и другие действия по cron-расписанию. Реализован в `app/domain/schedule/` и `app/infra/schedules/`, с портом в `packages/harnesys/src/ports/scheduler.ts`. Планировщик тикает каждую минуту, выбирает срабатывающие расписания, проверяет политику пропуска и размещает run на узле флота.

## Домен (`app/domain/schedule/`)

| Файл | Назначение |
|------|------------|
| `schedule.ts` | сущность расписания (`ScheduleRecord`, константы `SCHEDULE_CATCHUP_WINDOW_SEC` = 3600, `SCHEDULE_CATCHUP_BATCH` = 50, `PLANNER_INTERVAL_MS` = 60_000) |
| `schedule.error.ts` | `ScheduleNotFoundException`, `ScheduleValidationException` |
| `planner.ts` | логика принятия решения о срабатывании (`decideDue`, `planDueBatch`, `scheduleFireId`) |
| `schedule-repository.port.ts` | порт репозитория расписаний (`ScheduleRepositoryPort`: `listByOrg`, `listDue`, `findById`, `findByThreadId`, `listFiresBySchedule`, `insert`, `update`, `delete`, `claimFire`, `recordFireRun`, `releaseFire`) |

## Use-cases (`application/schedules/`)

`scheduleschedule.use-case.module.ts` — создание, обновление, удаление, включение/выключение расписаний. Файлы:
- `create-schedule.use-case.ts` (`CreateScheduleUseCase`)
- `update-schedule.use-case.ts`
- `delete-schedule.use-case.ts`
- `list-schedules.use-case.ts`
- `fire-schedule.use-case.ts` (`FireScheduleUseCase`, результат `fired` | `already_fired` | `unknown_schedule` | `thread_busy` | `schedule_disabled` | `failed`)
- `tick-schedules.use-case.ts` (`TickSchedulesUseCase`, `ModuleInitHook`/`ModuleDestroyHook`, таймер `PLANNER_INTERVAL_MS`)
- `bind-schedule-thread.ts`
- `cron-next.ts` (`nextCronRunAt`, `isValidCron`)
- `schedule.helpers.ts`, `schedule.use-case.fakes.ts`, `cron-next.spec.ts`, `planner.spec.ts`, `schedule-time-zone.spec.ts`

## Контроллер (`app/api/rest/`)

`schedules.controller.ts`.

## Адаптер (`infra/schedules/`)

`scheduleschedule-repository.adapter.ts`, `scheduleschedule.module.ts`.

## Порт планировщика (`packages/harnesys/src/ports/scheduler.ts`)

`SchedulerPort`: `list(scope)`, `peek(scope, id, last?)`, `create(scope, input)`, `update(scope, id, patch)`, `remove(scope, id)`. `ScheduleRecord` с полями `id`, `orgId`, `name`, `status` (`active`|`paused`|`failed`), `targetAgentId`, `detail`, `cron`, `mode` (`PermissionMode`), `threadId`, `nextRunAt`, `lastFiredAt`, `createdAt`, `updatedAt`. История срабатываний живёт в policy привязанного потока (`threads.policy.historyMode/historyLast`), а не в расписании. `SchedulePeekRecord` с массивом `fires` (`{at, detail}`).

## Контракты (`packages/contracts/src/schedules.ts`)

`SchedulePublic`, `ScheduleStatus` (`active`|`paused`|`failed`), `ScheduleMissPolicy` (`catch-up`|`skip`|`escalate`), `CreateScheduleBody`, `CreateScheduleResponse` (расписание + поток), `UpdateScheduleBody`, `ListSchedulesResponse`.

## Расписание и пропуск срабатывания

`ScheduleStatus` — `active`, `paused`, `failed`. `ScheduleMissPolicy` — `catch-up` (догнать), `skip` (пропустить), `escalate` (входящая). Cron-выражение задаёт расписание; часовой пояс берётся из `orgSettings.get(orgId).timezone` (`org-settings.port.ts`).

Политика пропуска (`planner.ts`, `decideDue`):
- если время срабатывания ещё не наступило (`nextDueAt > now`) → `wait` (пропуск итерации);
- если прошло больше `catchupWindowSec` (3600 с) → `miss_stale` (`needsInbox` только для `escalate`);
- если узел офлайн → `fire` (для `catch-up`) или `miss_offline` (для `skip`/`escalate`, `needsInbox` для `escalate`);
- иначе → `fire`.
- Лимит пачки `catchupBatch` (50) — если превышен, оставшиеся расписания остаются на следующий тик.
- `fireId = schedule:{scheduleId}:{scheduledFor.toISOString()}` — идемпотентность через `claimFire`.

## Поток работы

```mermaid
flowchart TD
    Tick[TickSchedulesUseCase каждые 60 с] --> Due[listDue(orgId, now)]
    Due --> Batch[planDueBatch / decideDue]
    Batch --> Wait{action == wait?}
    Wait -->|да| Skip[пропустить итерацию]
    Wait -->|нет| Fire{action == fire?}
    Fire -->|да| FS[FireScheduleUseCase: claimFire -> sendThreadRun trigger=schedule]
    Fire -->|нет| Miss{miss_stale / miss_offline}
    Miss -->|escalate| Inbox[открыть входящую approvals.request]
    Miss --> Advance[advance: nextCronRunAt, обновить nextRunAt/status]
    FS -->|thread_busy / failed| Advance
    FS -->|fired| Record[recordFireRun, lastFiredAt, desk-событие]
    Record --> Advance
    Advance --> Desk[deskEvents.emit расписание]
```

Пошагово:
1. `TickSchedulesUseCase.execute(now)` — по таймеру `PLANNER_INTERVAL_MS` (60_000 мс) обходит все организации (`orgs.list()`).
2. Для каждой организации `schedule-repository.port.ts` `listDue(orgId, now.toISOString())` возвращает расписания с `nextRunAt <= now`.
3. `planner.ts` `planDueBatch` вызывает `decideDue` для каждого: если время не наступило → `wait`; если прошло больше `catchupWindowSec` (3600 с) → `miss_stale` (`needsInbox` для `escalate`); если узел офлайн → `fire` (для `catch-up`) или `miss_offline`; иначе → `fire`. Лимит пачки `catchupBatch` (50).
4. При `fire` — `FireScheduleUseCase.execute` вызывает `claimFire` (идемпотентность по `fireId`), затем `send-thread-run.use-case.ts` с `text: scheduledTaskText(name, detail)`, `mode: schedule.modeId`, `trigger: { kind: 'schedule', id: fireId }`, `attribution: mechanicalRunStart(createdByUserId)`. При успехе `recordFireRun` + `update lastFiredAt` + `deskEvents.emit`. При `ThreadNotFoundException` или `agent has no model` → расписание переводится в `failed`. При конфликте потока → `thread_busy`.
5. `advance` — `nextCronRunAt(cron, now, timezone)` вычисляет следующее время (`croner.Cron` с часовым поясом); при некорректном cron статус становится `failed`.
6. При пропуске с `needsInbox` — `approvals.request` с вопросом о пропуске расписания.

Размещение run по расписанию проверяется через `resolve-run-placement.ts` (`resolveRunPlacement`): подбирает узел по профилю агента через `fleet-hub.port.ts` и `event-claim.port.ts`; если узел не найден → срабатывание считается пропуском (`miss_offline`).

## Связанные разделы

- [28-флот-узлы-fleet.md](./28-флот-узлы-fleet.md) (размещение run на узле)
- [14-потоки-threads.md](./14-потоки-threads.md) (потоки, запускаемые по расписанию)
- [11-база-данных-schema.md](./11-база-данных-schema.md) (таблица schedules)
