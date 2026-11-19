# OpenAPI Addon — план

Системный аддон `add-ons/harnesys.openapi`: подключение внешних HTTP API по OpenAPI-спеке, белый список операций, гранты «агент × проект × операция», туры `api_*` вместо fetch/терминала. Прецедент по форме — `add-ons/harnesys.webhook` (store/routes/tools/layout), правила аддонов — `docs/external-addons/`.

Зафиксированные решения: гранты — белый список; поверхность — 7 тулов (`api_list`, `api_docs`, `api_get`, `api_post`, `api_put`, `api_patch`, `api_delete`); кор-чейндж agentId в `tools.call` одобрен (агностичный для ядра, с обновлением доков).

## Зоны файлов

- `add-ons/harnesys.openapi/**` — аддон целиком.
- `apps/server/src/app/infra/addons/families/tool-pack/tool-pack.family.ts` — единственная правка ядра.
- `docs/external-addons/sdk-and-manifest.md`, `docs/external-addons/contributions.md` — доки по meta агента.
- `docs/openapi-addon-plan.md` — этот план. Legacy §14.1 и интеграционный слой не трогаются.

## Данные аддона

SQLite аддона (`migrations/0001_init.sql`), ключи секретов — через `ctx.secrets`, не в конфиге и не в логах:

```sql
create table projects (
  id text primary key,            -- uuid
  name text not null,
  base_url text not null,
  auth_kind text not null default 'none',  -- none | bearer | basic | header | query
  auth_param text,                -- имя header/query-параметра для header|query
  spec_sha text,                  -- sha256 последней импортированной спеки
  created_at text not null,
  updated_at text not null
);
create table operations (
  id text primary key,            -- `${projectId}:${operationId}`
  project_id text not null references projects(id) on delete cascade,
  operation_id text not null,     -- operationId из спеки или синтез `${method}_${pathSlug}`
  method text not null,           -- GET|POST|PUT|PATCH|DELETE
  path_template text not null,    -- /users/{id}
  summary text,
  enabled integer not null default 0,
  spec text not null,             -- нормализованный JSON: params[], requestBodySchema?, responses?
  unique(project_id, operation_id)
);
create table grants (
  agent_id text not null,
  project_id text not null,
  operation_id text not null,     -- операции, не row id: реимпорт спеки гранты сохраняет
  created_at text not null,
  primary key (agent_id, project_id, operation_id)
);
```

Секреты: `project:<id>:token` (bearer/header-value/query-value/password), для basic дополнительно `project:<id>:user`. Пишутся admin-роутом `POST /projects/:id/secret` через `ctx.secrets.set`, никогда не читаются назад в UI.

Реимпорт спеки — upsert по `(project_id, operation_id)`: операции, пропавшие из новой спеки, выключаются (`enabled = 0`), не удаляются; новые вставляются с `enabled = 0`; гранты не трогаются.

## Поверхность тулов

Пак `api` (дескриптор `name: "api"`, вкладка агента — штатное назначение пака). Host-имена: `api_list`, `api_docs`, `api_get`, `api_post`, `api_put`, `api_patch`, `api_delete` (`exposedToolName` — apps/server/src/app/domain/addons/exposed-tool-name.ts).

| Тул | effect / idempotent | Вход | Поведение |
|---|---|---|---|
| `api_list` | read / true | `{project?, limit?}` | Проекты и операции, разрешённые вызывающему агенту: operationId, method, path, summary. limit 50, max 200 |
| `api_docs` | read / true | `{project, operation}` | Нормализованная схема одной операции: параметры (kind: path/query/header, required, schema), requestBody, ответы |
| `api_get` | read / true | `{project, operation, params?, body?}` | Исполнение с инъекцией auth |
| `api_post`, `api_put`, `api_patch` | write | то же | Исполнение |
| `api_delete` | destructive | то же | Исполнение |

`params` — плоский объект: аддон по сохранённой спеке раскладывает ключи в path/query/header и подставляет `{param}` в шаблон пути; неизвестные ключи → `invalid_params` с перечнем ожидаемых имён. `body` принимается только методам со requestBody в спеке. Схемы в манифесте общие и перmissive (`additionalProperties: true`, depth ≤ 8), реальная валидация — против сохранённой спеки на сервере аддона.

Контракт результата: `{ status, contentType, body }`, где body — распарсенный JSON или строка, обрезанная до `maxResultKb` (256 по умолчанию) с маркером обрезки. Upstream 4xx/5xx — обычный результат с `status`, не исключение: агент должен видеть ответ API. Исключения (`AddonError`) — только отказы самого аддона:

- гранта нет → `permission_denied`, detail перечисляет разрешённые операции агента;
- операция не найдена или выключена → `not_found` / `unsupported`;
- параметр не подошёл → `invalid_params`;
- секрет не задан → `account_failed`;
- сеть: таймаут → `timeout`, остальное → `unavailable`.

Грант-проверка берёт агента из `ctx.meta.agentId`; вызов вне агентской сессии (principal `user`/`system`) → `permission_denied` с пояснением.

## Импорт OpenAPI

`src/openapi/parse.ts`: вход — JSON-спека (формат 3.x, 2.0 сводится тем же нормализатором: paths → operations). Выход — строки `operations`: operationId из спеки, при отсутствии/дубликате — синтез `${method}_${pathSlug}` с дедупликацией; summary; нормализованные параметры (`$ref` внутри документа разворачиваются), requestBody-схема урезается до валидного для `api_docs` представления (тот же JSON Schema subset, что в дескрипторах).

Ограничение v1: принимается только JSON. Единственный разрешённый импорт аддона — `@harnesys/sdk`, YAML-парсер в бандл взять неоткуда; минимальный самописный YAML-парсер — неоправданный риск. Варианты позже: конвертер на стороне хоста (generic-утилита, без знания об аддонах) или утилита в SDK. В UI подсказка «вставьте JSON или загрузите .json».

Загрузка: `POST /projects/:id/spec` с `bodyLimitKb: 4096` (кап протокола — 8 MiB на сообщение). Хранение — только нормализованные операции, сырая спека не сохраняется; `spec_sha` показывает, реимпортировалась ли спека. Квота БД `quotaMb: 16`.

## Auth-схемы

`auth_kind` на проекте: `none`, `bearer` (`Authorization: Bearer <token>`), `basic` (token+user), `header` (`<auth_param>: <token>`), `query` (`?<auth_param>=<token>`). Инъекция в `src/call.ts` перед `ctx.http.fetch`, секрет читается на каждый вызов, кэша нет. Роут `POST /projects/:id/test` (admin) делает реальный запрос к `base_url` с этой схемой и возвращает status/latency — «Test connection» в UI; отдельного тула `api_test` у агента нет.

OAuth/аккаунты через `connections` — не v1: connections статичны в манифесте и не подходят под рантайм-проекты; отмечено как follow-up.

## Кор-чейндж: личность агента в tools.call

Сегодня `tool-pack.family.ts` строит `execute(input)` и вызывает `calls.callTool` без опций → `_meta.principal` падает в `system`, `ctx.meta.agentId` в аддоне пуст. При этом скоуп сессии уже лежит в `AsyncLocalStorage` (`apps/server/src/app/infra/runtime/host-tool-scope.ts`, `getHostToolScope()` — `CapabilityScope` несёт `agentId`, `threadId`), и `AddonCallService.request` умеет прокидывать `agentId/threadId` в `_meta` (apps/server/src/app/application/addons/calls/addon-call.service.ts, транспорт штампует в `withCallMeta`).

Правка: в `buildTool` внутри `execute` читать `getHostToolScope()` и передавать `opts = { agentId, threadId }` (опционально, undefined опускается) в `callTool`. Агностично: любой аддон-пак получает личность вызывающего агента, ядро ничего не знает о конкретных аддонах. SDK не меняется (поля `CallMeta.agentId/threadId` уже в протоколе, fixtures `tools-call.request.json` это подтверждают) → версия SDK не двигается; меняются доки:

- `sdk-and-manifest.md`: в разделе CallMeta/протокола — «tools.call из агентской сессии несёт agentId/threadId; route.handle — principal пользователя; вне сессии principal system»;
- `contributions.md`: в tool-pack — гранты по `ctx.meta.agentId` возможны, встречный пример один строкой.

## UI (view + routes)

Манифест — один `view`, секции: `status`, `capabilities`, `permissions`, таблицы и форма. Роуты org, мутации — `role: 'admin'`, чтения — `member` (прецедент — webhook: `instances`, `rotate-*`):

- `GET /projects`, `POST /projects` `{name, baseUrl, authKind, authParam?}`, `POST /projects/:id` (update), `POST /projects/:id/delete`, `POST /projects/:id/spec`, `POST /projects/:id/secret`, `POST /projects/:id/test`;
- `GET /operations?projectId=`, `POST /operations/toggle` `{id, enabled}`;
- `GET /grants`, `POST /grants` `{agentId, projectId, operationIds[]}`, `POST /grants/delete` `{agentId, projectId, operationIds[]}`.

Таблицы: Projects (name, baseUrl, auth, операций enabled/всего, spec_sha; rowActions Import spec / Edit / Test connection / Delete с confirm), Operations (project, method, path, enabled-badge; rowAction toggle), Grants (agent, project, operation; rowAction revoke). Форма «Grant access»: agent — `select` c `optionsFrom: { kind: 'agents' }`, project — `optionsFrom: { kind: 'addonRoute', route: '/projects' }`, operations — multi-select c `dependsOn: ['project']` (FieldSpec это умеет: packages/sdk/src/families/field-spec.ts). Секция `config` не объявляется — статических полей нет.

## Скилл

`content/skill` с id `usage`, каталог `content/api-usage/` c `SKILL.md`; пак ссылается `skills: ["usage"]` — контент встраивается в пак независимо от allowlist агента. Текст: флоу `api_list` → `api_docs` → глагол; params плоский, аддон раскладывает сам; 4xx/5xx — нормальный ответ, смотри `status`; смысл `AddonError`-кодов; лимиты размеров. English, ≤ 60 строк.

## Фазы

1. **Скелет** — `addon.json` (id `harnesys.openapi`, platform 1, lazy, trusted, permissions `[http.fetch]` без scope — grant unscoped покрывает любые хосты, URL проектов рантаймовые; `connections: []`; `data.quotaMb: 16`), `migrations/0001_init.sql`, `src/index.ts` с пустым паком и одним тула-заглушкой. Бут dev-стенда: системные аддоны ставятся по определению (apps/server/src/app/infra/addons/catalog/addon-staging.ts), дождаться успешного старта и handshake.
2. **Кор-чейндж** — правка `tool-pack.family.ts` + оба док-файла. Проверка: dev-стенд, вызов тула из агентской сессии, в логе аддона `ctx.meta.agentId` заполнен; вызов из REST-роута — principal user.
3. **Импорт и UI** — `src/openapi/parse.ts`, `src/store.ts`, `src/org-routes.ts`, таблицы/форма в манифесте, секрет-роуты, test connection.
4. **Пак и гранты** — `src/call.ts` (URL/auth/params/truncate), `src/tools.ts`, дескриптор пака в манифесте, enforcement, скилл.
5. **Гейты и сдача** — сборка `bun run build`, `tsc --noEmit`, `biome check` (включая add-on lint gate на импорт только `@harnesys/sdk`), юнит-тесты, бут, чек-лист ручной проверки пользователю.

Параллельные агенты, если понадобятся: зоны «аддон» и «tool-pack.family.ts + доки» не пересекаются; shared-шов зафиксирован выше (контракт `AddonCallOptions`, `CallMeta`) — кодить можно одновременно.

## Тесты

Только критичная чистая логика, `bun test`, рядом с кодом (`*.spec.ts`):

- `parse.spec.ts` — golden-фикстура: JSON-спека → нормализованные операции, синтез operationId, разворот `$ref`, дедупликация;
- `call-params.spec.ts` — раскладка плоского params по path/query/header, ошибка на неизвестном ключе;
- `call-auth.spec.ts` — сборка заголовков/URL по auth_kind без реальных секретов;
- `truncate.spec.ts` — обрезка результата с маркером.

До ручной проверки пользователем новых тестов сверх этого списка не писать; e2e/HTTP-тесты запрещены правилами репозитория.

## Проверки сдачи

- Бут dev-стенда с аддоном: staging без нарушений, handshake, пак `api` виден в каталоге, назначается агенту, туры вызываются.
- `api_get` по гранту возвращает статус API; без гранта — `permission_denied` с перечнем; вне сессии — отказ.
- Реимпорт изменённой спеки: выключенные операции, сохранённые гранты; удаление проекта каскадом чистит operations/grants/секреты.
- `http.fetch` за пределами scope: разрешено всем хостам (grant unscoped) — проверить один вызов на произвольный хост.

## Ограничения v1

- Только JSON-спеки (причина и пути расширения — выше).
- Один секрет на проект; OAuth/мультиаккаунт — follow-up через connections, когда модель связок дорастёт.
- Ответы больше `maxResultKb` обрезаются; бинарные тела не отдаются (только text/JSON).
- `api_list` ограничен 200 строками — большие спеки листаются фильтром по проекту.
- Таймаут тулов статичен (60 с, дескриптор `timeoutSec`), пер-проектный таймаут — позже через specFields пака.
