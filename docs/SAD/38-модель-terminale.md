# 38. Модель терминала (terminal)

## Назначение

Интерактивный доступ к командной оболочке хоста через чистый WebSocket (не SSE). Клиент `apps/webui` (`TerminalView`) и сервер `apps/server` (`terminal.ws.ts`) обмениваются JSON-кадрами.

## Домен (app/domain/terminal/)

| Файл | Назначение |
|------|------------|
| `terminal-session.port.ts` | порт `TerminalSessionsPort`: `list`, `listAll`, `get`, `create`, `write`, `resize`, `subscribe` (data/exit listeners), `scrollback`, `stop`, `delete`, `upsertExternal`, `jobRegistry` |
| `terminal-events.port.ts` | порт событий терминала (`TerminalEventsPort`: `subscribe`, `emit`) |
| `terminal.error.ts` | доменные ошибки терминала |

### TerminalSessionsPort (terminal-session.port.ts)

Методы: `list(projectId)`, `listAll(orgId?)`, `get(sessionId)`, `create(input)`, `upsertExternal(job)`, `jobRegistry()`, `write(sessionId, data)`, `rename(sessionId, title)`, `resize(sessionId, cols, rows)`, `subscribe(sessionId, onData, onExit?)`, `scrollback(sessionId)`, `stop(sessionId)`, `delete(sessionId)`.

`CreateTerminalSessionInput`: `projectId`, `cwd`, `orgId?`.

`TerminalScrollback`: `text`, `truncated`. `TerminalJobSnapshot`: `id`, `title`, `cwd`, `createdAt`, `status`, `exitCode`, `origin?` (`'user'`\|`'agent'`), `name?`, `orgId?`, `target?`.

Типы слушателей: `TerminalDataListener = (chunk: string) => void`, `TerminalExitListener = (code: number | null) => void`.

### Ошибки (terminal.error.ts)

- `TerminalSessionNotFoundException extends EntityNotFoundException`.
- `TerminalNameConflictException extends ConflictException`.
- `TerminalCwdInvalidException extends ValidationException`.

### TerminalEventsPort

`subscribe(listener: (orgId, event) => void) → () => void`, `emit(orgId, event: TerminalWatchEvent)`.

## Use-cases

Создание сессий, отправка команд, получение вывода — `application/terminal/terminal.use-case.module.ts`. Конкретные use-case не найдены в объёме этого раздела — не проверено кодом.

## Контроллеры (app/api/rest/)

| Контроллер | Путь | Назначение |
|------------|------|------------|
| `TerminalsController` | `orgs/:orgId/sources/:sourceId/terminals` | терминалы источника |
| `OrgTerminalsController` | `orgs/:orgId/terminals` | терминалы организации |

не проверено кодом — файлы не найдены в объёме этого раздела.

## Адаптеры (app/infra/terminal/)

| Файл | Назначение |
|------|------------|
| `terminal.module.ts` | DI-модуль: `TerminalSessionsPort` → `TerminalSessionsAdapter`, `TerminalEventsPort` → `TerminalEventsAdapter` |
| `terminal-sessions.adapter.ts` | `TerminalSessionsAdapter extends TerminalSessionsPort` — управление процессами сессий через `ProcessJobRegistry` |
| `terminal-events.adapter.ts` | `TerminalEventsAdapter extends TerminalEventsPort` — вентилятор слушателей событий |
| `terminal.ws.ts` | WebSocket endpoint `/api/terminals/:sessionId`, `registerTerminalWs(app, container)` |

`registerTerminalWs` вызывается в `apps/server/src/main.ts:58` (не проверено кодом — ссылка взята из существующего SAD).

### TerminalSessionsAdapter

Использует `createProcessJobRegistry()` из `harnesys` (режим `pty`, команда `process.env.SHELL ?? '/bin/zsh`). Сессии отслеживаются в `metaBySession` (projectId, orgId). При удалении сессии emitting событие `removed` через `TerminalEventsPort`. SSH сокеты очищаются при старте (`sweepSshSockets`, max age 11 мин).

### TerminalEventsAdapter

Простой набор слушателей; ошибки слушателей не прерываютファン-аут `emit`.

## WebSocket поток (terminal.ws.ts)

### Клиентские сообщения (ClientMessage)

`{ type: 'in', data: string }` — запись в сессию. `{ type: 'resize', cols, rows }` — изменение размера терминала.

### Серверные сообщения (ServerMessage)

`{ type: 'history', data, truncated }` — история вывода. `{ type: 'out', data }` — порция вывода процесса. `{ type: 'exit', code }` — завершение процесса.

### Последовательность подключения

```mermaid
flowchart TD
  Client[Клиент: TerminalView (xterm.js)] --> Ticket[POST /api/session/ticket, действия ['terminal.open'] или ['terminal.open:ro']]
  Ticket --> WS[WebSocket /api/terminals/:sessionId?cols=&rows=&ticket=&ro=]
  WS --> Verify[верификация билета NodeTicketAccess.verify]
  Verify -->|недействителен| Close1008[WS close 1008 unauthorized]
  Verify -->|успех| Consume[tickets.consume(verified)]
  Consume --> Get[secrets.get(sessionId)]
  Get -->|не найден| Close1008b[WS close 1008 terminal session not found]
  Get -->|найден| Resize[sessions.resize(sessionId, cols, rows)]
  Resize --> History[отправка history (scrollback, truncated)]
  History --> Exited{сессия завершена?}
  Exited -->|да| Exit[отправка exit code]
  Exited -->|нет| Subscribe[sessions.subscribe(onData, onExit)]
  Subscribe --> Live[кадры out / exit в реальном времени]
  Client --> In[in {data} → sessions.write (только не readonly)]
  Client --> ResizeC[resize {cols, rows} → sessions.resize]
  WSClose[закрытие WS] --> Detach[detach: unsubscribe, очистка WeakMap]
```

Пошагово:

1. Клиент запрашивает билет доступа: `POST /api/session/ticket` с действиями `['terminal.open']` (или `['terminal.open:ro']` при 403) через `requestNodeTicket` (`apps/webui/src/shared/api/node-tickets.ts:8`) — не проверено кодом.
2. Клиент открывает `WebSocket ${hostWsBase()}/api/terminals/:sessionId?cols=…&rows=…&ticket=…[&ro=1]` — не проверено кодом.
3. Сервер верифицирует билет (`NodeTicketAccess.verify`, `terminal.ws.ts:99`), потребляет его (`tickets.consume`), проверяет права `terminal.open` / `terminal.open:ro`; без билета — закрывает соединение кодом 1008 `unauthorized` (`terminal.ws.ts:46-47`).
4. Сервер ищет сессию через `sessions.get(sessionId)`, отправляет scrollback (`history`, с флагом `truncated`) и, если сессия завершена, `exit` (`terminal.ws.ts:136-149`).
5. Сервер подписывается на `onData`/`onExit` сессии (`sessions.subscribe`); клиент получает кадры:
   - `history { data, truncated }` — история вывода,
   - `out { data }` — порция вывода процесса,
   - `exit { code }` — завершение процесса (`terminal.ws.ts:17`).
6. Клиент → сервер: `in { data }` (запись в сессию, `sessions.write`, только если не readonly), `resize { cols, rows }` (`terminal.ws.ts:168-200`).
7. При закрытии WS — `detach` и отписка (`terminal.ws.ts:203`).

### Режимы доступа

Полный (`terminal.open`) и только чтение (`terminal.open:ro`, параметр `ro=1`; курсор отключён, запись и resize блокируются) — не проверено кодом (ссылки на клиентские файлы взяты из существующего SAD).

## Связанные разделы

- [05-архитектура-сервера.md](./05-архитектура-сервера.md) (registerTerminalWs в main.ts)
- [10-слой-infra-adapters.md](./10-слой-infra-adapters.md)
- [39-безопасность.md](./39-безопасность.md) (билеты доступа NodeTicketAccess)
- [62-webui-состояние-api-sse.md](./62-webui-состояние-api-sse.md) (терминал — WebSocket, не SSE)
