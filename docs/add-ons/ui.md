# UI аддона

Код аддона в интерфейсе хоста не исполняется никогда — это инвариант. UI аддона целиком декларативен: вклад `view` описывает секции страницы, вклады `config`/`specFields`/`configFields` — формы, а данные для таблиц и действий отдают `route`-обработчики. Фронтенд держит `SectionRegistry` (тип секции → компонент) с фиксированным набором из 12 типов; неизвестный тип секции скрывается с пометкой «Requires a newer app version».

## Страница аддона

Путь: `Settings → Add-ons → <аддон>` (`/o/:orgId/settings/addons/:addonId`). Без вклада `view` страница строится из манифеста дефолтным набором: `status`, `capabilities`, `permissions`, `connections`, `config`, `automations`, `jobs`. С вкладом — секции из дескриптора; порядок расположения единый для всех страниц и расставляется фронтендом независимо от порядка в манифесте: сначала служебные (`status, capabilities, permissions, connections, config, automations, jobs`), затем аддонские (`table, form, actions, frame`) в порядке объявления, `markdown` последним.

```json
{ "id": "main", "family": "view",
  "descriptor": { "id": "main", "title": "Telegram", "sections": [
    { "type": "status" },
    { "type": "connections" },
    { "type": "config" },
    { "type": "jobs" },
    { "type": "form", "title": "Pair a chat", "fields": [ … ], "submit": { "route": "/pair" } },
    { "type": "table", "title": "Paired chats", "source": { "route": "/chats" }, "columns": [ … ],
      "rowActions": [ { "id": "unbind", "label": "Unbind", "route": { "route": "/chats/:id/unbind", "params": { "id": "id" } },
                        "confirm": "Unbind this chat?", "destructive": true } ], "pageSize": 20 },
    { "type": "markdown", "body": "How pairing works…" }
  ] } }
```

Три секции данных (`table`, `form`, `actions`) обращаются к маршрутам **самого аддона** по `/orgs/:orgId/addons/:addonId/r/*` — под ролевой guard, схемы и лимиты роута.

## Типы секций

| Секция | Поля | Что рендерит | Контракт данных |
|---|---|---|---|
| `status` | — | версия, health, last error, warnings | read-model хоста |
| `capabilities` | — | сводка вкладов (families → tools/triggers/…) | read-model хоста |
| `permissions` | — | объявлено / выдано / разница | read-model хоста |
| `config` | `fields?: string[]` | форма конфига (фильтр по ключам) | `PUT .../config` |
| `connections` | `connections?: string[]` | AccountPicker по требованиям | `PUT .../bindings/:id` |
| `automations` | `triggers?: string[]` | экземпляры триггеров вида | CRUD `/triggers` |
| `jobs` | — | расписания, enable/disable, Run now | `PATCH/POST .../jobs` |
| `table` | `title, source, columns, rowActions?, pageSize?` | таблица + пагинация + действия | `source` route: `{ rows, nextCursor? }` |
| `form` | `title, fields, submit, confirm?` | форма, submit-маршрут | submit route: `{ toast?, refresh? }` |
| `actions` | `actions: Action[]` | кнопки | `{ toast?, refresh? }` |
| `markdown` | `body: L10n` | текст (последним) | — |
| `frame` | `route, height?` | iframe-область | HTML с route аддона |

`Action = { id, label, route: RouteRef, confirm?, destructive? }`; `Column = { key, label, format: 'text'|'datetime'|'number'|'badge'|'link'|'copy' }`; `RouteRef = { route, params? }` — `params` мапит колонку в сегмент пути (`{ id: "id" }` → `/chats/:id/unbind` с id строки).

## `frame` — изолированный escape hatch

Для UI, который не выражается секциями: iframe с `sandbox="allow-scripts"` (без `allow-same-origin`), `src` — GET-маршрут аддона, отдающий HTML. Изоляция обеспечивается самим sandbox (отдельный origin); CSP ответа хост не подменяет. Единственный канал связи — `postMessage`-мост `frame-bridge.tsx`; запрос обязан нести `requestId`, мост отвечает `host.response` с ним же:

```js
parent.postMessage({ type: 'host.request', requestId: 'r1', route: 'items', method: 'GET', body: null }, '*');
```

Набор типов секций закрыт: `panel`/`webview` не существует — песочничные webview остаются только в перспективе (см. [Дорожную карту](roadmap.md)), единственный escape hatch — `frame`.

Запрос выполняется тем же маршрутом аддона от имени пользователя: ни cookie, ни токенов, ни родительского DOM. Больше никаких мостов нет.

## FieldSpec

Единый декларативный тип формы — конфиги (`config`), поля триггеров (`configFields`), `specFields` паков, поля секции `form`:

```ts
interface FieldSpec {
  key: string;
  label: string;
  type: 'text' | 'secret' | 'textarea' | 'url' | 'select' | 'number' | 'boolean' | 'group';
  required: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number | boolean | null;
  options?: Array<{ value: string; label: string; help?: string }>;
  multi?: boolean;                    // мультивыбор select — хранится запятой-списком
  optionsFrom?:                       // динамические опции, резолвит хост
    | { kind: 'addonRoute'; route: string; dependsOn?: string[]; listKey?: string; valueKey: string; labelKey?: string }
    | { kind: 'connections' };        // список привязанных аккаунтов
  pattern?: { regex: string; hint: string };
  editable?: boolean;                 // false — только показать
  generated?: boolean;                // значение создаёт хост/аддон
  fields?: FieldSpec[];               // дети 'group'
  visibleWhen?: { key: string; equals?: string; oneOf?: string[] };
  widget?: { kind: string; params?: Record<string, string|number|boolean> }; // например { kind: 'cron' }
  collapsible?: boolean; advanced?: boolean;   // group: сворачиваемая/экспертная
  columns?: 1|2|3|4;                  // group: сетка детей
}
```

Примеры:

```json
[
  { "key": "commands", "label": "Parse chat commands", "type": "boolean", "required": false, "default": true },
  { "key": "bot_token", "label": "Bot token", "type": "secret", "required": true, "help": "Stored in the host secret store" },
  { "key": "miss_policy", "label": "If a run is missed", "type": "select", "required": false, "default": "catch-up",
    "options": [{ "value": "catch-up", "label": "Catch up", "help": "Runs missed while the host was asleep still fire within the next hour." },
                 { "value": "skip", "label": "Skip" }] },
  { "key": "cron", "label": "Cron", "type": "text", "required": true, "widget": { "kind": "cron" } },
  { "key": "repo", "label": "Repository", "type": "select", "required": true,
    "optionsFrom": { "kind": "addonRoute", "route": "/repos", "valueKey": "full_name", "labelKey": "full_name", "dependsOn": ["installation"] } },
  { "key": "account", "label": "Bot account", "type": "select", "required": true, "optionsFrom": { "kind": "connections" } },
  { "key": "expert", "label": "Advanced", "type": "group", "required": false, "advanced": true, "collapsible": true, "columns": 2,
    "fields": [ { "key": "poll_sec", "label": "Poll interval", "type": "number", "required": false, "visibleWhen": { "key": "commands", "equals": "true" } } ] }
]
```

`secret`-поля уходят в хранилище секретов и не появляются в `ctx.config.get` ([data-storage](data-storage.md#секреты)). `visibleWhen`/`optionsFrom` резолвятся хостом при рендере; статические `options` — fallback. Помощники SDK для своих расчётов: `fieldVisible(field, values)`, `defaultConfigValues(fields)`.

## Консистентные состояния

Карточки и страница показывают баннеры: карантин после серии падений, `failed`-инстанс, несовместимость с хостом, пропущенные при загрузке способности, external-пакет без песочницы, обязательные неподключённые connections, доступное обновление с новыми правами (согласие), package warnings. Диалог согласия перечисляет права с risk/областью/reason, при update — разницу.

## Как добавить тип секции (для мейнтейнеров)

Это правка ядра, не аддона: компонент + запись в `section-registry.tsx` + тип в `ViewSection` SDK + версия `v` view-семейства. Существующие аддоны не меняются; старые хосты секцию просто не отрендерят (неизвестный тип).

---

Дальше: [Тестирование](testing.md)
