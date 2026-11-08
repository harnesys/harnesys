# 41. Архитектура WebUI (apps/webui)

## Назначение

`apps/webui` — клиентская часть Harnesys на React 19. Единая точка входа `main.tsx` рендерит `<Providers><AppRouter /></Providers>` (`apps/webui/src/main.tsx:10`). Маршрутизация через `react-router` v8 (`createBrowserRouter`, `apps/webui/src/app/router.tsx`, описание маршрутов `apps/webui/src/app/routes.tsx`).

Все видимые пользователю строки и комментарии кода в `apps/webui` — на английском (требование AGENTS.md, раздел "Stack"). Сами файлы SAD пишутся по-русски.

## Стек

| Компонент | Технология | Версия / источник |
|-----------|------------|-------------------|
| Сборщик | Vite 8 + `@rolldown/plugin-babel` | `apps/webui/vite.config.ts:2,57`, `package.json` `vite ^8.2.1` |
| Фреймворк | React 19 + React Compiler | `package.json` `react ^19.2.8`, `babel-plugin-react-compiler ^1.0.0` через `reactCompilerPreset()` (`vite.config.ts:57`) |
| UI kit | shadcn `base-nova` | `apps/webui/components.json`, пакеты `shadcn` + `@shadcn/react` (`@shadcn/react ^0.3.0`) |
| Стили | Tailwind 4 | `apps/webui/vite.config.ts:58`, `@tailwindcss/vite ^4.3.3`, `tailwindcss ^4.3.3` |
| Маршрутизация | react-router | `react-router ^8.4.0` |
| Типизация | TypeScript | `apps/webui/tsconfig.app.json`, `typescript ^5.9.3` |
| Состояние | Zustand | `zustand ^5.0.15`, хранилища `entities/*/model/*.store.ts`, `features/*/model/*.store.ts` |
| HTTP кэш-запросы | TanStack Query | `@tanstack/react-query ^5.90.2` (`QueryProvider` в `app/providers.tsx`) |
| HTTP клиент | fetch-обёртка `apiJson` / `authenticatedFetch` | `apps/webui/src/shared/api/client.ts`, `session.ts` |
| Поток событий | SSE (`watchEventSource`, `readSse`), WebSocket терминала | `apps/webui/src/shared/api/sse.ts`, `terminal-pane` |
| Редактор кода | Monaco + LSP-мост | `@monaco-editor/react`, `monaco-editor 0.52.2` |
| Диаграммы | Mermaid | `mermaid ^11.17.0` |

## React Compiler

Компоненты мемоизируются компилятором автоматически. Ручные `useMemo` / `useCallback` "для perf" не добавляются. Исключения только там, где внешний API требует стабильной ссылки извне React (сторонняя подписка, imperative handle), видимая из контракта (AGENTS.md, раздел "Stack").

## Структура исходников (`src/`)

| Директория | Назначение | Состав (фактически из кода) |
|------------|------------|-----------------------------|
| `main.tsx` | точка входа React | `createRoot(root).render(<Providers><AppRouter /></Providers>)` |
| `app/` | роутер, провайдеры, гейты сессии/EULA | `router.tsx`, `routes.tsx`, `providers.tsx`, `session-gate.tsx`, `eula-gate.tsx`, `query-provider.tsx` |
| `pages/` | страницы по маршрутам | 5 подпапок (`desk`, `inbox`, `onboarding`, `project`, `settings`) + 4 верхнеуровневых файла (`sign-in.tsx`, `sign-up.tsx`, `accept-invite.tsx`, `scroll-probe.tsx`); всего 15 `.tsx` |
| `widgets/` | переиспользуемые виджеты оболочки | 18 подпапок: `agent-card`, `agent-inspector`, `chat-composer`, `chat-transcript`, `file-inspector`, `file-pane`, `folder-browser`, `ide-content`, `ide-home`, `ide-tabs`, `inbox-bell`, `project-sidebar`, `settings-nav`, `sidebar`, `terminal-pane`, `thread-dock`, `thread-journal`, `thread-run-status` |
| `features/` | доменные фичи с zustand-хранилищами и API-вызовами | 56 подпапок, в т.ч. `manage-agent`, `manage-issues`, `manage-connectors`, `send-message`, `onboarding`, `desk`, `switch-org`, `switch-thread`, `relay-link`, `connectors-pane` |
| `entities/` | типы сущностей frontend + zustand-хранилища | 14 подпапок: `agent`, `approval`, `automation`, `issue`, `org-machine`, `permission-rule`, `plan`, `project`, `schedule`, `session`, `thread`, `tool-catalog`, `usage`, `webhook` |
| `shared/api/` | API-клиент, сгруппирован по доменам | 69 модулей в `shared/api/index.ts`: `client.ts`, `session.ts`, `sse.ts`, `sse-state.ts`, `threads.ts`, `issues.ts`, `agents.ts`, `projects.ts`, `terminals.ts`, `integrations.ts` и др. |
| `shared/lib/`, `shared/services/`, `shared/ui/`, `shared/config/` | утилиты, оверлей, UI-компоненты shadcn, конфиг/роуты/окружение | `shared/lib/utils.ts`, `shared/services/overlay`, `shared/config/env.ts`, `shared/config/routes.ts`, `shared/config/location.ts` |
| `integrations/` | единственный реестр интеграций webui + клиент Telegram | `integrations/registry.ts`, `integrations/types.ts`, `integrations/telegram/` |

## API клиент frontend (кратко)

Базовый клиент — `apps/webui/src/shared/api/client.ts`:
- `apiJson<T>(path, init?)` — типизированный JSON-запрос через `requestJson` → `authenticatedFetch`.
- `authenticatedFetch` (`shared/api/session.ts`) — добавляет `Authorization: Bearer <accessToken>`, при `401` выполняет один инфлайт `sessionRefresh` (`POST /api/session/refresh`) и повтор; иначе возвращает исходный `401`.
- Заголовки запроса: `X-Org-Id` (`getActiveOrgId`, `shared/api/active-org.ts`; не отправляется на пути `/api/orgs*`), `X-Surface-Host-Id` (`selfNodeCached`, `shared/api/self-node.ts`).
- Ошибка не-ок ответа — `ApiError` со `status` и телом; текст из `body.error ?? body.message`.
- Фронтенд тонкий, формируется API; слоёв адаптеров нет (AGENTS.md: "Backend is the source of truth. Frontend is thin, shaped by the API, no adapter layers"). Типизация через `z.infer` из `@harnesys/contracts` и локальных типов.

## SSE (кратко)

`shared/api/sse.ts` — `readSse` (парсинг блоков `event:`/`id:`/`data:`) и `watchEventSource` (пул соединений по ключу `${url}::${orgId}`, подсчёт ссылок, авто-переподключение с бэк-off до 30 с, возобновление по `Last-Event-ID`). `shared/api/sse-state.ts` — zustand-хранилище `byOrg {`open` | `reconnecting`}`. Сетевого polling нет (AGENTS.md): push = SSE или WebSocket, одноразовые fetch по монтированию/действию.

## Диаграмма архитектуры

```mermaid
graph TD
    Browser[Браузер / вкладка]
    main[main.tsx: createRoot, Providers + AppRouter]
    Providers[app/providers.tsx: ThemeProvider > QueryProvider > EulaGate > SessionGate > OrgProvider]
    Router[app/router.tsx: react-router createBrowserRouter]
    Routes[app/routes.tsx: RouteObject[]]
    Pages[pages/* — 15 .tsx, 5 подпапок + 4 верхнеуровневых]
    Widgets[widgets/* — 18 виджетов]
    Features[features/* — 56 фичей, zustand сторы, TanStack Query]
    Entities[entities/* — 14 сущностей, zustand сторы]
    API[shared/api/ — 69 модулей: client.ts, session.ts, sse.ts, sse-state.ts]
    Server[Hono API :47474 — REST + SSE + WebSocket]

    Browser --> main
    main --> Providers
    Providers --> Router
    Router --> Routes
    Routes --> Pages
    Pages --> Widgets
    Pages --> Features
    Widgets --> API
    Features --> API
    Entities --> API
    API -->|HTTP JSON / SSE / WebSocket| Server
```

## Связанные разделы

- [42-frontend-страницы-и-виджеты.md](./42-frontend-страницы-и-виджеты.md)
- [43-frontend-state-management.md](./43-frontend-state-management.md)
- [44-frontend-api-клиент.md](./44-frontend-api-клиент.md)
- [61-webui-архитектура-страницы-виджеты.md](./61-webui-архитектура-страницы-виджеты.md)
- [62-webui-состояние-api-sse.md](./62-webui-состояние-api-sse.md)
- [63-интеграции-telegram-github-google.md](./63-интеграции-telegram-github-google.md)
