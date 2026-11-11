Пересмотрел под твои три принципа: (1) аддон = самодостаточный скоуп, который можно не ставить, (2) ядро — только переиспользуемые примитивы, без знания о провайдерах, (3) ни один аддон не переписывает шины/привязки заново.

**Что в моём прошлом предложении было не так**

Три пакета (bot-transport / bot-tools / feed) ломают принцип 3: transport и tool-pack работают с одним ботом, одним реестром чатов и одними bindings — раздельно это две копии состояния, два pairing-потока и две привязки chat→thread. Плюс transport «сам по себе» не имеет пользовательского смысла: он пустой без инструментов.

**Сплит: по скоупу аккаунта, не по фичам — 2 аддона**

1. `harnesys.telegram-bot` — «бот в чатах»: transport (`send/edit/typing`, топики) + pair/команды + inbound→bridge + tool-pack (чаты, сообщения, медиа, альбомы, топики, опросы, pin/forward). Ставится отдельно, закрывает полностью: «мой агент живёт в Telegram-чатах». Соединение `telegram-bot`.
2. `harnesys.telegram-feed` — «ленты каналов/групп с user-аккаунта» (MTProto): sources, ingest, фильтры, posts, rules → trigger `telegram.feed`, view `table`/`form`, resident worker. Полностью независим: пользователю может быть нужен только бот или только мониторинг лент. Соединение `telegram-user`.

Разделение transport/tools внутри бота отклонено (дубль bindings), разделение по медиа/тексту отклонено (искусственный скоуп с общим соединением).

**Ядро — только общие примитивы (любой чат-зеркал или feed-аддон их переиспользует)**

- **G1. Проекция сессии прогона (host-side)**: дельты прогона → черновик → `send`/`edit`, resume после рестарта, typing, echo-барьер в персистентном сторе, маршрутизация HITL ask и зарезервированные команд канала (`/stop`, `/link`) — по bindings, без знания о провайдере. Без этого каждый транспортный аддон заново пишет draft-loop (дизайн уже есть: `docs/addons/transport-sessions-design.md`).
- **G2. Read-model привязок для аддонов**: сделано — `ctx.bindings.channels(provider?)` отдаёт свои каналы (`provider`, `channel`, `threadId`, `createdAt`), read-only, без права и без новых таблиц/REST, из существующего `addon_transport_bindings`. Топик пока не отдельная ось ключа: топик-аддон кодирует его в `channel`; отдельный `topic` в ключе привязки — нерешённое решение, а не забытая деталь.
- **G3. Входящие вложения**: сделано — `ctx.bridge.inbound` принимает `attachments: [{ name, mediaType?, path? | dataBase64? }]` (байты чанками кладутся в workspace через `ctx.files.write({ append: true })`, либо inline base64 для мелочи ≤ 20 MiB). Хост резолвит их из workspace-пути, пишет `UploadThreadAttachmentUseCase` в тред и передаёт `attachmentIds` в диспатч рана — контракт общий для всех транспортов, без таблиц в ядре.
- **G4. Исходящие вложения**: сделано — `TransportAttachment` принимает ровно одно из `url` / `path` / `dataBase64`. Хост (`AddonCallService` + `AddonAttachmentSourcePort`) читает workspace-файл (≤ 20 MiB, escape → `invalid_params`/`not_found`) и подставляет `dataBase64` + `name`/`mimeType` перед вызовом `transport.send`/`transport.edit`, так что аддон работает с байтами и не ходит в файлы хоста.
- **G5. Лиза для worker**: сделано — `AddonWorkerLeasePort` + таблица `addon_worker_leases` (org SQLite, ключ `org/addon/worker`), host-методы `workers.lease` / `workers.release`, `holderId = ctx.instanceId`, TTL 5s–1h, эпоха инкрементится при каждом захвате. Отклонение от исходной формулировки: готового generic fleet-lease под произвольный ключ в ядре не было (есть run-claim и source-write lease), поэтому лиза сделана отдельным портом поверх org SQLite, а не поверх run-claim.
- **G6. Креденшелы в URL-пути для `http.fetch`**: сделано — `auth.scheme: 'path'` + `placeholder` (по умолчанию `{token}`), значение берётся из `accounts.access` под тем же гейтом `accounts.use`, подставляется в URL до egress-проверки, символы ограничены `A-Za-z0-9._~:-` (иначе `invalid_params`), в заголовок ничего не добавляется. Для MTProto — уже существующий `accounts.access`.
- **G7. `secrets.set/delete` в своём namespace**: сделано — `ctx.secrets.set(key, value)` и `ctx.secrets.delete(key)` через `AddonSecrets` → `AddonSecretService`, ключ `[A-Za-z0-9_.-]{1,128}`, значение ≤ 8 KiB, доступ только к своему namespace, без отдельного права (как `secrets.get`).
- **G8 (мелкое). `$/progress`** и **`target.modeId`**: сделано — `ctx.progress(token, value)` шлёт `$/progress`, хост больше не роняет уведомление в «unknown method», а публикует org-событие `addon.progress` (`AddonEventForwarder.progress`); `target.modeId` читается `FireTriggerUseCase` и уходит как `mode` рана через `RunDispatchInput.mode` → `SendThreadRunUseCase` (`SendThreadRunBody.mode`).

**Остаётся в аддонах**: парсинг update'ов, decision engine (pair/claim/команды), фильтры, backfill истории, лимиты сверх общих, MTProto-клиент, семантика медиа/опросов/топиков, рендер сообщений, реестр чатов.

Проверенные факты по ходу: `FireTriggerUseCase` требует готовый `target.threadId` (тред создаёт сам аддон, `span` mode override ядра нет), `NeutralBridgeInboundUseCase` создаёт тред и барьер эха только in-process, `addon_transport_bindings` хранит только `external_chat_id` без топика и настроек, `http.fetch` умеет только bearer/basic/header.

















сейчас ведуться доработки:
Пересмотрел под твои три принципа: (1) аддон = самодостаточный скоуп, который можно не ставить, (2) ядро — только переиспользуемые примитивы, без знания о провайдерах, (3) ни один аддон не переписывает шины/привязки заново.

**Что в моём прошлом предложении было не так**

Три пакета (bot-transport / bot-tools / feed) ломают принцип 3: transport и tool-pack работают с одним ботом, одним реестром чатов и одними bindings — раздельно это две копии состояния, два pairing-потока и две привязки chat→thread. Плюс transport «сам по себе» не имеет пользовательского смысла: он пустой без инструментов.

**Сплит: по скоупу аккаунта, не по фичам — 2 аддона**

1. `harnesys.telegram-bot` — «бот в чатах»: transport (`send/edit/typing`, топики) + pair/команды + inbound→bridge + tool-pack (чаты, сообщения, медиа, альбомы, топики, опросы, pin/forward). Ставится отдельно, закрывает полностью: «мой агент живёт в Telegram-чатах». Соединение `telegram-bot`.
2. `harnesys.telegram-feed` — «ленты каналов/групп с user-аккаунта» (MTProto): sources, ingest, фильтры, posts, rules → trigger `telegram.feed`, view `table`/`form`, resident worker. Полностью независим: пользователю может быть нужен только бот или только мониторинг лент. Соединение `telegram-user`.

Разделение transport/tools внутри бота отклонено (дубль bindings), разделение по медиа/тексту отклонено (искусственный скоуп с общим соединением).

**Ядро — только общие примитивы (любой чат-зеркал или feed-аддон их переиспользует)**

- **G1. Проекция сессии прогона (host-side)**: дельты прогона → черновик → `send`/`edit`, resume после рестарта, typing, echo-барьер в персистентном сторе, маршрутизация HITL ask и зарезервированные команд канала (`/stop`, `/link`) — по bindings, без знания о провайдере. Без этого каждый транспортный аддон заново пишет draft-loop (дизайн уже есть: `docs/addons/transport-sessions-design.md`).
- **G2. Read-model привязок для аддонов**: список привязанных каналов/топиков + threadId (read-only), чтобы любой transport-аддон рисовал список чатов и настройки сам.
- **G3. Входящие вложения**: `bridge.inbound` получает `attachments` (chunked bytes), хост материализует их в тред/workspace — контракт общий для всех транспортов.
- **G4. Исходящие вложения**: сделано — `TransportAttachment` принимает ровно одно из `url` / `path` / `dataBase64`. Хост (`AddonCallService` + `AddonAttachmentSourcePort`) читает workspace-файл (≤ 20 MiB, escape → `invalid_params`/`not_found`) и подставляет `dataBase64` + `name`/`mimeType` перед вызовом `transport.send`/`transport.edit`, так что аддон работает с байтами и не ходит в файлы хоста.
- **G5. Лиза для worker**: сделано — `AddonWorkerLeasePort` + таблица `addon_worker_leases` (org SQLite, ключ `org/addon/worker`), host-методы `workers.lease` / `workers.release`, `holderId = ctx.instanceId`, TTL 5s–1h, эпоха инкрементится при каждом захвате. Отклонение от исходной формулировки: готового generic fleet-lease под произвольный ключ в ядре не было (есть run-claim и source-write lease), поэтому лиза сделана отдельным портом поверх org SQLite, а не поверх run-claim.
- **G6. Креденшелы в URL-пути для `http.fetch`**: сделано — `auth.scheme: 'path'` + `placeholder` (по умолчанию `{token}`), значение берётся из `accounts.access` под тем же гейтом `accounts.use`, подставляется в URL до egress-проверки, символы ограничены `A-Za-z0-9._~:-` (иначе `invalid_params`), в заголовок ничего не добавляется. Для MTProto — уже существующий `accounts.access`.
- **G7. `secrets.set/delete` в своём namespace**: сделано — `ctx.secrets.set(key, value)` и `ctx.secrets.delete(key)` через `AddonSecrets` → `AddonSecretService`, ключ `[A-Za-z0-9_.-]{1,128}`, значение ≤ 8 KiB, доступ только к своему namespace, без отдельного права (как `secrets.get`).
- **G8 (мелкое). `$/progress`** и **`target.modeId`**: сделано — `ctx.progress(token, value)` шлёт `$/progress`, хост больше не роняет уведомление в «unknown method», а публикует org-событие `addon.progress` (`AddonEventForwarder.progress`); `target.modeId` читается `FireTriggerUseCase` и уходит как `mode` рана через `RunDispatchInput.mode` → `SendThreadRunUseCase` (`SendThreadRunBody.mode`).

**Остаётся в аддонах**: парсинг update'ов, decision engine (pair/claim/команды), фильтры, backfill истории, лимиты сверх общих, MTProto-клиент, семантика медиа/опросов/топиков, рендер сообщений, реестр чатов.

Проверенные факты по ходу: `FireTriggerUseCase` требует готовый `target.threadId` (тред создаёт сам аддон, `span` mode override ядра нет), `NeutralBridgeInboundUseCase` создаёт тред и барьер эха только in-process, `addon_transport_bindings` хранит только `external_chat_id` без топика и настроек, `http.fetch` умеет только bearer/basic/header.
---
и некоторые уже выполнениы а некоторые еще в процессе, но все эти доработки чтобы стала возможным перенос логики легаси интеграции из ядра в аддоны для Telegram, которую будем распиливать на 2 аддона
твоя задача реализовать эти 2 аддона для телеграма, вносить изменения в ядро запрещено, только в эти 2 аддона, в легаси интеграции все работает, так что нужно просто адаптировать ту логику в аддоны, легаси остается второй паралельной системой и ее мы не трогаем, придерживайся залложенным паттернов и конвенций приложения, решай вопросы без эвристик и хаков, мне нужна чистая валидная реализация, в ядре если вдур ну уж совсем никак без право к то правки как правило адитивные но лучше спроси у меня перед темк ак чтото вносить в ядро, в документации все что нужно с большего описано