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
- **G4. Исходящие вложения**: `TransportMessage.attachments` принимает `path` в workspace или inline-bytes вместо только `url`.
- **G5. Лиза для worker**: `AddonWorkerLeasePort` поверх существующего fleet-lease — любой поллер, не только Telegram.
- **G6. Креденшелы в URL-пути для `http.fetch`** (`scheme: 'path'` + плейсхолдер): Bot API кладёт токен в путь, `bearer/header` это не выражает. Для MTProto — уже существующий `accounts.access` (high-risk, аудит).
- **G7. `secrets.set/delete` в своём namespace**: сейчас только чтение, а аддон-владелец webhook-секрета/сессии должен писать сам.
- **G8 (мелкое). `$/progress`** и `target.modeId` в trigger-инстансе — общие поля ядра.

**Остаётся в аддонах**: парсинг update'ов, decision engine (pair/claim/команды), фильтры, backfill истории, лимиты сверх общих, MTProto-клиент, семантика медиа/опросов/топиков, рендер сообщений, реестр чатов.

Проверенные факты по ходу: `FireTriggerUseCase` требует готовый `target.threadId` (тред создаёт сам аддон, `span` mode override ядра нет), `NeutralBridgeInboundUseCase` создаёт тред и барьер эха только in-process, `addon_transport_bindings` хранит только `external_chat_id` без топика и настроек, `http.fetch` умеет только bearer/basic/header.