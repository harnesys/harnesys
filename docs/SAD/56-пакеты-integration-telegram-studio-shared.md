# 56. Пакеты integration-telegram и studio-shared

## 56.1 packages/integration-telegram

Аддон интеграции Telegram, версия 0.1.0 — `packages/integration-telegram/package.json`. Владеет собственной SQLite базой: `orgDataDir(orgId)/integrations/<id>/data.db`, DDL пишет сама интеграция. В ядре нет таблиц под данные интеграций — `packages/integration-telegram/src/db/schema.ts`, AGENTS.md (integration-addon model).

### Файлы

| Файл | Назначение |
|------|------------|
| `src/telegram-integration.ts` | основной модуль интеграции (`defineIntegration`, `telegramIntegration`) |
| `src/index.ts` | экспорты пакета (`export { telegramIntegration }`) |
| `src/routes.ts` | HTTP-маршруты интеграции (`createRoutes`) |
| `src/services.ts` | сервисы: `saveRule`, `deleteRule`, `queryPosts`, `resolveThreadId` |
| `src/publish.ts` | публикация/синхронизация автоматизаций: `syncAutomations`, `readerState`, `isReaderConnected` |
| `src/readers.ts` | чтение/управление читателями: `createReader`, `authorizeReader`, `removeReader`, `purgeInterruptedReaders`, `finishLogin` |
| `src/sources.ts` | источники: `addSource`, `refreshSource`, `removeSource`, `backfillSource` |
| `src/workers.ts` | фоновые работники: `startReaderWorker`, `stopReaderWorker`, `stopAllReaderWorkers`, `runReader` |
| `src/telegram/client.ts` | клиент Telegram API (teleproto): `openClient`, `loginClient`, `ClientHandle`, `TeleprotoHandle` |
| `src/telegram/runtime.ts` | рантайм Telegram: `getHandle`, `startLogin`, `dropHandle`, `joinInvite`, `credentialsOf`, `cachedHandle` |
| `src/auth/login-sessions.ts` | сессии входа: `LoginSessions` (с тестом) |
| `src/db/schema.ts` | схема своей SQLite БД интеграции (`TELEGRAM_SCHEMA_SQL`) |
| `src/db/store.ts` | ре-экспорт хранилища (posts, readers, rules, sources) |
| `src/db/posts.ts`, `src/db/readers.ts`, `src/db/rules.ts`, `src/db/sources.ts`, `src/db/rows.ts` | таблицы БД: посты, читатели, правила, источники, строки |
| `src/feed/filter.ts` | фильтрация ленты (с тестом) |
| `src/feed/ingest.ts` | приём ленты: `createIngestor`, `applyRules`, `fireRule` |
| `src/feed/normalize.ts` | нормализация: `normalizePost`, `NormalizedPost` |
| `src/feed/text.ts`, `src/feed/text.spec.ts` | обработка текста: `fireId`, `postUrl`, `taskText` |
| `src/model/errors.ts`, `src/model/records.ts` (с `records.spec.ts`), `src/model/schemas.ts` | модели: ошибки, записи, схемы |

Структура каталога: `packages/integration-telegram/src/` — `auth/`, `db/`, `feed/`, `model/`, `telegram/`, корневые файлы выше.

### ДDL своей SQLite БД (`db/schema.ts`)

Таблицы:
- `readers` (id, label, status anonymous\|awaiting_code\|awaiting_password\|authorized\|error, api_id, phone_masked, dc_id, last_error, last_seen_at, created_at, updated_at)
- `sources` (id, reader_id FK, peer_kind channel\|group\|supergroup, peer_id, access_hash, username, title, joined, watch_topics, last_post_id, last_error, created_at, updated_at) + уникальный индекс (reader_id, peer_id)
- `rules` (id, name, status active\|paused\|failed, agent_id, thread_id, mode_id, detail, filter_json, history none\|last, history_last, max_runs_per_day, throttle_sec, runs_date, runs_today, last_fired_at, created_at, updated_at)
- `rule_sources` (rule_id FK, source_id FK, primary key)
- `posts` (id, source_id FK, post_id, topic_id, author_title, text, media_json, published_at, received_at, outcome new\|filtered\|fired\|throttled\|over_limit\|error, fire_count) + уникальный индекс (source_id, post_id), индекс received_at DESC
- `fires` (fire_id, rule_id FK, post_id, created_at) + индекс (rule_id, created_at)

Константы: `POST_KEEP_PER_SOURCE = 500`, `POST_MAX_AGE_DAYS = 30`, `LOGIN_TTL_MS = 600000`, `TEXT_LIMIT = 4000`, `PRUNE_INTERVAL_MS = 3600000`, `FIRE_KEEP_PER_RULE = 200`, `RESTART_BACKOFF_MS = 30000`.

### Поток работы

1. Пользователь подключает бота/аккаунт Telegram на странице интеграции (WebUI `integrations/telegram/`).
2. Учётные данные сохраняются в own SQLite БД интеграции (`db/schema.ts`, `db/store.ts`). Сессия логина в памяти (`LoginSessions`), TTL 10 минут.
3. Фоновый работник (`workers.ts`, `runReader`) открывает клиент Telegram (`telegram/client.ts`, `openClient`), подписывается на `NewMessage` события (`onPost`), rejoint необращённые источники, каждые 30с тик, каждые 60с прonyaтие старых постов (`prunePosts`).
4. Лента проходит через `feed/ingest.ts` (`onPost` → `insertPost` → `applyRules`) → `feed/filter.ts` (`matchesFilter`, ключевые слова any/all/exclude) → `feed/normalize.ts` (`normalizePost`).
5. Посты сохраняются в `db/posts.ts`, читатели в `db/readers.ts`.
6. Публикация: `ingest.ts` `fireRule` → `ctx.runs.dispatch({threadId, agentId, text, modeId, fireId})` — запуск раннего через рантайм сервера. Дедупликация через таблицу `fires` (`claimFire`/`releaseFire`).
7. Лимиты правила: `max_runs_per_day` (over_limit), `throttle_sec` (throttled).
8. Серверная сторона: `apps/server/src/app/infra/connector/` (telegram-api.adapter, telegram-poller, connector-repository) + `apps/server/src/app/domain/connector/` (inbound-decision, lease, pair-code, thread-kind, thread-stats).

### Диаграмма: own SQLite + feed + publish

```mermaid
flowchart TD
    subgraph UI["WebUI integrations/telegram"]
        U1[подключить бота/аккаунт]
        U2[добавить источник (чат/канал/топик)]
        U3[создать правило (feed → agent + thread)]
    end
    subgraph IT["packages/integration-telegram (own SQLite data.db)"]
        I1[routes: /reader, /sources, /rules, /posts]
        I2[readers: createReader/authorizeReader/removeReader]
        I3[sources: addSource/refreshSource/backfillSource]
        I4[rules: saveRule/deleteRule]
        I5[workers: runReader тик 30с]
        I6[telegram/client.ts: teleproto NewMessage onPost]
        I7[feed/ingest: insertPost → applyRules → fireRule]
        I8[feed/normalize + feed/filter]
        I9[publish: syncAutomations → ctx.automations.publish]
        DB[(SQLite: readers, sources, rules, posts, fires)]
    end
    subgraph Server["apps/server (connector + runtime)"]
        S1[ctx.runs.dispatch → run-claimer → run-engine]
        S2[startGraph → agent обрабатывает пост]
    end

    U1 --> I2
    U2 --> I3
    U3 --> I4
    I1 --> I2
    I1 --> I3
    I1 --> I4
    I2 --> DB
    I3 --> DB
    I4 --> DB
    I5 --> I6
    I6 --> I7
    I7 --> I8
    I8 --> DB
    I7 -->|claimFire + dispatch| S1
    S1 --> S2
    I9 --> I4
```

## 56.2 packages/studio-shared

Общие типы и утилиты для веб-студии, версия 0.0.1 — `packages/studio-shared/package.json`. Точка входа: `types.ts` re-exports из `src/` и `@harnesys/contracts`, `harnesys`.

| Файл | Назначение |
|------|------------|
| `agent.ts` | `AgentRecord`, `AgentGraph`, `AgentBudget`, `AgentGraphLayout` |
| `capabilities.ts` | `AgentCapabilityRegistryEntry`, `AgentCapabilitiesView` |
| `catalog.ts` | `CatalogDriver`, `StudioCatalog`, `StudioModel`, `StudioModelView`, `DriverEndpoint`, `EFFORTS`, `MODALITIES`, `MODEL_FEATURES`, `ModelPricing`, `ModelArchitecture` |
| `desk-events.ts` | `DeskEvent` (thread/schedule/plan/webhook/agent/issue/issue-board/terminal/run-finish), `ThreadAttachment`, `HumanEntry` |
| `window-desk.ts` | `WindowDesk`, `PersistedIdeWorkspace`, `PersistedIdeTab`, `IdeTabKind`, `WindowBootstrap` |
| `discovery.ts` | `DiscoveryHostInfo`, `DiscoveredHost`, `ScanRequest`, `ScanResult` |
| `events-watch.ts` | SSE-фреймы: `EventsWatchDeskFrame`, `EventsWatchApprovalFrame`, `EventsWatchThreadEventsFrame`, `EventsWatchConnectorFrame`, `EventsWatchAutomationsFrame`, `SSE_KEEP_ALIVE_MS` (4000), `SSE_STALL_TIMEOUT_MS` |
| `git.ts` | `GitFileStatus`, `GitFileStatusMap`, `GitSourceSummary`, `GitStatusResponse`, `GitDiffResponse` |
| `harnesys-bridge.ts` | мост к серверу Harnesys: ре-экспорт типов `harnesys` (`AgentContextSettings`, `AgentGenerationSettings`, `AgentPaths`, `PortRef`, `SessionEvent`, `ToolOutputSettings`) и функций `harnesys/domain` (`filterGenerationSettings`, `programOf`, `segmentCommand`, `THRESHOLD_SUMMARY_NAME`, `withChatGenerationParameters`); `AgentProjectPaths`, `ToolPermission = PermissionGate` |
| `hitl-payload.ts` | `HitlPayload` = `ConfirmPayload` \| `AskPayload` \| `PermissionPayload`; `payloadForSource(source, input)` |
| `issue-prompt.ts`, `issue.ts` | `IssueRecord`, `IssueBoardRecord`, `IssueCommentRecord`, `IssueLabelRecord`, `IssueAttachmentRecord`, `issueTaskText` / `issueTaskAttrs` / `visibleIssueText` / `isIssueHumanText` |
| `knowledge.ts` | `KnowledgeRootRecord`, `KnowledgeSettings`, `KnowledgeFileRecord`, `KnowledgeIndexState`, `KnowledgeStats`, `MemorySearchBackend` (fts\|vector) |
| `modes.ts` | `AgentMode`, `ModePreset`, `MODE_OPS`, `ModeOpGate`, `ModeOpPermissions`, `DEFAULT_MODE_ID`, `DEFAULT_MODE`, `ASK_MODE`, `PLAN_PACK_ID`, `resolveModeId`, `effectiveMode`, `modeFromPreset` |
| `org-machine.ts`, `org-types.ts` | `MachineOrgEntry`, `OrgMachineFile`, `OrgNodeIdentity`; `OrgRecord`, `NodeRecord`, `ProjectRegistryRecord`, `AssignmentRecord`, `AgentOrgRecord`, `OrgEventType`, `OrgEventRecord`, `ApprovalOption/Kind/Status/Surface`, `UsageRecord`, `ScheduleProjectionRecord` |
| `plan-types.ts` | `PlanItemRecord`, `ThreadPlanRecord`, `SavePlanItemInput`, `SavePlanRequest`, `UpdatePlanItemRequest` (ре-экспорт `PlanItemStatus`, `PlanStatus`, `SubagentRole` из `harnesys/domain`) |
| `plugin.ts` | `PluginRecord`, `PluginSummary`, `PluginComponentSummary`, `PluginMutationResponse`, `InstallPluginRequest`, `SetPluginGrantsRequest`, `ApprovePluginServerRequest`, `SetPluginOptionRequest`, `PluginRegistryKind`, `PluginRegistrySummary`, `AddPluginRegistryRequest`, `CatalogInstallSource`, `PluginCatalogEntry`, `RemovePluginRequest` |
| `project-config.ts` | `ProjectSkill`, `CreateProjectSkillRequest`, `ProjectMcpServer`, `ProjectMcpConfigServer`, `UpsertProjectMcpServerRequest` |
| `project-files.ts` | `ProjectFileEventKind`, `ProjectFileEvent`, `ProjectMoveItem`, `ProjectMoveResult` |
| `project-types.ts` | `ProjectStatus`, `StudioErrorBody`, `ProjectFileEntry`, `ProjectLspEntry`, `ProjectLspListResponse` |
| `provider.ts` | `ProviderRecord`, `ProviderPublic`, `ProviderModelPublic`, `ProviderExportBundle`, `ImportProvidersRequest/Summary` |
| `schedule-prompt.ts`, `schedule.ts` | `ScheduleRecord`, `WebhookRecord`, `CreateScheduleResponse`, `CreateWebhookResponse`, `scheduledTaskText` / `scheduledTaskName` / `visibleScheduledText` / `isScheduledHumanText` |
| `semver.ts` | `parseVersion`, `isNewerVersion` |
| `terminal.ts` | `TerminalSessionRecord`, `TerminalWatchEvent`, `TerminalSessionOrigin` (user\|agent) |
| `text-attachment.ts` | `isTextAttachment(mediaType, name)` |
| `thread.ts` | `ThreadRecord`, `ThreadActiveRun`, `ThreadSummary`, `AcceptedRunResponse`, `CompactThreadResponse`, `ThreadKind`, `ThreadPolicy`, `threadsForAgent`, `primaryAgentIdOf` |
| `transcript.ts` | `TranscriptItem`, `toTranscript(events)` |
| `webhook-prompt.ts` | `WEBHOOK_HUMAN_ORIGIN`, `webhookTaskText` |
| `agent-runtime-defaults.ts` | `defaultAgentCompaction()` → `PortRef {name: 'threshold-summary', spec: {thresholdRatio: 0.8, protectRecentRatio: 0.1, auto: true}}` |

### harnesys-bridge.ts — мост к серверу

Мост между фронтендом и сервером, используется для типизированного обмена данными (`packages/studio-shared/src/harnesys-bridge.ts`). Ре-экспортирует типы и функции из `harnesys` и `harnesys/domain` для использования в WebUI без прямой зависимости от реализации сервера.

## 56.3 Модель интеграций (соответствие AGENTS.md)

Интеграции — аддоны. Каждая интеграция владеет отдельным файлом SQLite: `orgDataDir(orgId)/integrations/<id>/data.db`, DDL пишет сама интеграция. В ядре нет таблиц под данные интеграций, нет `if (provider === 'x')` в ядре. Единственные ссылки ядра на интеграцию — два реестра:
- `apps/server/src/app/infra/integrations/installed-integrations.ts`
- `apps/webui/src/integrations/registry.ts`

Установка интеграции = добавление в оба реестра. Деинсталляция = удаление из обоих реестров + удаление каталога данных интеграции (`integrations/<id>/`).

### WebUI интеграции Telegram

`apps/webui/src/integrations/telegram/`:
- `api.ts`, `index.ts`, `model/telegram-feed-dialog.ts`, `model/telegram-feed-draft.ts`, `model/telegram-queries.ts`, `model/types.ts`
- `ui/telegram-add-bot-form.tsx`, `ui/telegram-agents-picker.tsx`, `ui/telegram-bot-card.tsx`, `ui/telegram-bot-policy.tsx`, `ui/telegram-bot-section.tsx`, `ui/telegram-chat-row.tsx`, `ui/telegram-connect-panel.tsx`, `ui/telegram-create-topic.tsx`, `ui/telegram-detail.tsx`, `ui/telegram-discovery.tsx`, `ui/telegram-identity-card.tsx`, `ui/telegram-pair-section.tsx`, `ui/telegram-register-chat.tsx`, `ui/telegram-setup-steps.tsx`, `ui/telegram-status.ts`, `ui/telegram-thread-badge.tsx`, `ui/telegram-thread-picker.tsx`
- `ui/telegram-account-settings.tsx`, `ui/telegram-feed-config-dialog.tsx`, `ui/telegram-feed-keywords-field.tsx`, `ui/telegram-feed-limits-fields.tsx`, `ui/telegram-feed-sources-field.tsx`, `ui/telegram-feed-thread-field.tsx`, `ui/telegram-posts-panel.tsx`, `ui/telegram-reader-card.tsx`, `ui/telegram-sources-card.tsx`, `ui/telegram-terms-field.tsx`

## Связанные разделы

- [22-интеграции-общая-модель.md](./22-интеграции-общая-модель.md)
- [23-интеграция-telegram.md](./23-интеграция-telegram.md)
- [03-архитектурный-обзор.md](./03-архитектурный-обзор.md)
- [docs/INTEGRATION_ADDON_MODEL.md](../INTEGRATION_ADDON_MODEL.md)
- [docs/connector-identity-link-plan.md](../connector-identity-link-plan.md)
