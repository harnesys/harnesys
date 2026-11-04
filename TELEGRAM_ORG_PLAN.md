# Telegram → org-level: план переделки (multi-agent mirror)

Дата: 2026-11-04
Ветка-источник UI/идей: `origin/feat/telegram-group-threads`
Рабочая ветка: `telegram` (`b891ef4`)
Статус: модель подтверждена, план к реализации.

---

## 0. Подтверждённые решения

- **Бот — только транспорт.** Прямой привязки «агент → бот» нет. В UI бота нет раздела «Agents».
- **DM-чат бота — такой же чат-маршрут**, как группа/топик. DM → `chat`-тред с одним агентом.
- **Группа/топик → `group`-тред** с N агентами, одним auto-reply (или none), остальные — mention-only.
- **Один чат → максимум один тред.** Один тред → не больше одного чата на одного бота (к разным ботам — можно).
- **DM → `chat`-тред; группа/топик → `group`-тред.** При подключении `chat`-треда к группе предлагаем превратить его в `group` с подтверждением.
- **Топики можно создавать из Harnesys** (`createForumTopic`).
- **Группа появляется как «Not connected».** Тред не создаётся до явного Connect.
- **Pairing создаёт DM-чат, но не тред.**
- **`unpair` отвязывает только DM.** Группы/топики остаются.
- **Удаление агента не удаляет бота.**
- **В группах ответы с префиксом `Coder:`.**
- **Одинаковые mention-имена в одном треде запрещены.**
- **Каналы/publishing — следующая фаза.**
- **App→TG — только inbound-triggered.** Сообщения из UI Harnesys в Telegram не зеркалятся.
- **Бот должен быть админом или иметь выключенный privacy mode** для групп. Иначе Connect блокируется с чеклистом.
- **Новых per-connector таблиц нет.**
- **`connector_agents` — производный ACL**, не UI-сущность.

---

## 1. Главный принцип

```
Bot (транспорт: токен, @username)
  └── Chat (DM / группа / топик)          = connector_bindings
        └── Connection (thread_id)        = binding.thread_id
              └── Thread (разговор)       = threads
                    ├── agents            = thread_agents
                    └── auto-reply agent  = threads.auto_reply_agent_id
```

Правила:

1. **Бот не владеет агентами.** Бот владеет чатами.
2. **Чат подключается к треду.**
3. **Тред владеет агентами:** N участников + один auto-reply (или none).
4. **Нет сущности «агент привязан к боту».** Есть «чат бота подключён к треду, в котором есть агент».
5. **Право агента использовать бота** = он состоит в треде, подключённом к чату этого бота. Отдельного ACL в UI нет.

`connector_agents` остаётся в БД как **производный ACL**: объединение `thread_agents` по всем подключённым чатам бота. Он нужен существующему коду (`connectorMembersOf`, pack ACL), но пользователь его не видит.

### 1.1. Твои формулировки → модель

| Ты говоришь | В модели |
|---|---|
| привязать агента к боту | DM-чат бота → `chat`-тред с агентом |
| привязать к группе | чат группы → `group`-тред |
| привязать к топику | чат топика → `group`-тред |
| несколько агентов к одному боту | один `group`-тред с N агентами → чат группы |
| несколько агентов к группам/топикам | несколько тредов, каждый → свой чат |

DM-сценарий не исчезает. Внутри он выглядит как «подключить этот тред к DM-чату бота», а не «привязать агента к боту». Для пользователя можно писать «Chat with Coder in Telegram» — смысл тот же.

### 1.2. Кардинальности

| Связь | Правило |
|---|---|
| Bot → Chats | 1:N |
| Chat → Thread | N:1 — у чата максимум один тред |
| Thread → Bots | 1:N, но **не больше одного чата на одного бота** |
| Thread → Agents | 1:N |
| Agent → Threads | 1:N |
| Thread → auto-reply | 0..1 |

Почему у чата максимум один тред: два треда в одном чате будут конкурировать за ответы. Если нужны два разговора — это два топика, а не два треда в одном чате.

Почему не больше одного чата на бота: `runs.origin_connector_id` + `findBindingForThread` должны однозначно находить чат для ответа. Один тред может быть подключён к разным ботам, но не к двум чатам одного бота. Это ограничение можно снять позже, если добавить `origin_binding_id`, но для релиза оно не нужно.

### 1.3. DM

- Pair code — per-bot. Пользователь открывает `t.me/<bot>?start=<code>`.
- После `/start` создаётся/находится `connector_bindings` с `chat_type='private'`, `thread_id=NULL`.
- Бот отвечает: «Paired. Connect this chat to a thread in Harnesys.»
- Админ в org-UI подключает DM-чат к существующему `chat`-треду или создаёт новый с одним агентом.
- DM-тред имеет `auto_reply_agent_id = agentId` (единственный участник).
- Пока DM-чат не подключён, он свободен для системных уведомлений; агентские сообщения туда не идут.

### 1.4. Группа/топик

- Бот добавлен в группу → `my_chat_member` создаёт binding `chat_type='group'/'supergroup'`, `thread_id=NULL`.
- Форум: каждое сообщение с `message_thread_id` создаёт/находит binding топика; `forum_topic_created` создаёт binding заранее.
- Группа/топик в UI: «Not connected». Тред не создаётся, агенты не запускаются.
- Админ нажимает Connect → выбирает существующий `group`-тред или создаёт новый, назначает агентов и auto-reply.
- После Connect сообщения группы идут в тред; ответы агентов возвращаются в тот же чат/топик.
- Несколько агентов в одном треде: `thread_agents` = все; `auto_reply_agent_id` = один или null; остальные отвечают только по `@mention`/reply.

### 1.5. Маршрутизация

```
Telegram update
  → poller (connector.id = бот)
  → findBindingByChat(orgId, connector.id, chatId, topicId)
  → binding.threadId
  → thread + thread_agents
  → resolveResponders(...)
  → run(agent)
  → ответ mirror-ится в binding (runs.origin_connector_id)
```

`resolveResponders` уже реализует нужную политику:

1. `explicitAgentId` + упомянутые агенты + автор replied-to сообщения;
2. пересечение с `thread_agents` (и с `connector_agents` как safety net);
3. если пусто → `auto_reply_agent_id`, если он member;
4. иначе — никто не отвечает, бот молчит.

Важно: несколько упоминаний → несколько агентов, но **последовательно** (one live run per thread). Это не баг, а свойство группового runtime.

### 1.6. `connector_agents` как производный ACL

- `syncConnectorAgents(orgId, connectorId)`:
  - собрать все `thread_agents` по всем `binding.thread_id` этого бота;
  - заменить `connector_agents` этим множеством.
- Вызывать после:
  - connect/disconnect чата;
  - create topic;
  - add/remove thread agent;
  - delete thread;
  - delete agent.
- `connectorMembersOf` продолжает пересекать `thread_agents` с `connector_agents` — как safety net. Если sync пропущен, агент не ответит; поэтому на sync нужны тесты.

### 1.7. Lifecycle

**Unpair**
- Отвязать только `chat_type='private'` bindings (`thread_id=NULL`, `status='unpaired'`).
- Группы/топики не трогать.
- Очистить pair code, выдать новый.
- `connectors.status = 'active'`, если остались group/topic bindings; иначе `awaiting_pair`.

**Удаление агента**
- Убрать из `connector_agents` (без удаления бота/секрета).
- Для каждого треда агента:
  - `group`: если остались члены — переназначить `auto_reply_agent_id` на другого или очистить; убрать `thread_agents`; тред живёт.
  - `group` без членов — удалить тред, предварительно detached bindings.
  - `chat` — удалить тред, предварительно detached bindings.
- `syncConnectorAgents` для затронутых ботов.

**Удаление треда**
- Найти все bindings по `thread_id`, сделать `detachBinding`, `syncConnectorAgents`, затем удалить тред.
- Чаты остаются `unpaired`.

**Удаление бота**
- Удалить секрет и `connectors` (cascade: bindings, agents, inbox, deliveries).
- Треды остаются; bindings удалены каскадом, висячих `thread_id` нет.
- `poller.sync`.

**Удаление последнего агента у бота**
- Бот остаётся. Это нормальное состояние org-level бота.

### 1.8. Ограничения платформ

**Telegram Bot API**
- Не умеет listing чатов бота. Группы/каналы узнаём только через `my_chat_member`, сообщения и ручной `getChat`.
- `getChat` работает по числовому id или `@username` (для публичных).
- `createForumTopic` требует админа с `can_manage_topics`.
- Чтобы получать все сообщения группы, бот должен быть админом или иметь выключенный privacy mode. Иначе `@Coder` (не `@botusername`) до бота не дойдёт.
- `getMe.can_read_all_group_messages` показывает, выключен ли privacy mode глобально.
- `getChatMember` показывает статус бота в конкретной группе.
- Пустые топики сами не появятся: их надо создать из Harnesys или дождаться первого сообщения.
- Каналы — отдельная фаза; `channel_post` не включаем в релиз.

**Harnesys**
- Один live run на тред; несколько упомянутых агентов отвечают по очереди.
- `chat`-тред имеет ровно одного агента; для нескольких агентов нужен `group`-тред.
- `thread_agents` — источник членства; `threads.auto_reply_agent_id` — единственный источник auto-reply.
- `runs.origin_connector_id` есть только у inbound-triggered запусков; UI-сообщения в TG не зеркалятся.

---

## 2. Аудит: что уже правильно и что меняем

### 2.1. Что уже правильно

| Таблица/механизм | Что уже есть | Вывод |
|---|---|---|
| `connectors` | `org_id`, `provider`, `secret_ref`, `bot_user_id`, `bot_username`, lease | Бот уже org-level |
| `connector_bindings` | `external_chat_id`, `external_topic_id`, `chat_type`, `thread_id NULL`, `status` | Чат/топик уже отдельная сущность |
| `threads` | `kind`, `auto_reply_agent_id`, `policy` | Тред уже умеет нескольких агентов |
| `thread_agents` | many-to-many | Членство уже есть |
| `thread_participants` | `provider`, `provider_user_id` | Telegram-пользователи уже учитываются |
| `runs.origin_connector_id` | есть | Ответ уже маршрутизируется к боту |
| `resolveResponders` | explicit + mentions + reply-to + auto-reply | Политика уже готова |
| unique index `(org_id, provider, bot_user_id)` | есть | Несколько ботов уже возможны |

**Миграция БД не нужна.** `chat_type` не имеет CHECK на `private`; `connector_bindings.status` уже `active|unpaired`; `threads` уже поддерживает `auto_reply_agent_id`.

### 2.2. Что сломано / что меняем

| # | Дефект | Файлы |
|---|---|---|
| 1 | API agent-scoped: `orgs/:orgId/agents/:agentId/connectors` | `apps/server/src/app/api/rest/connectors.controller.ts` |
| 2 | Почти все use-case'ы ищут бота через `findByAgentProvider(orgId, agentId, 'telegram')` | `connector-view.ts`, `upsert-telegram-connector.use-case.ts`, `telegram-connector-actions.use-case.ts`, `connect-connector-binding.use-case.ts`, `add/remove-connector-agent.use-case.ts` |
| 3 | `upsert` ищет существующего бота по агенту → второй токен перезаписывает первого | `upsert-telegram-connector.use-case.ts` |
| 4 | Нельзя завести второго бота через UI | `agent-connectors-pane.tsx`, `connector-api.ts` |
| 5 | Бот обязан иметь ≥1 агента; удаление последнего агента удаляет бота | `remove-connector-agent.use-case.ts`, `delete-agent.use-case.ts` |
| 6 | `openConnectorThread` добавляет **всех** агентов бота в тред | `open-connector-thread.ts` |
| 7 | Pair/enqueue автоматически создают тред из агентов бота | `apply-telegram-actions.ts` |
| 8 | `ConnectorBindingPublic` не отдаёт thread summary/auto-reply; UI не может показать, что к чему подключено | `packages/contracts/src/connector.ts`, `connector.helpers.ts` |
| 9 | `add/remove-connector-agent` — неправильная сущность; агенты должны назначаться в тред | `add-connector-agent.use-case.ts`, `remove-connector-agent.use-case.ts` |
| 10 | Нет `my_chat_member` и `forum_topic_created`; группа/топик не появляются | `telegram-update.ts`, `telegram-api.adapter.ts` |
| 11 | Нет `getChat`/`createForumTopic` | `telegram-api.port.ts`, `telegram-api.adapter.ts` |
| 12 | Нет проверки admin/privacy перед Connect группы | `connect-connector-binding.use-case.ts` |
| 13 | Нет sync `connector_agents` при изменении членства треда | `add/remove-thread-agent.use-case.ts`, `delete-thread.use-case.ts`, `delete-agent.use-case.ts` |
| 14 | `DeleteThreadUseCase` не detach'ит bindings | `delete-thread.use-case.ts` |
| 15 | В настройках агента управление коннектором | `agent-config-category-panes.tsx`, `agent-connectors-pane.tsx` |
| 16 | Telegram в каталоге `planned`; detail-page не умеет `telegram` | `packages/contracts/src/integrations.ts`, `connector-detail-page.tsx` |
| 17 | Удалённые spec'и коннекторов не восстановлены | коммит `b891ef4` |
| 18 | `docs/GROUP_THREADS_MODEL.md` всё ещё говорит «админ подключает чат из панели коннекторов агента» | `docs/GROUP_THREADS_MODEL.md` |

---

## 3. UX

### 3.1. Один визард, два входа

Шаги:

1. **Where** — бот → чат: DM / группа / топик.
   - Для группы: «Add to group» (deep link `?startgroup=true`), «Create topic» (если форум), «Refresh».
2. **Conversation** — «Use existing thread» (поиск/выбор) или «Create new thread» (название по умолчанию = название группы/топика).
3. **Who answers** — multi-select агентов, один auto-reply (или None), остальные автоматически mention-only.

Входы:

- из бота: «Connect a chat»;
- из треда: «Connect to Telegram».

### 3.2. Карточка бота

```
@my_bot  (id 123456789)
  Connections
    DM @user              → Thread "Trip" (Coder, auto-reply)
    Group "Team"          → not connected
      Topic "General"     → Thread "Team general" (Coder + Genie, auto-reply Coder)
      Topic "Backend"     → Thread "Backend" (Genie, mention-only)
  Policy / Pair / Pause / Remove
```

- Никакого раздела «Agents».
- У каждой строки чата: тип, название, статус (`Connected`/`Not connected`), название треда, агенты, auto-reply.
- Действия: Connect / Disconnect / Open thread / Create topic / Forget chat.
- Для неподключённой группы — кнопка «Add to group» с deep link.

### 3.3. Карточка агента (read-only)

```
Telegram
  Used in:
    Group "Team" / Topic "General" — auto-reply
    DM @user — mention-only
  [Open Telegram settings]
```

- Никаких токенов, pause/resume, connect/disconnect.
- Данные берутся из `orgConnectorsQuery`: `bindings[].agentIds` и `bindings[].autoReplyAgentId`.

### 3.4. Тред

- Если тред подключён к чату, в заголовке бейдж: `Telegram · Group "Team" / Topic "General"`.
- Действия: «Open in Telegram» (если есть username/ссылка) и «Disconnect».
- Если тред не подключён — «Connect to Telegram».

### 3.5. Пустые состояния

- Нет ботов → «Create a bot».
- Бот есть, групп нет → «Add the bot to a group» + deep link.
- Группа есть, не подключена → «Connect this group to a thread».
- Тред не выбран → «Create a new thread or use an existing one».
- Нет агентов → «Add agents to the thread».

### 3.6. Принцип «гибкая схема, узкий UI»

- В БД не запрещаем комбинации, которые могут понадобиться: `binding.thread_id` nullable, `thread_agents` many-to-many, `auto_reply_agent_id` nullable, `chat_type` — строка.
- На первом экране — один понятный путь. Сложные комбинации (несколько чатов на тред, promotion `chat`→`group`) — вторичными действиями/подтверждениями.
- Не показываем `connector_agents`, `chat_type` vs `kind`, внутренние id без необходимости.

---

## 4. Контракты и API

### 4.1. `packages/contracts/src/connector.ts`

**`ConnectorBindingPublicSchema`** — добавить thread summary:

```ts
export const ConnectorBindingPublicSchema = z.object({
  id: z.string().uuid(),
  chatId: z.string(),
  topicId: z.string().nullable(),
  chatType: z.string().min(1),
  title: z.string().nullable(),
  status: ConnectorBindingStatusSchema,
  threadId: z.string().uuid().nullable(),
  threadTitle: z.string().nullable(),
  threadKind: ThreadKindSchema.nullable(),
  agentIds: z.array(z.string().uuid()),          // члены треда
  autoReplyAgentId: z.string().uuid().nullable(),
});
```

**`ConnectorPublicSchema`** — убрать `agents` и `threadId` (бот больше не «владеет» агентами и одним тредом), добавить `botId`:

```ts
export const ConnectorPublicSchema = z.object({
  id: z.string().uuid(),
  orgId: OrgIdSchema,
  provider: ConnectorProviderSchema,
  status: ConnectorStatusSchema,
  botId: z.string(),
  botUsername: z.string(),
  lastError: z.string().nullable(),
  capabilities: ConnectorCapabilitiesSchema,
  capabilityWarning: z.string().nullable(),
  bindings: z.array(ConnectorBindingPublicSchema),
  policy: MirrorPolicyPublicSchema,
  createdAt: z.string().min(1),
  updatedAt: z.string().min(1),
});
```

**Новые body-схемы:**

```ts
export const ListConnectorsQuerySchema = z.object({
  provider: z.string().trim().min(1).optional(),
  agentId: z.string().uuid().optional(),
});

export const AttachChatBodySchema = z.object({
  chatId: z.string().trim().min(1),             // numeric id или @username
  topicId: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1).max(160).optional(),
});

export const ConnectChatBodySchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('existing'),
    threadId: z.string().uuid(),
    allowPromote: z.boolean().optional(),        // chat -> group
  }),
  z.object({
    mode: z.literal('new'),
    title: z.string().trim().min(1).max(120).optional(),
    agentIds: z.array(z.string().uuid()).min(1).max(8),
    autoReplyAgentId: z.string().uuid().nullable().optional(),
  }),
]);

export const CreateTopicBodySchema = z.object({
  name: z.string().trim().min(1).max(128),
});
```

**Ответы:**

```ts
export const ConnectChatResponseSchema = z.object({
  connector: ConnectorPublicSchema,
  binding: ConnectorBindingPublicSchema,
});

export const AttachChatResponseSchema = ConnectChatResponseSchema;
export const CreateTopicResponseSchema = ConnectChatResponseSchema;
```

`UpsertTelegramConnectorBodySchema`, `PatchTelegramPolicyBodySchema`, `IssuePairCodeResponseSchema`, `UnpairTelegramConnectorResponseSchema`, `TelegramConnectorActionResponseSchema` — оставить. Убрать `threadId` из `UpsertTelegramConnectorResponseSchema`.

`AddConnectorAgentBodySchema` и `ConnectConnectorBindingBodySchema` можно удалить: первый больше не нужен, второй заменён на `ConnectChatBodySchema`.

### 4.2. `packages/contracts/src/integrations.ts`

- `ConnectorDescriptorSchema.auth.kind`: добавить `'bot-token'`.
- `CONNECTOR_CATALOG` для `telegram`:
  - `status: 'available'`;
  - `auth: { kind: 'bot-token' }`;
  - `tagline: 'Bots, groups, and topics for agents'`;
  - описание без «Planned»;
  - capabilities — пустые или `['channels']` (если расширяем enum).

### 4.3. Org-level REST

Базовый путь: `orgs/:orgId/connectors`.

| Метод | Путь | Назначение |
|---|---|---|
| `GET` | `/orgs/:orgId/connectors?provider=&agentId=` | Список ботов организации |
| `GET` | `/orgs/:orgId/connectors/:connectorId` | Один бот с bindings/thread summary |
| `POST` | `/orgs/:orgId/connectors/telegram` `{token}` | Создать бота |
| `PUT` | `/orgs/:orgId/connectors/:connectorId/telegram` `{token}` | Заменить токен/личность |
| `DELETE` | `/orgs/:orgId/connectors/:connectorId` | Удалить бота |
| `POST` | `.../:connectorId/telegram/pair-code` | Новый pair code |
| `POST` | `.../:connectorId/telegram/pause` | Пауза |
| `POST` | `.../:connectorId/telegram/resume` | Возобновление |
| `POST` | `.../:connectorId/telegram/unpair` | Отвязать DM, группы сохранить |
| `PATCH` | `.../:connectorId/telegram/policy` | Mirror policy |
| `POST` | `.../:connectorId/telegram/chats/attach` `{chatId,topicId?,title?}` | Вручную добавить чат/топик через `getChat` |
| `POST` | `.../:connectorId/telegram/chats/:bindingId/connect` `ConnectChatBody` | Подключить чат к существующему/новому треду |
| `DELETE` | `.../:connectorId/telegram/chats/:bindingId/connect` | Отвязать чат (тред остаётся) |
| `POST` | `.../:connectorId/telegram/chats/:bindingId/topics` `{name}` | Создать forum topic и binding |
| `DELETE` | `.../:connectorId/telegram/chats/:bindingId` | Забыть чат (удалить binding) |

**Убрать** agent-scoped пути и `POST/DELETE .../agents`. Старый UI-клиент `manage-agent/model/connector-api.ts` удаляется.

### 4.4. Thread API

- Подключение к существующему треду не меняет его агентов. Чтобы изменить состав/auto-reply, UI открывает тред и использует существующие:
  - `PATCH /threads/:threadId/policy` `{ autoReplyAgentId }`;
  - `POST /threads/:threadId/agents` `{ agentId }`;
  - `DELETE /threads/:threadId/agents/:agentId`.
- Эти use-case'ы должны вызывать `syncConnectorAgentsForThread` после изменения членства.
- `AddThreadAgentUseCase` больше не должен молча назначать auto-reply: для Telegram-тредов auto-reply выбирается явно. Для in-app тредов поведение можно оставить, но UI Telegram-визарда всегда передаёт явное значение.

---

## 5. Backend: пошаговый план

### Фаза 0. Контракты

- [ ] `packages/contracts/src/connector.ts`: `ConnectorBindingPublic` с thread summary; `ConnectorPublic` без `agents`/`threadId`, с `botId`; `ConnectChatBody`, `AttachChatBody`, `CreateTopicBody`, `ListConnectorsQuery`; ответы.
- [ ] Удалить `AddConnectorAgentBodySchema`, `ConnectConnectorBindingBodySchema`.
- [ ] `packages/contracts/src/integrations.ts`: Telegram `available`, `bot-token`.
- [ ] Проверить экспорт через `packages/contracts/src/domains-agents.ts`.

### Фаза 1. Домен и репозиторий

- [ ] `apps/server/src/app/domain/connector/connector-repository.port.ts`:
  - оставить `listByOrg`, `findById`, `findByBotUser`, `findBindingByChat`, `listBindings`, `attachBindingThread`, `detachBinding`;
  - добавить `listBindingsByThread(orgId, threadId)`;
  - добавить `replaceAgents(orgId, connectorId, agentIds: string[])`;
  - `findByAgentProvider` можно оставить для legacy, но org-level код его не использует;
  - `clearBindings` больше не использовать для unpair (оставить для delete/тестов).
- [ ] `apps/server/src/app/infra/connector/connector-repository.bindings.ts`:
  - `listBindingsByThread` — `WHERE thread_id = ?`;
  - `replaceAgents` — транзакционно `DELETE` + `INSERT`.
- [ ] `apps/server/src/app/infra/connector/connector-repository.store.ts`:
  - опционально `findByProvider`, чтобы не фильтровать в памяти.
- [ ] Схема **не меняется**. `connector_agents` остаётся, но становится derived.

### Фаза 2. View-слой

- [ ] `apps/server/src/app/application/connectors/connector.helpers.ts`:
  ```ts
  export function toBindingPublic(
    rec: ConnectorBindingRecord,
    thread: ThreadRecord | null,
    agentIds: string[],
  ): ConnectorBindingPublic;
  ```
  - `threadTitle = thread?.title ?? null`;
  - `threadKind = thread?.kind ?? null`;
  - `autoReplyAgentId = thread?.autoReplyAgentId ?? null`;
  - `agentIds`.
- [ ] `apps/server/src/app/application/connectors/connector-view.ts`:
  ```ts
  export interface ConnectorViewDeps {
    connectors: ConnectorRepositoryPort;
    agents: AgentRegistryPort;
    threads: ThreadRepositoryPort;
    threadAgents: ThreadAgentRepositoryPort;
  }
  ```
  - `connectorView` для каждого binding читает `threads.findById` и `threadAgents.listByThread`.
  - `requireConnector(connectors, { orgId, connectorId })` — поиск по id + `provider === 'telegram'`.
  - Удалить `requireTelegramConnector` (или оставить deprecated-обёртку).
  - `connectorAgentsOf` оставить только для внутренних нужд/pack, не для public.
- [ ] Обновить конструкторы всех use-case'ов, которые строят view: добавить `ThreadRepositoryPort` и `ThreadAgentRepositoryPort`:
  - `upsert-telegram-connector.use-case.ts`
  - `telegram-connector-actions.use-case.ts`
  - `connect-chat.use-case.ts` (новый)
  - `disconnect-chat.use-case.ts` (новый)
  - `attach-chat.use-case.ts` (новый)
  - `create-topic.use-case.ts` (новый)
  - `list-connectors.use-case.ts`

### Фаза 3. Общие помощники

- [ ] `apps/server/src/app/application/connectors/sync-connector-agents.ts`:
  ```ts
  export interface SyncConnectorAgentsDeps {
    connectors: ConnectorRepositoryPort;
    threadAgents: ThreadAgentRepositoryPort;
  }

  export function syncConnectorAgents(
    deps: SyncConnectorAgentsDeps,
    orgId: string,
    connectorId: string,
  ): void {
    const bindings = deps.connectors.listBindings(orgId, connectorId);
    const agentIds = new Set<string>();
    for (const binding of bindings) {
      if (!binding.threadId) continue;
      for (const row of deps.threadAgents.listByThread(orgId, binding.threadId)) {
        agentIds.add(row.agentId);
      }
    }
    deps.connectors.replaceAgents(orgId, connectorId, [...agentIds]);
  }

  export function syncConnectorAgentsForThread(
    deps: SyncConnectorAgentsDeps,
    orgId: string,
    threadId: string,
  ): void {
    for (const binding of deps.connectors.listBindingsByThread(orgId, threadId)) {
      syncConnectorAgents(deps, orgId, binding.connectorId);
    }
  }
  ```
- [ ] `apps/server/src/app/application/connectors/mention-names.ts`:
  ```ts
  export function assertUniqueMentionNames(
    agents: Array<{ id: string; name: string }>,
  ): void;
  ```
  - `name.toLowerCase()` и `mentionSlug(name)`.
  - При коллизии — `ConnectorValidationException('Two agents in this thread have the same mention name: ...')`.
- [ ] `apps/server/src/app/application/connectors/thread-kind.ts`:
  ```ts
  export function threadKindOfChat(chatType: string): 'chat' | 'group' {
    return chatType === 'private' ? 'chat' : 'group';
  }
  ```
  - `channel` пока не подключаем; если пришёл — validation error.

### Фаза 4. Подключение чата

#### 4.1. `connect-chat.use-case.ts` (новый, заменяет `connect-connector-binding.use-case.ts`)

Request:

```ts
interface ConnectChatRequest {
  orgId: string;
  connectorId: string;
  bindingId: string;
  body: ConnectChatBody;
}
```

Алгоритм:

1. `requireConnector`.
2. `binding = findBinding(orgId, connectorId, bindingId)`; иначе `ConnectorNotFoundException`.
3. Если `binding.threadId !== null` → `ConnectorConflictException('This chat is already connected. Disconnect it first.')`.
4. `targetKind = threadKindOfChat(binding.chatType)`.
   - `private` → `chat`;
   - `group`/`supergroup` → `group`;
   - `channel` → `ConnectorValidationException('Channels are publish-only; coming in the next phase')`.
5. Для `group` → `assertBotCanReadGroup(connector, binding.externalChatId)`:
   - `token = secrets.get(...)`;
   - `me = telegram.getMe(token)`;
   - если `me.canReadAllGroupMessages` → ok;
   - иначе `member = telegram.getChatMember(token, chatId, connector.botUserId)`;
   - если `member.status` ∈ `{administrator, creator}` → ok;
   - иначе `ConnectorValidationException('Make the bot a group admin or disable privacy mode in BotFather (/setprivacy).')`.
6. Если `body.mode === 'existing'`:
   - `thread = threads.findById(...)`; иначе `ThreadNotFoundException`.
   - Для `chat`:
     - `thread.kind` должен быть `chat`;
     - `threadAgents.listByThread(...).length === 1`;
   - Для `group`:
     - если `thread.kind === 'chat'`:
       - если `!body.allowPromote` → `ConnectorPromotionRequiredException('This is a 1:1 thread. Confirm converting it to a group thread.')`;
       - `threads.patch(orgId, thread.id, { kind: 'group' })`;
     - `thread.kind` должен быть `group`.
   - Проверить, что этот тред не подключён к другому чату **этого же бота**:
     ```ts
     const existing = connectors.findBindingForThread(orgId, connector.id, thread.id);
     if (existing && existing.id !== binding.id) {
       throw new ConnectorConflictException('This thread is already connected to another chat of this bot');
     }
     ```
   - `attachBindingThread(orgId, binding.id, thread.id, now)`.
7. Если `body.mode === 'new'`:
   - `agentIds = unique(body.agentIds)`.
   - Проверить, что все агенты существуют (`agents.findById`).
   - `assertUniqueMentionNames(agents)`.
   - Для `chat`: `agentIds.length === 1`, иначе validation error.
   - Для `group`: `agentIds.length >= 1` (и ≤ 8, как `CreateThreadBody`).
   - `autoReplyAgentId`:
     - `chat` → `agentIds[0]`;
     - `group` → `body.autoReplyAgentId ?? null`;
     - если задан и не входит в `agentIds` → validation error.
   - `thread = threads.insert({ kind: targetKind, title: body.title ?? binding.title ?? 'Telegram', autoReplyAgentId, policy: { version: 1 }, metadata: { connectorId, provider }, ... })`.
   - Для каждого `agentId` → `threadAgents.ensure`.
   - `attachBindingThread`.
8. `syncConnectorAgents(deps, orgId, connectorId)`.
9. Вернуть `{ connector: connectorView(...), binding: toBindingPublic(...) }`.

#### 4.2. `disconnect-chat.use-case.ts`

- `requireConnector`, `findBinding`.
- Если `threadId !== null` → `detachBinding`.
- `syncConnectorAgents`.
- Вернуть view. Тред не удалять.

#### 4.3. `attach-chat.use-case.ts`

- `requireConnector`.
- `token = secrets.get`.
- `info = telegram.getChat(token, body.chatId)`.
- `findBindingByChat(orgId, connectorId, info.id, body.topicId ?? null)`; если есть — вернуть.
- `insertBinding`:
  - `chatType = info.type` (`private|group|supergroup|channel`);
  - `title = body.title ?? info.title ?? info.username ?? info.id`;
  - `threadId: null`, `status: 'unpaired'`.
- Вернуть view.
- Это путь для групп, куда бота добавили до регистрации токена, и для ручного добавления по `@username`.

#### 4.4. `create-topic.use-case.ts`

- `requireConnector`, `findBinding` (группа/супергруппа, `topicId === null`).
- `assertBotCanManageTopics`.
- `topic = telegram.createForumTopic(token, binding.externalChatId, body.name)`.
- `insertBinding`:
  - `chatType = binding.chatType`;
  - `externalTopicId = topic.topicId`;
  - `title = body.name`;
  - `threadId: null`, `status: 'unpaired'`.
- Вернуть `{ connector, binding }`.
- UI сразу предлагает Connect.

#### 4.5. `open-connector-thread.ts`

- Удалить/заменить. Inbound больше не создаёт треды.
- Оставить только `threadKindOf`/`createThreadForChat` для `connect-chat` (mode `new`), чтобы не дублировать insert.
- `threadKindOf` больше не зависит от `agentCount`: `private → chat`, иначе `group`.

### Фаза 5. Inbound и discovery

#### 5.1. `telegram-update.ts`

Добавить в `CanonicalUpdate`:

```ts
| {
    kind: 'chat_member';
    chatId: string;
    chatType: string;
    chatTitle: string;
    status: string;
    userId: string;
  }
| {
    kind: 'topic_created';
    chatId: string;
    chatType: string;
    chatTitle: string;
    topicId: string;
    title: string;
    author: CanonicalAuthor;
  }
```

Парсинг:

- `root.my_chat_member` → `chat_member` (`new_chat_member.status`, `chat.title`, `chat.type`).
- `root.message.forum_topic_created` → `topic_created` (`message_thread_id`, `forum_topic_created.name`).
- `message_thread_id` уже используется для `topicId`.
- `from.is_bot === true` → `unsupported`/ignore, чтобы не отвечать другим ботам.
- `channel_post` пока **не** добавляем (каналы — следующая фаза).

#### 5.2. `telegram-api.port.ts` / `telegram-api.adapter.ts`

Добавить:

```ts
export interface TelegramChatInfo {
  id: string;
  type: string;
  title: string | null;
  username: string | null;
}

export interface TelegramForumTopic {
  chatId: string;
  topicId: string;
}

abstract getChat(token: string, chatId: string): Promise<TelegramChatInfo>;
abstract createForumTopic(token: string, chatId: string, name: string): Promise<TelegramForumTopic>;
```

- `getChat` → `callJson(token, 'getChat', { chat_id: chatId })`.
- `createForumTopic` → `callJson(token, 'createForumTopic', { chat_id, name })`; вернуть `message_thread_id`.
- `TelegramChatMember` расширить `canManageTopics: boolean`.
- `DEFAULT_ALLOWED` → добавить `'my_chat_member'`. `'channel_post'` не добавлять.
- `getMe` уже возвращает `canReadAllGroupMessages`; использовать в guard.

#### 5.3. `apply-telegram-update.use-case.ts`

- `chatOf` поддержать `chat_member` / `topic_created`.
- `inboxKindOf`:
  - `chat_member` / `topic_created` → `'unsupported'` (CHECK в `connector_inbox` не меняем).
- Перед `decideInbound`:
  ```ts
  if (request.update.kind === 'chat_member' || request.update.kind === 'topic_created') {
    this.discoverChat(orgId, connector, request.update);
    this.deps.connectors.markInbox(orgId, inboxId, 'consumed');
    return;
  }
  ```
- `discoverChat`:
  - `chat_member`:
    - `findBindingByChat(chatId, null)`;
    - если нет → `insertBinding` с `chatType`, `title`, `threadId: null`, `status: 'unpaired'`;
    - если есть → обновить title (и, при желании, `status` не трогать);
    - `left`/`kicked` → binding не удалять, только обновить title/пометку.
  - `topic_created`:
    - `findBindingByChat(chatId, topicId)`;
    - если нет → `insertBinding` с `externalTopicId`, `title`, `threadId: null`, `status: 'unpaired'`.
- `decideInbound` для этих kind'ов не вызывается.
- Для `topic_created` можно сразу отправить в чат «Topic registered. Connect it in Harnesys.» — опционально, чтобы не спамить, лучше не отправлять.

#### 5.4. `apply-telegram-actions.ts`

- `pairConnector`:
  - создать/найти DM-binding;
  - `connectors.update(status: 'active', pairCodeHash: null, pairCodeExpiresAt: null)`;
  - **не** вызывать `openConnectorThread`;
  - ответить `pairedNotice()`: «Paired. An admin can connect this chat to a thread in Harnesys.»
- `claimBinding`:
  - создать/найти unpaired binding;
  - ответить `pendingClaimNotice()`: «This chat is not connected yet. An admin can connect it in Harnesys.»
- `enqueueInbound`:
  - требовать `ctx.binding.threadId` и `thread`;
  - убрать fallback `openConnectorThread`;
  - если thread нет → `pendingConnectionNotice()` (для private) / ignore (для group; `decideInbound` уже игнорирует).
- `connectorMembersOf`:
  - оставить пересечение `thread_agents` ∩ `connector_agents`.
- `decideInbound`:
  - для group с `binding.threadId === null` — `ignore` (как сейчас);
  - для private с `binding.threadId === null` — `reply(NOT_LINKED)`; текст можно заменить на «This chat is not connected to a thread yet.»
  - `pairedUserId` берётся из `thread_participants`; до первого сообщения он null, но private chat и так 1:1.

#### 5.5. `project-connector-events.use-case.ts`

- `routeForRun` уже использует `originConnectorId` + `findBindingForThread`. Оставить.
- Добавить guard: если `findBindingForThread` вернул binding с `threadId !== threadId` — не отправлять (не должно случаться).
- Для group/supergroup — префикс ответа:
  - `agentName = run.agentName` (snapshot);
  - `text = `${agentName}: ${text}`` для первого чанка/финального ответа;
  - для DM (`private`) — без префикса.
- UI-originated runs не имеют `originConnectorId` → не зеркалятся. Это подтверждённое поведение.

### Фаза 6. Lifecycle

#### 6.1. `telegram-connector-actions.use-case.ts`

- `IssuePairCode`, `Pause`, `Resume`, `PatchPolicy`, `Remove` — через `requireConnector` по `connectorId`.
- `Unpair`:
  - `bindings = listBindings(...).filter(b => b.chatType === 'private')`;
  - для каждого `detachBinding`;
  - `syncConnectorAgents`;
  - `status = bindings.some(b => b.chatType !== 'private') ? 'active' : 'awaiting_pair'`;
  - новый pair code/url.
- `Remove`:
  - удалить секрет;
  - `connectors.delete` (cascade);
  - `poller.sync`.
- `clearBindings` для unpair не использовать.

#### 6.2. `delete-agent.use-case.ts`

- `detachFromConnectors`:
  - для каждого коннектора, где есть агент → `removeAgent`;
  - **никогда** не удалять коннектор/секрет.
- Для каждого треда агента:
  - `group`:
    - отменить live runs;
    - если остались члены — переназначить auto-reply на `remaining[0]` или очистить;
    - убрать `thread_agents`;
    - `syncConnectorAgentsForThread`.
  - `group` без членов / `chat`:
    - добавить в `ownThreadIds`;
    - перед удалением — detach всех bindings по этим тредам и `syncConnectorAgents`.
- `threads.deleteMany` только после detach.
- `agents.delete`.

#### 6.3. `delete-thread.use-case.ts`

- Добавить `ConnectorRepositoryPort` и `ThreadAgentRepositoryPort`.
- Перед `threads.delete`:
  ```ts
  for (const binding of connectors.listBindingsByThread(orgId, threadId)) {
    connectors.detachBinding(orgId, binding.id, now);
    syncConnectorAgents({ connectors, threadAgents }, orgId, binding.connectorId);
  }
  ```
- Затем `threads.delete`.
- `deleteByIssue` использует `execute`, поэтому покрыт.

#### 6.4. `add-thread-agent.use-case.ts` / `remove-thread-agent.use-case.ts`

- После `threadAgents.ensure/remove` → `syncConnectorAgentsForThread`.
- `remove-thread-agent` уже запрещает удалять последнего агента и переназначает auto-reply. Оставить.
- `add-thread-agent`:
  - для Telegram-тредов auto-reply должен задаваться явно; не назначать молча. Можно оставить текущее поведение для in-app, но в UI Telegram-визарда всегда передавать явный `autoReplyAgentId`.
  - добавить `assertUniqueMentionNames` для нового состава.

### Фаза 7. Controller

`apps/server/src/app/api/rest/connectors.controller.ts`:

- `@Controller('orgs/:orgId/connectors')`.
- Все методы принимают `connectorId`, кроме `GET` и `POST telegram`.
- `GET` — `@Query(ListConnectorsQuerySchema)`.
- `POST telegram` → create; `PUT :connectorId/telegram` → update.
- Новые методы: `attachChat`, `connectChat`, `disconnectChat`, `createTopic`, `forgetChat`.
- Удалить `addAgent`/`removeAgent` и их use-cases.
- `api.module.ts` уже регистрирует контроллер; проверить DI.

### Фаза 8. Удаление/переименование use-case'ов

- Удалить `add-connector-agent.use-case.ts`, `remove-connector-agent.use-case.ts`.
- Заменить `connect-connector-binding.use-case.ts` → `connect-chat.use-case.ts`.
- Заменить `disconnect-connector-binding.use-case.ts` → `disconnect-chat.use-case.ts`.
- `open-connector-thread.ts` → `create-thread-for-chat.ts` (или оставить как helper).
- Обновить `connector.use-case.module.ts`.

---

## 6. Frontend

### 6.1. API-клиент

- Переместить `apps/webui/src/features/manage-agent/model/connector-api.ts` → `apps/webui/src/features/manage-connectors/model/connector-api.ts`.
- Переписать на org-level:

```ts
orgConnectorsQueryKey(orgId)
orgConnectorsQuery(orgId, opts?)
createTelegramBot(orgId, token)
updateTelegramBot(orgId, connectorId, token)
removeTelegramBot(orgId, connectorId)
issueTelegramPairCode(orgId, connectorId)
pause/resume/unpair/patchPolicy
attachChat(orgId, connectorId, body)
connectChat(orgId, connectorId, bindingId, body)
disconnectChat(orgId, connectorId, bindingId)
createTopic(orgId, connectorId, bindingId, name)
forgetChat(orgId, connectorId, bindingId)
```

- Инвалидация: `['orgs', orgId, 'connectors']`, плюс `threads` при connect/disconnect/create-topic.
- Убрать `agentConnectorsQuery` и все agent-scoped вызовы.

### 6.2. Org-level Telegram UI

Новая папка `apps/webui/src/features/manage-connectors/ui/telegram/`:

| Файл | Содержание |
|---|---|
| `telegram-detail.tsx` | Оркестратор: список ботов + add form + дерево connections |
| `telegram-bot-section.tsx` | Список ботов, кнопка «Add bot» |
| `telegram-bot-card.tsx` | Статус, `@username`, id, pair link, pause/resume/unpair/remove, policy |
| `telegram-add-bot-form.tsx` | Ввод токена → `POST /connectors/telegram` |
| `telegram-connections-tree.tsx` | DM / группы / топики; статус, thread, агенты, auto-reply |
| `telegram-connect-wizard.tsx` | Шаги Where → Conversation → Who answers |
| `telegram-thread-picker.tsx` | Поиск/выбор существующего треда (фильтр по kind) |
| `telegram-agents-picker.tsx` | Multi-select агентов + auto-reply select |
| `telegram-attach-chat.tsx` | Ручное добавление по `chatId`/`@username`, topicId |
| `telegram-create-topic.tsx` | Создание forum topic |
| `telegram-how-it-works.tsx` | Короткая инструкция: bot → chat → thread → agents |
| `telegram-status.ts` | Лейблы/тона статусов |

Ключевые UX-правила:

- Один бот — одна карточка с деревом чатов. Раздела «Agents» нет.
- В строке чата: название, тип, статус, thread title, агенты, auto-reply.
- Connected → «Open thread», «Disconnect».
- Not connected → «Connect».
- Group → «Add to group» (`?startgroup=true`), «Create topic» (если форум).
- DM → «Pair» (pair link), «Connect».
- В визарде для DM список существующих тредов фильтруется по `kind='chat'`; для группы/топика — по `kind='group'`.
- Если выбран `chat`-тред для группы → диалог «Convert to group thread?» → повтор с `allowPromote: true`.
- Если у группы нет топиков — показывать «Enable Topics in Telegram to use separate conversations».
- Никакого polling; инвалидация после мутаций.

### 6.3. `ConnectorDetailPage`

- `AUTH_LABELS['bot-token'] = 'Bot token'`.
- Ветка `telegram` → `<TelegramDetail orgId={orgId} />`.
- `connected` для Telegram = `orgConnectorsQuery` содержит `provider === 'telegram'`.
- Для google/github оставить `integrationsQuery`.

### 6.4. `ConnectorsPane`

- Telegram `available` и рендерится как обычный tile.
- `connected` считать по `orgConnectorsQuery`.
- Опционально badge «N bots».

### 6.5. Настройки агента

- `agent-config-nav.tsx`: категорию `connectors` переименовать в `Telegram` (или `Channels`), иконка `BotIcon`/`CableIcon`.
- `agent-config-category-panes.tsx`: вместо `AgentConnectorsPane` → `AgentTelegramInfo`.
- Новый `agent-telegram-info.tsx`:
  - `orgConnectorsQuery(orgId)`;
  - `routes = items.flatMap(c => c.bindings.filter(b => b.agentIds.includes(agentId)).map(b => ({ bot: c, binding: b })))`;
  - показать:
    - «Used in: Group "Team" / Topic "General" — auto-reply»;
    - «DM @user — mention-only»;
    - ссылку `Settings → Connectors → Telegram`;
    - если пусто — «This agent is not connected to Telegram. An organization admin can connect it in Settings → Connectors → Telegram.»
  - **никаких** токенов, pause/resume, connect/disconnect.
- Удалить/не использовать:
  - `agent-connectors-pane.tsx`;
  - `agent-connector-card.tsx`;
  - `agent-connector-bindings.tsx`;
  - `agent-connector-agent-set.tsx`;
  - `agent-connector-policy.tsx`.
  Полезные куски перенести в `manage-connectors/ui/telegram/`.

### 6.6. Тред

- В заголовке треда бейдж `Telegram · <chat title>` + «Disconnect».
- `useOpenThreadTab(orgId, agentId, threadId)`:
  - для `chat`-треда agentId = единственный член;
  - для `group`-треда — `autoReplyAgentId` или первый член;
  - если агентов нет — кнопку не показывать.
- «Connect to Telegram» на несвязанном треде открывает тот же визард с pre-filled threadId.

---

## 7. Тесты

### 7.1. Восстановить/добавить

- [ ] `upsert-telegram-connector.use-case.spec.ts`:
  - create без агента;
  - второй бот не перезаписывает первый;
  - конфликт по `bot_user_id`;
  - update по `connectorId` не трогает других;
  - update не меняет `status`, если `paused`.
- [ ] spec репозитория коннекторов:
  - `listByOrg`, `findById`, `findByBotUser`;
  - `insertBinding` для group/channel/topic, unique conflict;
  - `listBindingsByThread`;
  - `replaceAgents`.
- [ ] `connect-chat.use-case.spec.ts`:
  - DM + existing `chat`-тред (1 агент) → attach;
  - DM + new `chat`-тред (1 агент) → create;
  - DM + 2 агента → validation error;
  - group + new `group`-тред (N агентов, auto-reply) → create;
  - group + existing `group`-тред → attach;
  - group + existing `chat`-тред без `allowPromote` → promotion required;
  - group + existing `chat`-тред с `allowPromote` → kind = group;
  - один тред нельзя подключить к двум чатам одного бота;
  - разные боты — можно;
  - channel → validation error;
  - bot не админ/privacy on → validation error.
- [ ] `disconnect-chat.use-case.spec.ts`:
  - `thread_id` → null, `status='unpaired'`;
  - тред остаётся;
  - `connector_agents` очищается/пересчитывается.
- [ ] `attach-chat.use-case.spec.ts`:
  - `getChat` → binding с правильным `chatType`/title;
  - дубликат не создаётся;
  - `@username` и numeric id.
- [ ] `create-topic.use-case.spec.ts`:
  - `createForumTopic` → binding с `topicId`;
  - нет прав `can_manage_topics` → validation error.
- [ ] `telegram-update.spec.ts`:
  - `my_chat_member` (added/left);
  - `forum_topic_created`;
  - `message_thread_id` для топиков;
  - `from.is_bot` игнорируется.
- [ ] `apply-telegram-update.use-case.spec.ts`:
  - `chat_member` создаёт unpaired binding и не создаёт тред;
  - `topic_created` создаёт topic binding;
  - unconnected group message не запускает run;
  - unconnected DM отвечает notice.
- [ ] `apply-telegram-actions.spec.ts`:
  - `pairConnector` создаёт DM binding, не тред;
  - `claimBinding` создаёт unpaired binding, не тред;
  - `enqueueInbound` без thread → no run.
- [ ] `resolveResponders` (существующий spec):
  - mention > auto-reply;
  - несколько mentions → все, в порядке;
  - reply-to agent;
  - no mention/no auto-reply → [];
  - duplicate mention names → validation.
- [ ] `sync-connector-agents.spec.ts`:
  - connect добавляет агентов;
  - disconnect удаляет;
  - add/remove thread agent обновляет;
  - delete thread очищает;
  - delete agent очищает.
- [ ] `delete-agent.use-case.spec.ts`:
  - бот выживает после удаления последнего агента;
  - group-тред с остатками живёт, auto-reply переназначен;
  - chat-тред удаляется, binding detached;
  - group-тред без членов удаляется, binding detached.
- [ ] `delete-thread.use-case.spec.ts`:
  - binding detached;
  - `connector_agents` очищен.
- [ ] `unpair`:
  - private detached;
  - group/topic остаются;
  - новый pair code.
- [ ] `connector-view.spec.ts`:
  - binding содержит threadTitle/threadKind/agentIds/autoReplyAgentId;
  - `ConnectorPublic` не содержит `agents`/`threadId`.
- [ ] `org-pack-list.spec.ts` / `wire-org-packs.spec.ts`:
  - telegram **не** добавлен в этой фазе (pack — следующая).
- [ ] UI-тесты (если есть) для `connect-wizard` и read-only agent card.

### 7.2. Команды

```bash
bun run typecheck
bun run lint
bun test
```

Перед релизом: `bun run build:host` (проверка DI/загрузки).

---

## 8. Порядок работ и коммиты

1. `refactor(contracts): org-level connector and chat-thread contracts`
2. `refactor(connectors): make controller and use-cases org-scoped`
3. `feat(connectors): connect chats to existing or new threads`
4. `feat(connectors): discover telegram groups and topics`
5. `feat(connectors): create forum topics from harnesys`
6. `feat(connectors): sync connector agents from thread membership`
7. `feat(connectors): preserve bots on agent deletion and detach threads`
8. `feat(webui): move telegram management to org settings`
9. `refactor(webui): make agent telegram section read-only`
10. `test(connectors): restore and extend telegram coverage`
11. `docs: update group threads model for org-level telegram`

Каждый коммит должен проходить `typecheck`. `lint` и `test` — перед пушем.

---

## 9. Definition of Done

- [ ] В организации можно подключить 2+ ботов, каждый со своим токеном.
- [ ] Второй бот не перезаписывает первого.
- [ ] У бота может быть 0 агентов; в UI нет раздела «Agents».
- [ ] Удаление агента не удаляет бота и его токен.
- [ ] В `Settings → Connectors → Telegram`:
  - [ ] список ботов;
  - [ ] добавление/замена/удаление токена;
  - [ ] pause/resume/unpair;
  - [ ] дерево DM/групп/топиков;
  - [ ] Connect existing/new thread;
  - [ ] выбор агентов и auto-reply;
  - [ ] создание топика;
  - [ ] ручное добавление чата по `chatId`/`@username`;
  - [ ] pair link для DM;
  - [ ] deep links `?startgroup=true` / `?startchannel=true`.
- [ ] DM-чат подключается к `chat`-треду с одним агентом.
- [ ] Группа/топик подключается к `group`-треду с N агентами.
- [ ] Один auto-reply на тред; остальные — mention-only.
- [ ] `@Coder`/`@Genie` и reply-to маршрутизируются.
- [ ] Новый топик создаёт новый binding и (после Connect) новый `group`-тред.
- [ ] Не подключённые группа/топик не создают тред и не запускают агентов.
- [ ] Pairing не создаёт тред.
- [ ] `my_chat_member` и `forum_topic_created` обрабатываются.
- [ ] Бот без admin/privacy не подключается к группе; UI показывает чеклист.
- [ ] Ответ агента уходит в тот чат/топик, откуда пришёл запрос.
- [ ] В группах ответы с префиксом `Coder:`.
- [ ] Удаление треда detached binding.
- [ ] `connector_agents` синхронизирован с `thread_agents`.
- [ ] В настройках агента нет управления коннектором; есть read-only карточка.
- [ ] `bun run typecheck`, `bun run lint`, `bun test` зелёные.
- [ ] `bun.lock` и `apps/webui/vite.config.ts.timestamp-*.mjs` не затронуты без необходимости.

---

## 10. Риски и открытые вопросы

### 10.1. Технические риски

- **`connectorView` + threads**: добавление `ThreadRepositoryPort`/`ThreadAgentRepositoryPort` во все use-case'ы — механическая, но широкая правка. Легко пропустить конструктор → DI-ошибка при boot. Проверять `bun run build:host`.
- **`connector_agents` sync**: если забыть вызвать sync при изменении членства треда, агент перестанет отвечать (safety net в `connectorMembersOf`). Нужны тесты на все call sites.
- **`allowed_updates`**: `my_chat_member` может быть отклонён старым клиентом? Это стандартный update; проверить на реальном боте. `channel_post` не добавляем.
- **`forum_topic_created`**: сервисные сообщения приходят как `message`; парсер должен не падать на пустом `text`.
- **General topic**: в форуме General может приходить без `message_thread_id` или с особым id. Нормализовать: отсутствие `message_thread_id` → `topicId=null` (групповой binding).
- **`createForumTopic`**: требует `can_manage_topics`; проверить через `getChatMember`.
- **`getChat` по `@username`**: работает для публичных групп/каналов; для приватных нужен numeric id. UI должен подсказывать.
- **Удаление тредов**: `connector_bindings.thread_id` не имеет FK. Обязательно detach при удалении тредов, иначе висячие ссылки.
- **`thread_agents` при смене auto-reply**: старый агент остаётся членом (может отвечать на упоминания). Это желаемое поведение.
- **Pack wiring**: в этой фазе pack `telegram` не добавляем; если добавим — обновить `org-pack-list.spec.ts`.
- **Секреты**: `connectorSecretKey` пока `connector_telegram_<id>`. Для будущих коннекторов лучше `connector_<provider>_<id>`, но менять сейчас — риск orphan-секретов. Оставить TODO.
- **Референсная ветка**: не cherry-pick'ать `telegram_bots`/`telegram_chats`/`telegram_topics` и не тащить `connectors.bot_id`. Брать только UI-компоненты и идеи `createForumTopic`/deep links.

### 10.2. Осознанные ограничения релиза

- Один чат на треда на одного бота (нельзя подключить один тред к DM и группе одного бота). Снять позже через `origin_binding_id`.
- Нет backfill истории в Telegram: при Connect старые сообщения треда не отправляются.
- Нет app→TG mirroring: сообщения из UI не уходят в Telegram.
- Нет каналов/publishing/pack.
- Нет alias-ов: mention = `agent.name` / slug.
- Нет параллельных ответов нескольких агентов: one live run per thread.
- Нет автоматического создания групп: только топиков в существующих форумах.
- Пустые топики не обнаруживаются, пока в них нет сообщения; их можно создать из Harnesys.

---

## 11. Вне scope (следующая фаза)

- Каналы и publishing tools (`telegram_list_targets`, `telegram_send_message/photo/document/edit`).
- `channel_post` discovery.
- MTProto user session.
- История Telegram как read-source.
- App→TG mirroring.
- Backfill истории.
- Alias-ы агентов.
- Параллельные ответы нескольких агентов.
- Несколько чатов на одного бота для одного треда.
- Slack/Discord/Reddit/LinkedIn — архитектура готова: новый `provider`, те же `connectors`/`connector_bindings`, отдельный pack.

---

## 12. Краткая карта изменений

### Server

```
packages/contracts/src/connector.ts                       binding thread summary, ConnectChatBody,
                                                          AttachChatBody, CreateTopicBody; remove agents/threadId
packages/contracts/src/integrations.ts                    telegram -> available, bot-token
apps/server/src/app/api/rest/connectors.controller.ts     org-level routes, chats/connect/topics
apps/server/src/app/application/connectors/
  connector-view.ts                                       require by connectorId, binding thread summary
  connector.helpers.ts                                    toBindingPublic(+thread, agentIds)
  list-connectors.use-case.ts                             org list + filters
  upsert-telegram-connector.use-case.ts                   create/update by connectorId
  telegram-connector-actions.use-case.ts                  connectorId, unpair=private only
  connect-chat.use-case.ts                                NEW (existing/new thread)
  disconnect-chat.use-case.ts                             NEW
  attach-chat.use-case.ts                                 NEW (getChat)
  create-topic.use-case.ts                                NEW (createForumTopic)
  sync-connector-agents.ts                                NEW
  mention-names.ts                                        NEW
  thread-kind.ts                                          NEW
  open-connector-thread.ts                                DELETE/REPLACE with create-thread-for-chat
  apply-telegram-update.use-case.ts                       my_chat_member/topic_created discovery
  apply-telegram-actions.ts                               pair/claim no thread; enqueue requires thread
  project-connector-events.use-case.ts                    group prefix, origin routing
  connector.use-case.module.ts                            register new use-cases, remove agents
apps/server/src/app/application/agents/delete-agent.use-case.ts  keep bot, detach, sync
apps/server/src/app/application/threads/
  add-thread-agent.use-case.ts                            sync connector_agents
  remove-thread-agent.use-case.ts                         sync connector_agents
  delete-thread.use-case.ts                               detach bindings + sync
apps/server/src/app/domain/connector/
  telegram-update.ts                                      chat_member, topic_created, is_bot
  telegram-api.port.ts                                    getChat, createForumTopic, canManageTopics
  connector-repository.port.ts                            listBindingsByThread, replaceAgents
apps/server/src/app/infra/connector/
  telegram-api.adapter.ts                                 getChat, createForumTopic, my_chat_member
  connector-repository.bindings.ts                        listBindingsByThread, replaceAgents
```

### WebUI

```
apps/webui/src/features/manage-connectors/
  connector-detail-page.tsx                               telegram branch
  connectors-pane.tsx                                     telegram connected state
  model/connector-api.ts                                  NEW org-level client
  ui/telegram/                                            NEW org-level UI
apps/webui/src/features/manage-agent/
  model/connector-api.ts                                  DELETE (move)
  ui/agent-config-nav.tsx                                 relabel category
  ui/agent-config-category-panes.tsx                      read-only info
  ui/agent-telegram-info.tsx                              NEW
  ui/agent-connector-*.tsx                                DELETE (after moving useful parts)
```
