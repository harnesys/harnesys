# Глоссарий

Термины платформы аддонов по алфавиту. Определения короткие, ссылки — на страницы с полным разбором.

| Термин | Определение |
|---|---|
| **addonId** | Глобальный уникальный id пакета формата `<publisher>.<name>` (`harnesys.webhook`). В UI это тоже ключ перевода. |
| **Binding** | Привязка аккаунтов хоста к подключению аддона: `PUT .../bindings/:connectionId { accountIds }` (`BindingRepositoryPort`). |
| **Bus Event** | Структурированное событие шины хоста (`EventBusPort`, каталог `host-event-catalog.ts`); аддон публикует через `ctx.events.emit`. |
| **Capability** | Read-model возможностей пакета на карточке — выводится из вкладов по семействам (`addon-capabilities-view.ts`); есть view-секция `capabilities`. |
| **Connector** | Тип тредов и автоматизаций для внешних источников (`kind: 'connector'`) — легаси-слой, рядом живут аддоны. |
| **Consent (owner consent)** | Подтверждение владельцем организации доступа аддона к персональным данным его аккаунта; diff прав при обновлении → `addon.consent_required`. |
| **Contribution** | Объявление «что аддон добавляет в платформу» в манифесте (13 семейств). |
| **Control Plane** | REST/UI слой, где аддон описывает себя и управляет состоянием. |
| **Digest** | SHA-256 по сортированным путям и байтам файлов пакета (`packageFiles` в `addon-digest.ts`); ключ идентичности версии в lock и в плане установки. |
| **Dispatch** | Маршрутизация вызова в экземпляр аддона через `HostDispatcher` (из транспорта, REST или UI-вызова). |
| **Event Bus** | Внутренняя шина хоста; аддон публикует через `ctx.events.emit`, подписки семейств — через мосты. |
| **FieldSpec** | Декларативное описание поля формы (`kind` + `widget`/`optionsFrom`), ранится в общем диалоге. |
| **Grant** | Выданное аддону разрешение (`{ id, scope? }`); меняет админ организации, новые обязательные требуют consent. |
| **HITL (Ask)** | Запрос подтверждения действия человеком: `ctx.approvals.request` → inbox организаций (`approvals-service`). |
| **Identity Link** | Связка внешнего identity с участником: `GET/POST /api/identity/links` (`identity-links.controller.ts`). |
| **Instance** | Экземпляр сущности аддона (приёмник триггера, задача, бот) с id и config. |
| **InstanceKey** | `{orgId}/{addonId}` — адрес экземпляра в реестре supervise-процессов (`instance-registry.ts`). |
| **Lease** | Эксклюзивная аренда воркера с epoch: `ctx.workers.lease(workerId, ttlMs)` (durable, в org SQLite). |
| **Local Account** | Логин самой организации (`/auth/login`); не внешний провайдер. |
| **Manifest** | Файл `addon.json` — контракт пакета (тип `AddonManifest`: id, version, platform, runtime.entry/profile, activation, permissions, connections, data?, features?, contributions). |
| **Method** | RPC-метод аддона (`webhook.fire`), вызывается диспетчером по регистрации вклада. |
| **Namespace** | Префикс id пакета (`harnesys.*`, `acme.*`), обязателен схемой `AddonIdSchema`. |
| **Org Grant** | Разрешение аддону читать данные организации (`org.read`, baseline). |
| **OwnerKey** | Ключ владельца вкладов: `{orgId}/{addonId}@{version}` (`ownerKeyId`, domain/addons/owner.ts). |
| **Package** | Папка с `addon.json` и бандлом; единица установки в каталог хоста. |
| **Permission** | Право на хост-метод (`threads.read`, `http.fetch`); проверяется диспетчером до исполнения. |
| **Protocol** | JSON-RPC (NDJSON stdio)-канал раннер ↔ хост; таблица методов в SDK (`protocol/map.ts`). |
| **Purge** | Стирание данных экземпляра при удалении из организации: `DELETE .../:id?data=purge`. |
| **Recovery** | Replay `trigger.start`/`worker.start` и пересчёт джобов после рестарта процесса/хоста — обработчики идемпотентны. |
| **Remote Account** | Внешний identity (Google/Telegram/GitHub) без локального логина. |
| **RunKey** | Ключ идемпотентности запуска: автор передаёт детерминированный `runKey` в `ctx.triggers.fire`; хост дедуплицирует по паре `(instanceId, runKey)` (`fire-trigger.use-case.ts`). |
| **Runner** | Исполнение кода аддона: in-process (builtin/local `trusted`) или отдельный процесс `bun <runtime.entry>` под супервизором. |
| **Secrets** | Хранилище ключ/значение аддона (`secrets.get/set/delete/list` — только у самого аддона; в read-model не светятся). |
| **SSE** | Server-Sent Events: `GET /api/events/watch` (шина), `GET .../addons/events`, `GET .../logs/stream`. |
| **Supervisor** | Менеджер процессов аддонов: spawn, ping/рестарты, backoff, карантин, idle-эвикция. |
| **Studio** | Отдельного desktop-приложения разработки аддонов нет: управление — фича webui `manage-addons`, сборка — `bun run addon:build`; `apps/desktop` — Tauri-оболочка webui. |
| **Tool** | Инструмент агента из семейства `tool-pack`. |
| **Transport** | Семейство вкладов `transport`: доставка событий чата/канала (`transport.send/edit/typing`) + `TransportSessionService` на хосте. |
| **Trust Level** | Доверие пакета (`AddonTrustSchema`): `builtin` / `local` / `external`; механику исполнения задаёт `runtime.profile`: `trusted` / `restricted`. |
| **Typeguard** | Проверка payload по JSON-схеме: `requestSchema` маршрута (`routeSchemaIssues`), схемы дескрипторов семейств. |
| **Usage** | Статистика токенов/стоимости: `ctx.usage.summary` (право `usage.read`). |
| **Verification Code** | Код привязки remote identity: `POST /api/identity/links/:provider/code`, TTL 10 минут, одноразовый (`LINK_CODE_INVALID`). |
| **Worker** | Долгоживущий слот исполнения семейства `worker` (`restart: on-failure \| never`), автостарты держат instance alive. |

---

← [На главную](README.md) · [Обзор системы](overview.md)
