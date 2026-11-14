# Чат-транспорты: аддон-мессенджер

`transport`-семейство делает аддон каналом общения: внешний чат (Telegram, Slack, почта…) становится интерфейсом тредов агентов. Разделение ответственности принципиальное:

- **Аддон** говорит на протоколе провайдера: принимает входящие (`ctx.bridge.inbound`), умеет отправлять/редактировать/показывать typing (`transport.send/edit/typing`), рисует канал (кейбординг, разметку, chunking).
- **Ядро** владеет мостом: авто-ответчик, привязка чат↔тред, политика эха, HITL, **стриминг ответа агента в канал** (проекция `TransportSessionService`). Код аддона в этой проекции не участвует.

## Объявление

```json
{
  "id": "channel", "family": "transport",
  "descriptor": {
    "provider": "telegram",
    "title": "Telegram",
    "connection": "telegram-bot",
    "capabilities": { "threads": true, "edit": true, "typing": true, "attachments": true, "topics": true, "reactions": false, "readReceipts": false },
    "limits": { "textMax": 4096 }
  }
}
```

- `provider` — пространство имён каналов (`telegram:12345`); привязки хранятся в `addon_transport_bindings`.
- `capabilities` говорят ядру, чем богаты канал и аддон (edit — можно ли редактировать сообщения при стриминге, typing, вложения, топик-форумы); `limits.textMax` — ядро ограничивает исходящие.
- У дескриптора нет флага стриминга: `streaming: false` пишет в ядровый `ChannelCapabilities` сам хост. Канал-нативный стриминг (`transport.stream`/`transport.stream.ack`, флаг `capabilities.stream`) — резервируемый слот протокола ([roadmap](roadmap.md)); редактируемый draft его не требует.

## Обработчики

```ts
const transport: TransportHandlers = {
  send: async ({ message }, ctx) => {
    // message: { channel, text, format?, replyTo?, topic?, attachments?, options? }
    const api = await tgCall(ctx, 'sendMessage', { chat_id: message.channel, text: message.text });
    return { messageId: String(api.result.message_id) };
  },
  edit: async ({ messageId, message }, ctx) => {
    await tgCall(ctx, 'editMessageText', { chat_id: message.channel, message_id: messageId, text: message.text });
  },
  typing: async ({ channel, on }, ctx) => {
    if (on) await tgCall(ctx, 'sendChatAction', { chat_id: channel, action: 'typing' });
  },
};
```

Возврат `send` — `{ messageId? }`; эти id хост кормит эхо-барьером (`recordOutbound`), чтобы ответ агента, призеркаленный провайдером, не улетел обратно в тред.

Входящие `transport.send/edit` несут **материализованные** вложения: хост сам читает workspace-`path` в `dataBase64` (с `name`/`mimeType`), процесс аддона файлов хоста не касается; ровно один источник (`url | path | dataBase64`), файл ≤ 20 MiB.

## Входящие сообщения

Приёмник — worker-поллер (long-poll), route-вебхук, или что угодно, что зовёт мост:

```ts
await ctx.bridge.inbound({
  channel: `telegram:${chat.chatId}`,
  from: `telegram:${message.from.id}`,
  text: message.text,
  payload: { provider: 'telegram', chatId, messageId, topicId },
  attachments: [{ name: 'photo.jpg', mediaType: 'image/jpeg', dataBase64 }],
});
```

Ядро (`NeutralBridgeInboundUseCase`) решает: новый канал → создаёт тред с первым активным агентом и строку привязки, существующий → диспатч в тред; pairing-код/claim — работа аддона (telegram-bot: route `/pair`). Право `bridge.inbound`; ≤ 10 вложений (`path | dataBase64`, ровно один источник), каждое ≤ 20 MiB; большой файл сначала через `ctx.files.write({ append: true })`, потом `path`.

`payload` — сырые данные провайдера, они же придут агенту/командному обработчику.

## Привязки чатов: не своя таблица

```ts
const chats = await ctx.bindings.channels('telegram');
// [{ provider, channel, threadId, createdAt }]
```

Хост пишет строки привязки сам, при первом `bridge.inbound` с незнакомым каналом. Поэтому аддону не нужна своя таблица привязок: список чатов для UI рендерится отсюда (паттерн `harnesys.telegram-bot`: route `/chats` + view-таблица с unbind-action, зовущим route `/chats/:id/unbind`). Топик-ось в привязке пока не отдельна — тем, кому нужно, кодировать топик внутри `channel`.

## Стриминг ответа агента (host projection)

Когда пользователь пишет в чат, а агент отвечает потоком, ядро само проецирует дельты запуска (`ThreadEventsPort` → `text-delta`) в канал через обработчики аддона — схема edit-based:

```
первый flush: transport.send(draft) → messageId
дальше:       transport.edit(messageId, draft)  — не чаще 1/с и при +200 символов
terminal:     run.completed → финальный edit; cancelled → "[stopped]"; failed → "[error]"
parked (HITL) → transport.send(c текстом вопроса + options[]) → следующий inbound с цифрой/label → RespondRunUseCase
```

Что это значит для автора транспорта: ничего не делать для стриминга. Нужно только честно объявить `capabilities` (edit — можно редактировать, typing — есть индикатор) и корректно реализовать send/edit. Сессии живут в `addon_transport_sessions` (draft, lastSeq, status `streaming|parked|closed`) и переживают рестарт: при загрузке открытые сессии replay'ются из run event store. Отвергнутый edit засчитывается как неудачный flush; после трёх подряд сессия закрывается. Статус доставки сообщения на стороне коннектора держит `ConnectorDeliveryRecord.status` (`deliveryStatus`: `streaming | final | failed`).

`message.options` (`[{ id, label }]`) — структурированный HITL-вопрос; аддон рендерит inline-клавиатуру (Telegram) или пронумерованный список (plain-канал). Совпадение ответа разбирает ядро — approval store аддону не отдаётся.

## Типовой транспорт: состав вкладов

`harnesys.telegram-bot` — образец (см. также [examples в Анатомии](anatomy.md)):

| Вклад | Зачем |
|---|---|
| `transport` `channel` | send/edit/typing, capabilities, textMax 4096 |
| `worker` `poller` | getUpdates long-poll с lease, offset в БД, дедуп `inbound_seen` |
| `tool-pack` `telegram` | 12 инструментов агента: send_media, edit/delete, pin, topics, poll… |
| `config` | `commands` (включить разбор команд), `media_limit_mb` |
| `route` ×3 | GET `/chats`, POST `/pair`, POST `/chats/:id/unbind` |
| `view` `main` | status/capabilities/permissions/connections/config/jobs + форма pair + таблица чатов + markdown |
| `connection` `telegram-bot` | bot token как account `telegram-bot` (cardinality one, optional) |

Команды чата (`/stop`, `/compact`, `/stats`, `/skills`) разбираются аддоном из inbound-текста и вызывают `ctx.runs.cancel` / `ctx.threads.compact` / `ctx.usage.summary` / `ctx.skills.list` — для них нужны права `runs.dispatch`, `threads.compact`, `usage.read`, `skills.read`.

## Ограничения и тонкости

- Эхо-барьер хостовый: id, возвращённые из вашего `send`, учтены; собственные входящие, призеркаленные провайдером, гасятся. Не добавляйте свой «last sent»-фильтр — дедуп уже сделан.
- Rate-limit канала: при `rate_limited`/timeout из ваших обработчиков следующий flush по-прежнему несёт слитый полный текст draft'а — дельты не теряются; третья подряд неудача закрывает сессию. Медленный аддон не блокирует запуск: один in-flight flush-вызов на сессию.
- Получив `messageId`, ядро всегда использует `transport.edit`, не разветвляя проекцию на `capabilities.edit`; флаг пишется в ядровый `canEditMessages` для потребителей — объявляйте его честно, иначе черновик не обновляется и сессия закрывается по счётчику неудач.
- Вложения в исходящем сообщении (path/dataBase64/url) материализуются на хосте до вызова; чанковые файлы > 20 MiB — не вложения канала, а ссылка.

---

Дальше: [UI аддона](ui.md)
