# 62. WebUI — состояние, API-клиент, SSE

## shared/api (69 модулей, `shared/api/index.ts`)

Базовый клиент `shared/api/client.ts`:
- `apiJson<T>(path, init?)` → `requestJson` → `authenticatedFetch` → `apiUrl(env.localHostOrigin)`.
- `authenticatedFetch` (`shared/api/session.ts`): `Authorization: Bearer <accessToken>`; при `401` один инфлайт `sessionRefresh` (`POST /api/session/refresh`, `x-refresh-token` из `localStorage` ключа `harnesys.refresh`, `credentials: 'include'`) и повтор с `bearerOf(init)`; иначе возвращает `401`.
- Заголовки каждого запроса (`client.ts:37`): `X-Org-Id` (`getActiveOrgId`, `shared/api/active-org.ts`; не на путях `/api/orgs*`), `X-Surface-Host-Id` (`selfNodeCached`, `shared/api/self-node.ts`).
- Ошибка не-ок → `ApiError(status, message, body)`; текст из `body.error ?? body.message`; 204 → `undefined`.
- Сессия: `sessionLogin` (`POST /api/session/login`, accessToken в памяти, refreshToken в `localStorage`), `sessionLogout`, `sessionRefresh`, `sessionOwnerStatus`, `sessionOwnerInit`, `getAccess/setAccess/clearAccess`, `notifySessionDead/subscribeSessionDead`, `subscribeSessionReady` (`shared/api/session.ts`).

Все доменные модули агрегированы в `shared/api/index.ts` (группы: сессия, организации, проекты, потоки, агенты, проблемы, знания, интеграции, MCP, плагины, расписания, вебхуки, флот, терминалы, прочее — см. [44-frontend-api-клиент.md](./44-frontend-api-клиент.md)).

## SSE (Server-Sent Events)

`shared/api/sse.ts`:
- `readSse(response)` — `AsyncGenerator<SseFrame>` (`{ event, data, id? }`); парсит блоки `event:`/`id:`/`data:` через `TextDecoder`, разделитель `\n\n`, опциональный `idleTimeoutMs` с дедлайном 'sse stream stalled'.
- `watchEventSource(url, event, onData, options)` — пул соединений (`Map`), ключ `` `${url}::${orgId}` ``, подсчёт ссылок (`refs`), колбэки `onOpen`/`onError`/`onData`. Авто-переподключение: 1 с при стабильном соединении (≥ 10 с), иначе экспоненциальный бэк-off `1000 * 2**attempt`, кап 30 с, возобновление по `Last-Event-ID`; при `400` со старым `lastId` — повтор без него. Отписка при `refs === 0` abort'ит соединение.
- `shared/api/sse-state.ts` — zustand `useSseConnectionStore`: `byOrg: Record<string, 'open' | 'reconnecting'>`, `mark(orgId, state)`, `clear(orgId)`, хелпер `setSseConnectionState`.

Клиент подписывается на ran-события (ходы выполнения, чанки модели) через SSE при монтировании/действии; повторного опроса нет. При обрыве — авто-переподключение с бэк-off.

## Управление состоянием

Zustand (`create`) — по фичам и сущностям:

- `entities/*/model/*.store.ts`: `agent.store.ts` (`items`, `byId`, `inOrg`, `upsert`, `update`, `remove`) и хранилища остальных 13 сущностей.
- `features/*/model/*.store.ts`: `issue-drawer.store.ts`, `issue-view.store.ts` (`manage-issues`), `queue.store.ts` (`message-queue`), `desk.store.ts` (активная вкладка инспектора, открытые файлы), `agents-display.store.ts`, `ide.store.ts`, `lsp-sessions.store.ts`, `compacting.store.ts`, `app-update.store.ts`.
- `shared/api/sse-state.ts` — состояние SSE-соединения по организации.
- Чистые/производные без стора: `section-attention.ts`, `thread-tree.ts` (`project-sidebar`).

React Compiler мемоизирует компоненты автоматически; ручного `useMemo`/`useCallback` для перформанса нет (AGENTS.md).

## Запрет на polling

Нет `refetchInterval` на API-запросах, нет `setInterval`/`setTimeout` циклов hitting HTTP "just in case". Push = SSE или WebSocket; одноразовая fetch при монтировании/действии; обновление по клику. UI-таймеры без сети допустимы (AGENTS.md).

## Диаграмма: SSE и состояние

```mermaid
flowchart TD
    C[React компонент]
    S[Zustand store (features / entities / sse-state)]
    A[shared/api: client.ts + session.ts + sse.ts]
    H[Hono API :47474]
    T[Терминал WebSocket /api/terminals/:id]

    C -->|подписка useXStore| S
    S -->|apiJson / watchEventSource| A
    A -->|HTTP JSON (Bearer, X-Org-Id)| H
    A -->|SSE поток ran-событий| H
    H -->|Last-Event-ID при переподключении| A
    A -->|чистый WebSocket| T
    T -->|JSON кадры history/out/exit, in/resize| A
```

## Связанные разделы

- [41-frontend-архитектура-webui.md](./41-frontend-архитектура-webui.md)
- [42-frontend-страницы-и-виджеты.md](./42-frontend-страницы-и-виджеты.md)
- [43-frontend-state-management.md](./43-frontend-state-management.md)
- [44-frontend-api-клиент.md](./44-frontend-api-клиент.md)
- [38-модель-terminale.md](./38-модель-terminale.md)
- [39-безопасность.md](./39-безопасность.md)
- [40-ошибки-и-логирование.md](./40-ошибки-и-логирование.md)
