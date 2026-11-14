# Архитектура платформы

Как устроена система: сущности, слои кода, жизненный цикл экземпляра, протокол, хранение, наблюдение.

## Сущности и уровни

| Сущность | Уровень | Что это |
|---|---|---|
| **Пакет** (`AddonPackage`) | хост | каталог `add-ons/<id>/<version>/` с `addon.json`, бандлом и ресурсами; идентичность — `id + version + digest` |
| **Установка** | хост | запись в `addons.lock.json`: версия, digest, источник, `trust` |
| **Активация** (`OrgAddon`) | организация | строка `org_addons`: включён ли аддон, закреплённая версия, гранты, конфиг, health |
| **Экземпляр** (`Instance`) | рантайм | процесс (или in-процесс рантайм) на пару (организация × аддон), ленивый, под надзором |
| **Вклад** (`Contribution`) | организация | статическая запись манифеста в реестре ядра, принадлежит `OwnerKey { orgId, addonId, version }` |
| **Привязка** (`Binding`) | организация | какие аккаунты Apps выданы аддону под какую `connection` |
| **Экземпляр триггера** | организация | пользовательская настройка вклада `trigger`: конфиг, цель (агент/тред), включён ли |

Идентификаторы: `addonId = <publisher>.<name>` (`^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$`), встроенные — издатель `harnesys`. Идентификатор вклада локален в аддоне; глобальный ключ `<addonId>/<contributionId>`; имена инструментов, видов триггеров и маршрутов получают префикс аддона на стороне ядра — коллизий между издателями нет.

Имена инструментов для LLM: `<addonId>.<tool>` с заменой всего, что вне `[a-zA-Z0-9_-]`, на `_` (провайдеры не любят точки в function names). `harnesys.google-calendar` + `create_event` → `harnesys_google-calendar_create_event`; внутри аддона вызов идёт по исходному имени.

## Слои кода

```
packages/sdk/src/                     # авторский API: манифест, протокол, семейства, ctx, defineAddon, testing
apps/server/src/app/
  domain/addons/                      # FamilyModule, HostService, permissions, ContributionRegistry, errors, ports/*
  application/addons/                 # use-cases: packages/{plan,confirm,remove,prune,rescan}, orgs/{enable,disable,update,rollback,uninstall,grants,config,bindings},
                                      # triggers/{manage,fire}, jobs, calls/addon-call, reconcile/reconciler, bridge/neutral-bridge-inbound
  infra/addons/
    catalog/     # раскладка FS, lock, staging, digest, источники builtin/local/external, rescan
    supervisor/  # InstanceSupervisor (single-flight), InstanceRuntime (spawn+handshake+ping+RSS), backoff, crash-breaker, idle
    transport/   # NDJSON stdio, in-process пара, SdkInProcessAddonLoader
    sandbox/     # launch-policy (trusted→in-process, restricted→OS-sandbox), launcher-macos (sandbox-exec), launcher-linux, launcher-none
    dispatcher/  # HostDispatcher: право→схема→rate-limit→timeout→валидация результата→метрики→аудит; permission-definitions
    services/    # 17 модулей хост-сервисов: config secrets db log events http files accounts bindings runs triggers bridge workers usage skills org approvals
    families/    # 13 модулей семейств + конформанс-тесты
    storage/     # addon-db (WAL, квоты), sql-guard, миграции+бэкапы, секреты
    apps-bridge/ # AccountsFacade/AccountHolder/InboundEvent — связь со слоем Apps/Accounts
    sessions/    # TransportSessionService: проекция стрима запуска на чат-канал
    source/      # AddonCloudBackend: source-kind аддоны как облачные знание-источники
    wiring/      # композиция DI: addons-wiring.module, supervisor-hooks (replay §8.7, reasons-to-live, handlers-validator)
  api/rest/addons-*.controller.ts     # REST: packages/policy (хост-админ), org CRUD, triggers, jobs, diagnostics, SSE, r/*, public r/*
apps/webui/src/features/manage-addons/  # страницы: список, деталь, consent-dialog, section-registry (12 типов), frame-bridge
add-ons/<id>/                         # встроенные аддоны
```

Направление зависимостей соблюдает clean-architecture правила репозитория: domain ничего не знает про infra; `*.use-case.module.ts` не импортирует infra-модули; сборка — в `addons-wiring.module.ts` (`global: true` для портов, как `AppsModule`).

## Жизненный цикл: от файла до вызова

**1. Каталог хоста.** `BuiltinAddonSourceAdapter` сканирует `add-ons/` монорепо; домашний каталог — `~/.harnesys/add-ons/<id>/<version>/`; `rescan` (`POST /api/addons/packages/rescan`) пересобирает реестр пакетов. Установка внешнего пакета — `plan` (staging → digest → валидация манифеста → план с правами и warnings; код не исполняется) → `confirm` (атомарное перемещение + запись в lock).

**2. Включение организацией.** `POST /api/orgs/:orgId/addons/:id/enable { grants }`: проверка совместимости (`platform`, семейства, `features`) → права (обязательные без гранта → 409 `needs_consent` + SSE-событие, UI открывает диалог согласия) → миграции данных → запись `org_addons` (закрепление версии) → `ContributionRegistry.activate` (валидация → `register` каждого вклада в порядке манифеста; первая ошибка откатывает всё — all-or-nothing).

**3. Ленивая активация экземпляра.** Регистрация вкладов не запускает код. Процесс поднимает `AddonInstanceSupervisor.ensureRunning(orgId, addonId, reason)` — single-flight: параллельные вызовы ждут один запуск. Причины жить: вызов инструмента/маршрута/джоба/хука/транспорта, включённый экземпляр триггера, автостартующий воркер, активная транспортная привязка, `activation: 'resident'`. Нет причин — idle-стоп через 5 минут.

**4. Запуск и рукопожатие.** `resolveLaunchPlan` выбирает режим (`trusted` + builtin/local → in-process; `restricted` → spawn в OS-песочнице). Spawn: `bun <entry>`, cwd — каталог пакета, окружение — белый список (`PATH`, `TZ`, `LANG`) + `HARNESYS_ADDON_ID`, `HARNESYS_DATA_DIR`, `HARNESYS_PLATFORM`; окружение хоста не наследуется, секреты через env не передаются. Хост шлёт `initialize` (15 с на ответ), сверяет идентичность и `handlers` с требованиями манифеста (`incompatible_handlers` при нехватке), затем `initialized`. После handshake — replay: `trigger.start` для всех включённых экземпляров триггеров, `worker.start` для автостартов; расписания джобов не реплелятся — они на host-стороне у croner (§8.7) — аддон обязан быть идемпотентен.

**5. Работа.** Вызовы host→addon идут через `AddonCallService` → supervisor → `TransportRpcClient` с `_meta` (correlationId, deadline, principal, locale). Вызовы addon→host — через `HostDispatcher`: карта методов → право (читается каждый вызов — отзыв действует немедленно) → Zod-схема params → token bucket (200/с, burst 400) → timeout → валидация result → cap → метрики/аудит. `switch` по имени метода нет нигде — списки `services/index.ts` и `families/index.ts`.

**6. Остановка.** `shutdown { reason, deadlineMs: 5000 }` → ожидание текущих вызовов → закрытие stdin → SIGTERM → +2 с SIGKILL группы. Выключение, обновление, удаление, idle, карантин — все пути обязаны не оставлять процессов, таймеров и регистраций.

## Состояния

Желаемое (`enabled`, версия, гранты — в `org_addons`) и фактическое разделены; reconciler (тик 30 с) приводит фактическое к желаемому; он вызывает супервизор, а процессы создаёт и убивает только супервизор (ленивый старт идёт и прямо из `AddonCallService`).

```
stopped → starting → running → stopping → stopped
                      ↓ failed (пауза backoff → перезапуск)        ↑
                      ↓ quarantined (>5 крашей за 10 мин, т.е. карантин на 6-м; ручной reset)
```

Совместимость версии вычисляется: `ok` · `needs_consent` · `incompatible`. Health зеркалируется в `org_addons.health`, изменения публикуют `addon.state_changed` на SSE.

## Схема хранения

Хостовые файлы:

```
~/.harnesys/add-ons/<id>/<version>/          # пакеты
~/.harnesys/add-ons/addons.lock.json          # id, version, digest, source, trust, installedAt
~/.harnesys/add-ons/.staging/<planId>/        # staging плана установки
~/.harnesys/addons-policy.json                # политика хоста (права/хосты/источники/sandbox)
```

Ядро организации (SQLite `org.db`, таблицы платформы — `packages/contracts/src/addons-platform.ts` + `infra/org-sqlite/schema/addons-platform.ts`): `org_addons`, `addon_bindings`, `addon_trigger_instances`, `addon_trigger_fires` (дедуп `instanceId+runKey`), `addon_job_state`, `addon_transport_bindings` (чат↔тред), `addon_transport_sessions` (стриминг-сессии), `addon_transport_outbound` (id исходящих сообщений), `addon_worker_leases` (лизинг воркеров).

Данные самого аддона — вне ядровых таблиц:

```
orgDataDir/<org>/addons/<addonId>/
  data.db      # SQLite, доступ ТОЛЬКО через ctx.db
  files/       # HARNESYS_DATA_DIR указывает на этот каталог целиком (addons/<addonId>/), а ctx.files пишет в workspace организации
  logs/        # журнал экземпляра (ротация 10 MiB × 3)
  backups/     # предреформационные копии (хранятся 3)
```

## Модель доверия и безопасности

Три оси, независимые:

1. **`trust` от источника**, не из манифеста: `builtin` (монорепо `add-ons/`) / `local` (домашний каталог, dev) / `external` (url/реестр — выключен до верификации подписей). Доверие определяет допустимые `runtime.profile` и доступ к `experimental.*`.
2. **`runtime.profile`** — режим исполнения: `trusted` = процесс with cleared env без OS-песочницы (граница — отказоустойчивость, не безопасность) или in-process для builtin/local; `restricted` = песочница (чтение — каталог пакета, запись — каталог данных, сеть запрещена кроме stdio, запуск процессов запрещён). Нет механизма песочницы для external → старт запрещён, пока не включён `allowUnsandboxedExternal` (аудит-запись).
3. **Права** — декларация манифеста ∩ гранты организации ∩ политика хоста. Базовый набор (`config.read`, `log`, `db`, `secrets.own`, `events.emit.own`, `org.read`) выдаётся всегда; всё остальное — только явно выданным грантом, на каждый вызов.

Детали: [Права и согласие](permissions.md), [Упаковка и жизненный цикл](packaging-lifecycle.md).

## Наблюдение

- **Supervisor**: ping 15 с / timeout 5 с / 3 промаха → рестарт; RSS-лимит 512 MiB → рестарт; backoff 1→60 с с джиттером; breaker 5 крашей / 10 мин → карантин (ручной `POST .../quarantine/reset`).
- **Reconciler**: останавливает выключенные-но-живущие, чистит fires старше 7 суток, публикует `addon.update_available`.
- **Поколения**: каждый запуск увеличивает `generation`; сообщения устаревшего поколения отбрасываются.
- **Метрики**: `addons_rpc_total`, `addons_host_call_total`/`_seconds`, `addons_instance_state`, `addons_instance_restarts_total`, `addons_manifest_contributions` — `GET .../metrics`.
- **Журнал**: ring 2000 строк + файл, значения секретов и auth-заголовки редактируются — `GET .../logs`, SSE `.../logs/stream`.
- **Аудит** (append-only): установка/удаление пакетов, включения, гранты и политика, привязки, unsandboxed, карантин, `accounts.access`.
- **correlationId** сквозной: запуск → tools.call → сервисы аддона → http.fetch → доступ к аккаунту.

---

Дальше: [Быстрый старт](getting-started.md)
