# 42. Страницы и виджеты WebUI

## Назначение

Документирует отображение маршрутов на страницы (`src/pages/`), назначение виджетов (`src/widgets/`), ключевые фичи (`src/features/`) и вызовы API из каждого виджета/фичи. Все URL и поля формируются бэкендом; фронтенд не содержит слоёв адаптеров (AGENTS.md).

## Страницы (`src/pages/`) и маршруты (`app/routes.tsx`)

Фактические данные из кода: 5 подпапок (`desk`, `inbox`, `onboarding`, `project`, `settings`) + 4 верхнеуровневых файла (`sign-in.tsx`, `sign-up.tsx`, `accept-invite.tsx`, `scroll-probe.tsx`), всего 15 `.tsx`. Маршруты описываются в `apps/webui/src/app/routes.tsx` (167 строк).

| Маршрут | Страница | Назначение | Источник |
|---------|----------|------------|----------|
| `/` | `RootGate` (`AppFrame`) | гейт: организация → редирект на стол или `/worker` | `routes.tsx:97-108`, `RootGate` |
| `/login` | `sign-in.tsx` | `getAccess()` → `/`, иначе панель входа | `routes.tsx:111`, `pages/sign-in.tsx:4` |
| `/signup` | `sign-up.tsx` | `sessionOwnerStatus()`: initialized → `/login`, иначе регистрация | `routes.tsx:111`, `pages/sign-up.tsx:4` |
| `/accept` | `accept-invite.tsx` | принятие приглашения в организацию | `routes.tsx:113`, `pages/accept-invite.tsx` |
| `/worker` | `WorkerRelayPage` (`relay-link`) | релей для рабочей организации | `routes.tsx:114`, `features/relay-link` |
| `/onboarding` | редирект на `choose` | — | `routes.tsx:115` |
| `/onboarding/choose` | `onboarding/choose-page.tsx` | выбор: создать организацию / присоединиться | `routes.tsx:116`, `pages/onboarding/choose-page.tsx` |
| `/onboarding/create` | `onboarding/create-page.tsx` | `upsertOrg` → `activateOrg` → провайдеры | `routes.tsx:117`, `pages/onboarding/create-page.tsx` |
| `/onboarding/provider/:orgId` | `onboarding/provider-page.tsx` | каталог провайдеров, `createProvider` | `routes.tsx:118`, `pages/onboarding/provider-page.tsx` |
| `/onboarding/models/:orgId` | `onboarding/models-page.tsx` | `listProviders` → `discoverProviderModels` → `attachProviderModel` | `routes.tsx:119`, `pages/onboarding/models-page.tsx` |
| `/onboarding/presets/:orgId` | `onboarding/presets-page.tsx` | `activateOrg` → стол | `routes.tsx:120`, `pages/onboarding/presets-page.tsx` |
| `/onboarding/join` | `onboarding/join-page.tsx` | worker → `/worker`, иначе стол | `routes.tsx:121`, `pages/onboarding/join-page.tsx` |
| `/o/:orgId/` | `desk/desk-page.tsx` | панель стола организации | `routes.tsx:123-124`, `pages/desk/desk-page.tsx` |
| `/o/:orgId/settings` | редирект на `settings/appearance` | — | `routes.tsx:130`, `SettingsIndexRedirect` |
| `/o/:orgId/settings/:category` | `settings/settings-page.tsx` | настройки организации (по умолчанию `appearance`) | `routes.tsx:131`, `pages/settings/settings-page.tsx` |
| `/o/:orgId/settings/connectors/:connectorId` | `ConnectorDetailPage` (`manage-connectors`) | деталь соединителя интеграции | `routes.tsx:132`, `features/manage-connectors/connector-detail-page.tsx` |
| `/o/:orgId/inbox` | `inbox/ui/inbox-page.tsx` | страница входящих | `routes.tsx:133`, `pages/inbox/ui/inbox-page.tsx` |
| `/o/:orgId/` (+ фокус) | `project/ui/project-page.tsx` (IDE-макет) | сайдбар + редактор + расшифровка + композитор + док | `routes.tsx:134-160`, `pages/project/ui/project-page.tsx` |
| `/o/:orgId/thread/:threadId` | `project-page` | тред на уровне организации | `routes.tsx:138`, `studioPath.thread` |
| `/o/:orgId/:projectId/thread/:threadId` | `project-page` | тред уровня проекта | `routes.tsx:149` |
| `/o/:orgId/:projectId/file/*` | `project-page` | просмотр файла | `routes.tsx:150` |
| `/o/:orgId/:projectId/diff/*` | `project-page` | diff файла | `routes.tsx:151` |
| `/o/:orgId/:projectId/schedule/:scheduleId` | `project-page` | расписание | `routes.tsx:152` |
| `/o/:orgId/:projectId/webhook/:webhookId` | `project-page` | вебхук | `routes.tsx:153` |
| `/o/:orgId/:projectId/spawn/:threadId/:spawnId` | `project-page` | spawn | `routes.tsx:154` |
| `/o/:orgId/:projectId/terminal/:sessionId` | `project-page` | терминал | `routes.tsx:155` |
| `/o/:orgId/:projectId/attachment/:issueId/:attachmentId` | `project-page` | вложение | `routes.tsx:156` |
| `/o/:orgId/board/:boardId` | `project-page` | доска | `routes.tsx:139`, `studioPath.board` |
| `/o/:orgId/schedule/:scheduleId` | `project-page` | расписание (орг-уровень) | `routes.tsx:141` |
| `/o/:orgId/webhook/:webhookId` | `project-page` | вебхук (орг-уровень) | `routes.tsx:142` |
| `/o/:orgId/spawn/:threadId/:spawnId` | `project-page` | spawn (орг-уровень) | `routes.tsx:143` |
| `/o/:orgId/terminal/:sessionId` | `project-page` | терминал (орг-уровень) | `routes.tsx:144` |
| `/o/:orgId/attachment/:issueId/:attachmentId` | `project-page` | вложение (орг-уровень) | `routes.tsx:140` |
| `/scroll-probe` | `scroll-probe.tsx` | зонд прокрутки | `routes.tsx:163`, `pages/scroll-probe.tsx` |
| `*` | редирект на `/` | — | `routes.tsx:164` |

Фокус окна определяется `useStudioLocation()` (`shared/config/location.ts`) и преобразуется в `StudioFocus` (`shared/config/routes.ts:19`): `none` / `settings` / `thread` / `file` / `diff` / `schedule` / `webhook` / `spawn` / `terminal` / `board` / `attachment`. Пути формируются хелпером `studioPath` (`routes.ts:32`).

## Виджеты (`src/widgets/`)

18 подпапок. Фактические данные из кода:

| Виджет | Назначение | API, которое вызывает |
|--------|------------|-----------------------|
| `chat-transcript/` | расшифровка потока событий ran, ходы выполнения, инструменты, компакт-разделители, авто-прочтение, счётчик unseen | `features/send-message` (`respondToRun`, `rejectRun`, `retryRun`), `threads.ts` (события потока через SSE) |
| `chat-composer/` | отправка сообщений, вложения, модели, режимы, навыки, голос, слэш-команды | `uploadThreadAttachment` (`thread-files.ts`), `sendMessage` (`features/send-message`) |
| `project-sidebar/` | дерево файлов, ветки, задачи, агенты, автоматизации, терминал, вебхуки | `projects.ts`, `threads.ts`, `agents.ts`, `automations.ts`, `terminals.ts`, `webhooks.ts` |
| `agent-inspector/` | модель, память, навыки, MCP, план, сырые запросы агента | `agents.ts`, `memory.ts`, `skills.ts`, `mcp.ts`, `raw-model-requests.ts` |
| `file-pane/` | панель файлов: редактор Monaco, превью markdown/DXF/медиа, LSP-мост | `thread-files.ts` (`loadThreadFileContent`), `lsp-bridge` |
| `ide-content/` | поверхность автоматизации, превью документа, вкладки потоков | `issues.ts`, `thread-files.ts` |
| `ide-home/` | выбор агента, выбор доски на домашней странице IDE | `agents.ts`, `issues.ts` |
| `terminal-pane/` | интерактивный терминал (xterm.js) | `node-tickets.ts` (`requestNodeTicket`), чистый WebSocket `/api/terminals/:sessionId` (не SSE) |
| `thread-dock/` | дока потока: расписание, вебхуки, fallback тред+агент, строка статуса | `schedules.ts`, `webhooks.ts`, `threads.ts` |
| `thread-journal/` | журнал потока с разделителями запусков | `threads.ts` (события ran) |
| `thread-run-status/` | строка статуса выполнения, баннер повтора | `threads.ts` (`retryRun`), `features/send-message` (`hitl-actions.ts`) |
| `agent-card/` | карточка агента | зависит от контекста страницы |
| `file-inspector/` | инспектор файла | зависит от контекста страницы |
| `folder-browser/` | браузер папок | зависит от контекста страницы |
| `ide-tabs/` | вкладки IDE | зависит от контекста страницы |
| `inbox-bell/` | колокол входящих | зависит от контекста страницы |
| `settings-nav/` | навигация настроек | зависит от контекста страницы |
| `sidebar/` | общая боковая панель | зависит от контекста страницы |

## Фичи (`src/features/`, 56 директорий)

Фактические подпапки из кода (в алфавитном порядке): `app-update`, `appearance`, `attach-git`, `attach-source`, `compact-thread`, `create-group-thread`, `create-project`, `desk`, `eula`, `git-branch`, `git-commit`, `ide`, `lsp-bridge`, `manage-account`, `manage-agent-memory`, `manage-agent`, `manage-audit`, `manage-automations`, `manage-chat-settings`, `manage-connectors`, `manage-editor-settings`, `manage-fleet`, `manage-inbox`, `manage-issues`, `manage-knowledge-index`, `manage-knowledge-roots`, `manage-members`, `manage-model`, `manage-notification-settings`, `manage-org-browser`, `manage-org-general`, `manage-org-lsp`, `manage-org-mcp`, `manage-org-mode-presets`, `manage-org-packages`, `manage-org-plugins`, `manage-org-skills`, `manage-org-toolchain`, `manage-plugins`, `manage-project-mcp`, `manage-project-settings`, `manage-project-skills`, `manage-schedule`, `manage-thread-members`, `manage-usage`, `manage-vault`, `manage-webhook`, `message-queue`, `move-project-files`, `onboarding`, `open-file`, `preset-marketplace`, `relay-link`, `send-message`, `switch-org`, `switch-thread`.

Ключевые фичи:

| Фича | Назначение |
|------|------------|
| `manage-agent` | настройка агента: граф (@xyflow, `toFlow`/`fromFlow`), хуки, навыки, память, источники, разрешения, правила, режимные пресеты |
| `manage-issues` | задачи и доски kanban; `issue-drawer.store.ts`, `issue-view.store.ts` |
| `manage-connectors` | соединители интеграций (Telegram, GitHub, Google), `connectors-pane.tsx`, `connector-detail-page.tsx`, деталь соединителя |
| `manage-fleet` | парк узлов |
| `manage-knowledge-index` / `manage-knowledge-roots` | индекс знаний |
| `manage-members` | участники организации |
| `manage-model` | модели и провайдеры |
| `manage-plugins` | плагины |
| `manage-project-settings` | настройки проекта: источники, Git, MCP, память, модели, плагины, инструменты |
| `manage-schedule` | расписания |
| `manage-usage` | использование и бюджет |
| `manage-vault` | секреты |
| `manage-webhook` | вебхуки |
| `send-message` | отправка сообщений, HITL (`hitl-actions.ts`: `respondToRun`/`rejectRun`/`retryRun`), повтор, фаза ran (`run-phase.ts`: idle/live/queued/parked) |
| `onboarding` | шаги choose → provider → models → presets → вход в организацию |
| `preset-marketplace` | маркетплейс пресетов |
| `switch-org` / `switch-thread` | переключение организации / потока (`org-context` store) |
| `desk` | состояние стола: активная вкладка инспектора, открытые файлы (`desk.store.ts`) |
| `relay-link` | релей рабочей организации (`WorkerRelayPage`) |
| `app-update`, `appearance`, `eula`, `lsp-bridge`, `compact-thread`, `create-group-thread`, `create-project`, `git-branch`, `git-commit`, `ide`, `attach-git`, `attach-source`, `message-queue`, `move-project-files` | поддерживающие фичи |

## Диаграмма: страницы → виджеты → фичи → API → сервер

```mermaid
graph TD
    Pages[pages: sign-in, sign-up, accept-invite, onboarding/*, desk, inbox, project, settings, scroll-probe]
    Widgets[widgets: chat-transcript, chat-composer, project-sidebar, agent-inspector, file-pane, terminal-pane, thread-dock, thread-run-status и др. (18)]
    Features[features: manage-agent, manage-issues, manage-connectors, send-message, onboarding, desk и др. (56)]
    API[shared/api: client.ts, session.ts, sse.ts, threads.ts, agents.ts, terminals.ts, integrations.ts и др. (69 модулей)]
    Server[Hono API :47474 — REST + SSE + WebSocket]

    Pages --> Widgets
    Pages --> Features
    Widgets --> API
    Features --> API
    API -->|HTTP JSON / SSE / WebSocket| Server
```

## Связанные разделы

- [41-frontend-архитектура-webui.md](./41-frontend-архитектура-webui.md)
- [43-frontend-state-management.md](./43-frontend-state-management.md)
- [44-frontend-api-клиент.md](./44-frontend-api-клиент.md)
- [61-webui-архитектура-страницы-виджеты.md](./61-webui-архитектура-страницы-виджеты.md)
- [62-webui-состояние-api-sse.md](./62-webui-состояние-api-sse.md)
- [63-интеграции-telegram-github-google.md](./63-интеграции-telegram-github-google.md)
