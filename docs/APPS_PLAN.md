# Apps/Accounts — чистовой план реализации

*Бэкенд + фронтенд. Единый фундамент подключения внешних провайдеров. Строится параллельно легаси и не затрагивает его.*

## 0. Назначение, границы, допущения

**Apps/Accounts** — слой доступа к внешним сервисам. Он:

- хранит **App** — регистрацию нашего приложения у провайдера (OAuth-клиент, GitHub App, Slack App и т. п.);
- хранит **Account** — подключённую учётную запись или грант (токен бота, OAuth-грант, установка приложения, API-ключ);
- проводит подключение одним механизмом для любых способов (OAuth, manifest, device code, вставка токена);
- выдаёт аддонам актуальные учётные данные и сам их обновляет;
- принимает вебхуки провайдеров, проверяет подпись кодом провайдера и передаёт события потребителям;
- отдаёт фронтенду дескрипторы, по которым рисуется весь UI подключения.

**Не делает:** бизнес-логику интеграций (почта, сообщения, репозитории — это аддоны); долгоживущие соединения (Socket Mode, Gateway, MTProto, long polling — воркеры аддонов, учётные данные они берут отсюда); регистрацию и продление подписок на вебхуки у провайдера (аддон получает `webhookUrl` и сам вызывает API провайдера); не-HTTP протоколы (IMAP/SMTP/SSH/БД) — для них контекст провайдера расширяется отдельным портом по правилам §5.4.

**Допущения.** План на них опирается; расхождение с реальностью означает правку плана:

1. Есть `SecretStorePort` с шифрованием на диске (`get/set/delete` по `orgId` и ключу; `listKeys` используется только фоновой сверкой). Берётся как есть.
2. Хранилище организации — SQLite; миграции идемпотентные, в `infra/org-sqlite/**`.
3. Сервер — один процесс: сессии подключения и single-flight живут в памяти.
4. Таблицы `apps`/`app_accounts` из T1 заменяются схемой §2; данные T1 не переносятся.
5. У сервера есть настраиваемый публичный базовый URL (по умолчанию `http://127.0.0.1:<port>`); от него строятся `redirectUri` и `webhookUrl`.

## 1. Инварианты

Нарушение любого пункта — отказ на ревью независимо от зелёных тестов.

1. **Зависимости идут внутрь:** `domain ← application ← infra/api`. Провайдер — модуль в `infra/apps/providers/<id>/`; импортирует только `domain/apps` и `providers/_kit`.
2. **Ядро не знает провайдеров.** Имена провайдеров и видов встречаются только в `infra/apps/providers/**`. Ни `switch`, ни `if` по `provider`/`kind` в `domain`, `application`, `api`, `apps/webui`. Ядро ветвится только по данным дескриптора и по наличию обработчиков.
3. **Две таблицы:** `apps`, `app_accounts`. Ни таблиц, ни колонок, ни миграций на провайдера.
4. **UI строится из дескрипторов.** У провайдера нет фронтового кода.
5. **Секреты только в `SecretStorePort`.** В DTO, логах, событиях, ошибках и метриках их нет. Провайдер видит только заявленные ключи своего вида.
6. **Сеть провайдера — только через `ProviderHttp`** из контекста, с егресс-политикой вида. Прямой `fetch` в `infra/apps/providers/**` запрещён линтом.
7. **Наружу и в БД идёт только `AccountErrorCode`.** Текст ответа провайдера не сохраняется и не показывается.
8. **Fail-closed:** неизвестный вид, неизвестное поле, секрет вне заявленных ключей, битый дескриптор, несовпавшая идентичность — отказ, а не деградация.
9. **Клиент ничего не опрашивает.** Завершение подключения приходит по SSE; отложенные шаги провайдера (device code) опрашивает сервер.
10. **Контракт расширяется только аддитивно** (§5.4).
11. **Параллельность.** Пути легаси из §14.1 не меняются; новая система не читает и не пишет легаси-таблицы и секреты.

## 2. Модель данных

### 2.1 Сущности

| Сущность | Что это | Примеры |
| --- | --- | --- |
| **App** | Регистрация нашего приложения у провайдера. Нужна не каждому провайдеру | Google OAuth-клиент, GitHub App, Slack App, приложение Entra |
| **Account** | Подключённая учётная запись или грант. Создаётся только после успешной проверки у провайдера | Google-аккаунт с набором scopes, установка GitHub App, бот Telegram, API-ключ Stripe |
| **Connect session** | Состояние незавершённого подключения (PKCE verifier, state, device code). В БД не хранится (§6.4) | — |

Связь: `Account.appId → App.id`, nullable (токен-онли провайдеры без приложения). Один App — много Account; App одного вида может быть несколько.

### 2.2 Где что лежит

| Что | Где | Кто пишет | Кто читает |
| --- | --- | --- | --- |
| id, вид, статус, scopes, срок токена, label, код ошибки | типизированные колонки | ядро | ядро, UI |
| секреты | SecretStore: `app:<id>:<key>`, `account:<id>:<key>` | ядро — из результата провайдера или формы | провайдер через `SecretReader`; потребитель через `access()` |
| несекретные поля, введённые пользователем | `values_json` (App), `config_json` (Account) | ядро строго по ключам дескриптора | UI, провайдер |
| данные, полученные от провайдера (slug, installation id, список сайтов, workspace) | `metadata_json` | провайдер, после `validateMetadata` | только провайдер |

Ядро не читает `metadata` и не обращается к `values`/`config` по литеральным ключам — только по ключам из дескриптора (`values[field.key]`). Всё, что нужно самому ядру, — колонка.

### 2.3 Схема

```sql
CREATE TABLE apps (
  id                 TEXT PRIMARY KEY,
  org_id             TEXT NOT NULL,
  kind               TEXT NOT NULL,
  label              TEXT NOT NULL,
  status             TEXT NOT NULL CHECK (status IN ('configured','invalid')),
  last_error         TEXT,
  values_json        TEXT NOT NULL DEFAULT '{}',
  secret_fields_json TEXT NOT NULL DEFAULT '[]',
  metadata_json      TEXT NOT NULL DEFAULT '{}',
  verified_at        INTEGER,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX apps_org_kind ON apps (org_id, kind);

CREATE TABLE app_accounts (
  id                  TEXT PRIMARY KEY,
  org_id              TEXT NOT NULL,
  app_id              TEXT REFERENCES apps (id) ON DELETE RESTRICT,
  kind                TEXT NOT NULL,
  external_account_id TEXT NOT NULL,
  partition           TEXT NOT NULL DEFAULT '',
  label               TEXT NOT NULL,
  status              TEXT NOT NULL CHECK (status IN ('connected','expired','error')),
  last_error          TEXT,
  scopes_json         TEXT NOT NULL DEFAULT '[]',
  expires_at          INTEGER,
  config_json         TEXT NOT NULL DEFAULT '{}',
  secret_fields_json  TEXT NOT NULL DEFAULT '[]',
  metadata_json       TEXT NOT NULL DEFAULT '{}',
  verified_at         INTEGER,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  UNIQUE (org_id, kind, external_account_id, partition)
);
CREATE INDEX app_accounts_org_kind ON app_accounts (org_id, kind);
CREATE INDEX app_accounts_org_app  ON app_accounts (org_id, app_id);
```

`expires_at`, `verified_at` — мс epoch; `created_at`, `updated_at` — ISO-строки, как в существующих таблицах. `lastError` — всегда член `AccountErrorCode` (§4.4). Миграция в `org-sql-apps.ts` пересоздаёт обе таблицы, если обнаружена старая схема T1 (нет `metadata_json`); данные T1 не переносятся (допущение 4).

### 2.4 Правила записи

1. **Уникальность Account** — `(org_id, kind, external_account_id, partition)`. Повторное подключение той же идентичности — upsert: тот же id, scopes объединяются, секреты заменяются.
2. **`partition`** — непрозрачная строка провайдера, разводящая гранты одной идентичности, которые нельзя смешивать (Google: YouTube отдельно от Workspace → две записи одной почты). По умолчанию пустая. Ядро её не интерпретирует.
3. **`scopes_json`** хранит ключи из каталога scopes вида (`AccountKindDescriptor.scopes`), а не сырые строки провайдера. Покрытие = включение множества.
4. **Account создаётся только по завершении подключения** и сразу `connected`. Записей `pending` нет.
5. **Переподключение** — `start` с `accountId`. Результат обязан совпасть по `(externalAccountId, partition)`, иначе `identity_mismatch`, запись не меняется.
6. **Статусы:** `connected`; `expired` — нужно переподключение (причина в `last_error`); `error` — временная или неопределённая проблема, достаточно проверки. Код ошибки → статус по таблице ядра (§7.2).

### 2.5 Согласованность БД и секретов

Транзакции между SQLite и SecretStore нет, поэтому порядок фиксирован:

- **создание/обновление:** сначала секреты, потом строка. Сбой между шагами оставляет секрет-сироту, а не строку без секрета;
- **удаление:** сначала строка, потом секреты;
- **`secret_fields_json`** — перечень ключей, реально лежащих в SecretStore. Пути чтения vault не сканируют;
- **сверка** (Croner: на старте и по расписанию): удаляет секреты `app:*`/`account:*` без строки-владельца; аккаунт без обязательного секрета переводит в `expired` с `invalid_credentials`; строки с неизвестным видом исключает из выдачи API и фасада и логирует (удаление такой строки по id доступно, без revoke);
- **ротация refresh-токена:** новый набор секретов пишется до возврата вызывающему; при сбое записи аккаунт получает `error` — потерянная ротация не маскируется.

## 3. Дескрипторы — всё, что видит фронтенд

Дескриптор — данные, а не код. Он единственный источник формы, точки входа и справки. Фронт получает их одним запросом (`GET /orgs/:orgId/apps/catalog`).

### 3.1 Поле формы

```ts
// domain/apps/field.ts
export type FieldType = 'text' | 'secret' | 'textarea' | 'url' | 'select' | 'number' | 'boolean';

export interface FieldSpec {
  key: string;                      // [a-zA-Z][a-zA-Z0-9]*; после релиза не меняется
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string;
  help?: string;
  default?: string | number | boolean;
  options?: { value: string; label: string }[];   // только select
  pattern?: { regex: string; hint: string };       // только text | url
  editable?: boolean;               // несекретное поле можно менять после создания
  generated?: boolean;              // только secret: значение создаёт ядро (32 случайных байта), в форме не показывается
}
```

Если способы подключения различаются набором полей (GitHub App против PAT, бот против пользовательского токена) — это **разные виды**, а не условные поля в одном. Условной логики в дескрипторе нет.

### 3.2 Провайдер, App, Account

```ts
// domain/apps/descriptors.ts
export interface ProviderDescriptor {
  id: string;                       // 'slack'
  label: string;
  description: string;
  iconSvg: string | null;           // статичный SVG; фронт рисует через <img src='data:...'>
  docsUrl: string | null;
}

export interface AppKindDescriptor {
  kind: string;                     // начинается с `${provider}-`
  provider: string;
  label: string;
  description: string;
  fields: FieldSpec[];
  help: { steps: string[]; consoleUrl: string | null };   // что сделать в консоли провайдера
  endpoints: Array<'redirectUri' | 'webhookUrl'>;         // какие URL ядра пользователь регистрирует у провайдера
  capabilities: { setup: boolean; verify: boolean; webhook: boolean };  // вычисляет ядро по наличию обработчиков
}

export interface ScopeOption { key: string; label: string; description?: string }

export interface AccountKindDescriptor {
  kind: string;
  provider: string;
  label: string;
  description: string;
  requiresApp: string[];            // виды App, из которых нужен один; [] — приложение не нужно
  inputs: FieldSpec[];              // что спросить до начала подключения (токен, домен магазина, ключ)
  scopes: { options: ScopeOption[]; defaults: string[] };   // пусто — вид не scope-ориентирован
  access: { source: 'stored' | 'derived'; keys: string[] };  // что получает потребитель
  endpoints: Array<'webhookUrl'>;
  capabilities: { revoke: boolean; webhook: boolean };       // вычисляет ядро
}

export interface CatalogResponse {
  providers: Array<ProviderDescriptor & { appKinds: AppKindDescriptor[]; accountKinds: AccountKindDescriptor[] }>;
}
```

Смысл полей, на которых держится универсальность UI:

- `requiresApp` пуст → сразу форма аккаунта; непуст и подходящего App нет → сначала App (§12.3);
- `inputs` пуст → подключение стартует без формы (чистый OAuth);
- `scopes.options` непуст → UI показывает выбор областей;
- `access.source` — `stored`: токен лежит в хранилище и обновляется; `derived`: выпускается из секретов App/Account при каждом обращении (installation token GitHub, client-credentials);
- `help.steps` и `endpoints` — инструкция и значения для копирования (redirect URI, webhook URL).

### 3.3 Представления (DTO)

```ts
export type AccountStatus = 'connected' | 'expired' | 'error';
export type FieldValue = string | number | boolean;

export interface AppView {
  id: string; kind: string; label: string;
  status: 'configured' | 'invalid'; lastError: AccountErrorCode | null;
  values: Record<string, FieldValue>;
  secretFields: string[];                       // только имена, значений нет
  endpoints: { redirectUri?: string; webhookUrl?: string };
  verifiedAt: number | null; createdAt: string; updatedAt: string;
}

export interface AccountView {
  id: string; appId: string | null; kind: string;
  externalAccountId: string; partition: string; label: string;
  status: AccountStatus; lastError: AccountErrorCode | null;
  scopes: string[]; expiresAt: number | null;
  config: Record<string, FieldValue>;
  secretFields: string[];
  endpoints: { webhookUrl?: string };
  verifiedAt: number | null; createdAt: string; updatedAt: string;
}
```

`metadata` в DTO не отдаётся — оно приватно для провайдера. Серверные `AppRecord`/`AccountRecord` — те же поля плюс `metadata: JsonObject`; именно они передаются провайдеру.

Домен владеет TS-типами, `packages/contracts/src/apps.ts` — Zod-схемами тех же форм. Спека `descriptors.contract.spec.ts` проверяет на уровне типов, что `z.infer` каждой схемы равен доменному типу: расхождение не собирается.

### 3.4 Правила дескрипторов

1. Ключи полей и видов после релиза не меняются; наборы полей только растут (новое поле — необязательное или с `default`).
2. Дескриптор не содержит секретов и значений — только имена и подписи.
3. Тексты в дескрипторе — на английском; подписи кодов ошибок и статусов — статическая карта на фронте (§12.6).

## 4. Контракт модуля провайдера

Провайдер — обычный объект, не Nest-класс: всё нужное приходит аргументом `ctx`. Поэтому модуль тестируется без контейнера, а сбоя DI-метаданных нет по конструкции. Один провайдер группирует виды App и виды Account; обработчики привязаны к **виду**, а не к провайдеру (у Slack бот и пользовательский токен — разные потоки и разные доступы).

### 4.1 Модуль

```ts
// domain/apps/provider-module.ts
export interface ProviderModule {
  descriptor: ProviderDescriptor;
  appKinds: readonly AppKindModule[];          // может быть пусто (токен-онли провайдеры)
  accountKinds: readonly AccountKindModule[];  // минимум один
}

export interface AppKindModule {
  descriptor: Omit<AppKindDescriptor, 'capabilities'>;
  secrets: readonly string[];                  // ключи, которые вид вправе хранить
  egress: EgressPolicy;                        // §9.2
  setup?: ConnectHandler<AppSetupResult>;      // автосоздание App (GitHub manifest)
  verify?(ctx: AppVerifyCtx): Promise<void>;   // бросает ProviderError
  webhook?: WebhookHandler;                    // события уровня приложения
  validateMetadata(raw: JsonObject): JsonObject;
}

export interface AccountKindModule {
  descriptor: Omit<AccountKindDescriptor, 'capabilities'>;
  secrets: readonly string[];
  egress: EgressPolicy;
  connect: ConnectHandler<AccountConnectResult>;   // единственный путь создать Account
  verify(ctx: AccountVerifyCtx): Promise<VerifyResult>;
  access?: AccessHandler;                      // обязателен при access.source = 'derived' или при истекающем токене
  revoke?(ctx: RevokeCtx): Promise<void>;      // best-effort при удалении
  webhook?: WebhookHandler;                    // события уровня аккаунта (Stripe, Telegram)
  validateMetadata(raw: JsonObject): JsonObject;
}
```

Семантика:

- `validateMetadata` — единственное место, где ядро спрашивает провайдера о его payload. Вызывается на каждой записи (`connect`, `verify`, обновление); результат сохраняется как есть.
- `capabilities` в дескрипторе вычисляет ядро по наличию обработчиков, провайдер их не декларирует — расхождения «заявил, но не реализовал» невозможны.
- Каждый Account создаётся через `connect`. Вид без интерактива (вставка токена) реализует `connect` через `directConnect(...)` из kit: `start` сразу возвращает `done` после проверки у провайдера.

### 4.2 Контекст

```ts
export interface ProviderCtx {
  http: ProviderHttp;        // §9.1; егресс-политика вида уже применена
  mtproto?: MtprotoLoginPort; // §4.7; есть всегда в собранном ctx, провайдер без MTProto его не читает
  now(): number;
  log: ProviderLogger;       // редактирует секреты и query-параметры
}

export interface SecretReader {                 // видит только заявленные ключи вида
  get(key: string): Promise<string | null>;
  require(key: string): Promise<string>;        // нет ключа → ProviderError('invalid_credentials')
}

export type Credentials = Record<string, string>;
```

### 4.3 Подключение

```ts
interface ConnectBase extends ProviderCtx {
  orgId: string;
  app: AppRecord | null;                  // выбранный App; null, если вид его не требует
  appSecrets: SecretReader | null;
  inputs: Record<string, FieldValue>;     // провалидировано по дескриптору; generated-поля уже заполнены
  scopes: string[];                       // запрошенные ∪ уже выданные (переподключение); ключи каталога
  existing: AccountRecord | null;         // при переподключении
  urls: { redirectUri: string; webhookUrl: string | null };
}
export interface ConnectStartCtx  extends ConnectBase { state: string }   // одноразовый state ядра — в авторизационный URL
export interface ConnectResumeCtx extends ConnectBase { sessionState: JsonObject; params: Record<string, string> }
export interface ConnectPollCtx   extends ConnectBase { sessionState: JsonObject }

export interface ConnectHandler<R> {
  start(ctx: ConnectStartCtx): Promise<ConnectStep<R>>;
  resume?(ctx: ConnectResumeCtx): Promise<ConnectStep<R>>;                       // возврат пользователя с провайдера
  poll?(ctx: ConnectPollCtx): Promise<ConnectStep<R> | { type: 'pending' }>;    // device code
}

export type ConnectStep<R> =
  | { type: 'done'; result: R }
  | { type: 'wait'; launch: Launch; state: JsonObject; ttlSec: number };

export type Launch =
  | { kind: 'redirect'; url: string }
  | { kind: 'html'; html: string; formActionHosts: string[] }   // страница для пользователя (GitHub manifest)
  | { kind: 'device'; userCode: string; verificationUri: string; intervalSec: number }
  | { kind: 'form'; fields: FieldSpec[]; text?: string };       // ввод пользователя у нас в мастере (код логина, 2FA-пароль)

export interface AccountConnectResult {
  externalAccountId: string;
  label: string;
  partition?: string;
  scopes: string[];                       // выданные, в ключах каталога
  secrets: Record<string, string>;        // только ключи из `secrets` вида
  expiresAt: number | null;
  metadata: JsonObject;
}

export interface AppSetupResult {
  label: string;
  values: Record<string, FieldValue>;     // по ключам дескриптора App
  secrets: Record<string, string>;
  metadata: JsonObject;
}
```

Несекретные `inputs` ядро сохраняет в `config` само, по дескриптору. Секреты в хранилище попадают только из `result.secrets` — это решение провайдера, а не магия ядра (Stripe сам кладёт `apiKey` и `webhookSecret`).

Правила `Launch.form` — fail-closed и проверяются при применении `wait`-результата к сессии, а не при статической валидации реестра: поля только `text`/`number`, не `generated`, не `secret`; поле `text` — только отображение, на валидацию не влияет.

### 4.4 Проверка, доступ, отзыв

```ts
export interface AccountVerifyCtx extends ProviderCtx {
  account: AccountRecord; app: AppRecord | null; appSecrets: SecretReader | null;
  mtproto?: MtprotoLoginPort;             // §4.7; verify use-case вводит порт
  credentials: Credentials;               // ядро уже получило их через AccountAccessService (§7.1)
}
export interface VerifyResult {
  identity: { externalAccountId: string; label?: string };
  scopes?: string[];
  metadata?: JsonObject;
}
export interface AppVerifyCtx extends ProviderCtx { app: AppRecord; secrets: SecretReader; mtproto?: MtprotoLoginPort }

export interface AccessCtx extends ProviderCtx {
  account: AccountRecord; app: AppRecord | null; appSecrets: SecretReader | null;
  stored: SecretReader;                   // секреты этого аккаунта
  reason: 'missing' | 'expiring' | 'expired';
  scopes: string[];                       // запрошенные потребителем
}
export interface AccessGrant {
  credentials: Credentials;               // ключи — ровно access.keys вида
  expiresAt: number | null;
  persist?: { secrets: Record<string, string>; scopes?: string[] };   // что записать: новый access, ротированный refresh
}
export interface AccessHandler { resolve(ctx: AccessCtx): Promise<AccessGrant> }
export interface RevokeCtx extends ProviderCtx { account: AccountRecord; app: AppRecord | null; appSecrets: SecretReader | null; stored: SecretReader }
```

`credentials` — словарь именованных частей: `{ accessToken }`, `{ botToken }`, `{ username, password }`, `{ accessKeyId, secretAccessKey, sessionToken }`. Ядро не знает, что внутри; потребитель знает по `access.keys` вида.

### 4.5 Вебхук

```ts
export interface WebhookCtx extends Omit<ProviderCtx, 'http'> {   // сети нет: обработчик только проверяет и разбирает
  target: { type: 'app'; app: AppRecord } | { type: 'account'; account: AccountRecord; app: AppRecord | null };
  secrets: SecretReader;                  // секреты цели; для цели-аккаунта — секреты вида Account и вида App (композитный читатель редиректит по префиксам `account:`/`app:`, чужие ключи читатель не отдаёт)
  request: { method: string; headers: Record<string, string>; query: Record<string, string>; body: Uint8Array };
}
export interface WebhookHandler { handle(ctx: WebhookCtx): Promise<WebhookOutcome> }

export interface WebhookOutcome {
  response: { status: number; body?: string; contentType?: string };   // ack или challenge-ответ
  events?: InboundEvent[];
  effects?: AccountEffect[];
}
export interface AccountRef { kind: string; externalAccountId: string; partition?: string }
export interface InboundEvent { type: string; deliveryId: string; account?: AccountRef; occurredAt?: number; payload: JsonObject }
export interface AccountEffect { account: AccountRef; status: 'expired' | 'error'; error: AccountErrorCode }   // отзыв установки, tokens_revoked
```

### 4.6 Ошибки

```ts
export type AccountErrorCode =
  | 'invalid_credentials' | 'expired' | 'revoked' | 'insufficient_scopes'
  | 'not_found' | 'rate_limited' | 'denied' | 'identity_mismatch'
  | 'invalid_signature' | 'invalid_input' | 'session_expired'
  | 'provider_unavailable' | 'invalid_response' | 'unknown';

export class ProviderError extends Error {
  readonly meta?: { retryAfterSec?: number };
  constructor(readonly code: AccountErrorCode, meta?: { retryAfterSec?: number }) { super(code); this.meta = meta; }
}
```

Провайдер бросает только `ProviderError`; любое другое исключение ядро превращает в `unknown` и логирует без сообщения. Мета опциональна; её носит только провайдер (flood-wait и подобное); фасады ядра переносят её в сессию и в `SessionEvent`. Текст ответа провайдера никуда не попадает. Маппинг «ответ → код» — чистая функция в модуле, покрытая спекой; для типового HTTP есть `classifyHttp` из kit (401 → `invalid_credentials`, 403 → `insufficient_scopes`, 404 → `not_found`, 429 → `rate_limited`, 5xx/timeout/network → `provider_unavailable`, нечитаемое тело → `invalid_response`); API, отвечающие 200 с ошибкой в теле (Slack), переопределяют маппинг своей функцией.

### 4.7 `MtprotoLoginPort` — не-HTTP транспорт (рост §5.4)

Порт в `domain/apps/mtproto-port.ts`, адаптер `infra/apps/mtproto.adapter.ts` (`TeleprotoMtprotoAdapter`, пакет `teleproto`). Провайдер никогда не импортирует `teleproto`.

```ts
export interface MtprotoApiAccess { apiId: number; apiHash: string; session?: string }
export interface MtprotoPhoneCode { phoneCodeHash: string }
export interface MtprotoUserProfile { userId: string; firstName: string | null; lastName: string | null; username: string | null }
export type MtprotoSignInOutcome = { status: 'done'; profile: MtprotoUserProfile } | { status: 'needsPassword' }
export interface MtprotoClient {
  connect(): Promise<void>;
  sendCode(phone: string): Promise<MtprotoPhoneCode>;
  signIn(phone: string, phoneCodeHash: string, code: string): Promise<MtprotoSignInOutcome>;
  signInWithPassword(password: string): Promise<MtprotoSignInOutcome>;
  me(): Promise<MtprotoUserProfile>;
  exportSessionString(): Promise<string>;
  close(): Promise<void>;
}
export abstract class MtprotoLoginPort {
  abstract client(api: MtprotoApiAccess): MtprotoClient;
  abstract probe(apiId: number, apiHash: string): Promise<number>;            // dcId
  abstract probeSession(api: MtprotoApiAccess): Promise<MtprotoUserProfile>;  // проверка живой сессии
}
```

Правила:

- логин stateless по шагам — клиент создаётся на шаг и умирает; состояние (`session`-строка, `phoneCodeHash`) живёт в `providerState` сессии;
- сессия-строка — секрет: хранится с `access.source = 'stored'`, ключ `session`;
- транспорт не HTTP — список хостов (§9.2) MTProto не выражает; границу держит адаптер (только официальные DC Telegram); расширение модели egress на не-HTTP — отдельный PR (§5.4);
- маппинг ошибок — чистая функция в адаптере: flood → `rate_limited` (+ `retryAfterSec` из `seconds`), `unauthorized`/`AUTH_KEY*`/`SESSION_*` → `invalid_credentials`, `PHONE_*`/`PASSWORD_*`/`BAD_*` → `invalid_input`, остальное → `invalid_response`.

## 5. Реестр, загрузка, инструментарий

### 5.1 Единый индекс

```ts
// infra/apps/providers/index.ts — единственный список провайдеров
export const providerModules: readonly ProviderModule[] = [google, github, slack /* … */];
```

Добавление провайдера = каталог модуля + строка здесь. `AppsModule` строит из массива `ProviderRegistryPort` (`all()`, `provider(id)`, `appKind(kind)`, `accountKind(kind)`, `require*` с исключением на неизвестный вид) и карты `kind → модуль` один раз при загрузке.

### 5.2 Валидация при загрузке

Сервер не стартует, если есть хоть одно нарушение; в сообщении — **полный** список нарушений, а не первое:

- `provider.id` соответствует `[a-z][a-z0-9]*` и уникален; виды — `[a-z][a-z0-9-]*`, уникальны среди всех видов App и Account, начинаются с `<provider.id>-`;
- каждый дескриптор проходит Zod-схему; ключи полей уникальны в рамках вида; `select` имеет `options`; `pattern.regex` компилируется; `generated` — только у `secret`; `editable` — не у `secret`;
- `secrets` вида включает все ключи секретных и `generated` полей; ключи уникальны;
- `access.keys` при `stored` ⊆ `secrets`; при `derived` обязателен `access`-обработчик;
- `requiresApp` ссылается на существующие виды App;
- `scopes.defaults` ⊆ ключей `scopes.options`;
- `egress`: паттерны хостов корректны; `userHost.field` существует среди полей вида;
- `endpoints` содержит `webhookUrl` тогда и только тогда, когда у вида есть `webhook`-обработчик.

### 5.3 Что вычисляет ядро

`capabilities` для дескрипторов (`setup`, `verify`, `webhook`, `revoke`) и обогащённый каталог для фронта. Больше ядро ничего о провайдере не «знает»: любое поведение достаётся из модуля по `kind`.

### 5.4 Расширение контракта

Контракт растёт только аддитивно. Это правило определяет, остаётся ли добавление провайдера одним PR.

**Допустимо, не трогая существующих провайдеров:** новый член union (`AccountErrorCode`, `Launch`, `FieldType`); новое необязательное поле в контексте, результате или дескрипторе с безопасным значением по умолчанию; новый необязательный обработчик в модуле; новый необязательный член `ProviderCtx` (например, `net` для не-HTTP протоколов с той же егресс-политикой).

**Запрещено в PR провайдера:** новый обязательный член интерфейса, смена семантики или удаление существующего.

**Порядок при нехватке контракта:** PR 1 — расширение (ядро, при необходимости фронт-рендерер нового `FieldType`/`Launch`, конформанс; все существующие провайдеры зелёные и неизменны); PR 2 — провайдер, использующий расширение. Это единственная законная причина, по которой добавление провайдера затрагивает ядро.

### 5.5 Kit провайдера

`infra/apps/providers/_kit/` — общий код, не знающий ни одного провайдера. Провайдер вправе им не пользоваться.

| Файл | Назначение |
| --- | --- |
| `define.ts` | `defineProvider/defineAppKind/defineAccountKind`: проверка формы и `Object.freeze`, без логики |
| `direct-connect.ts` | `directConnect(fn)` — `ConnectHandler`, который завершается в `start` |
| `oauth2.ts` | сборка авторизационного URL (state, PKCE S256), обмен кода, refresh, нормализация ответа токена; параметры: endpoints, стиль клиентской аутентификации (`body` / `basic`), доп. параметры, склейка scopes |
| `pkce.ts`, `jwt.ts` | PKCE; подпись app-JWT (RS256/ES256) |
| `signature.ts` | HMAC SHA-256 (hex/base64), сравнение за постоянное время, допуск по timestamp |
| `http-classify.ts` | `classifyHttp` |
| `scopes.ts` | двустороннее отображение «ключ каталога ↔ строка провайдера» |

Изменения kit подчиняются §5.4.

## 6. Подключение

Один механизм для всего: OAuth, установка приложения, manifest, device code, вставка токена, создание App автоматически. Различия живут в `ConnectHandler` вида; ядро и UI от способа не зависят.

### 6.1 Точка входа

```ts
// POST /orgs/:orgId/connect/start
interface ConnectStartBody {
  target: 'app' | 'account';
  kind: string;
  appId?: string;                    // для вида Account с requiresApp
  accountId?: string;                // переподключение / расширение scopes
  inputs?: Record<string, FieldValue>;
  scopes?: string[];                 // ключи каталога
}

type ConnectStartResponse =
  | { status: 'completed'; target: 'app' | 'account'; id: string }              // прямые виды: вставка токена
  | { status: 'pending'; sessionId: string; launch: LaunchView; expiresAt: number };

type LaunchView =
  | { kind: 'redirect'; url: string }
  | { kind: 'page'; url: string }                                              // одноразовый /api/apps/connect/launch/<token>
  | { kind: 'device'; userCode: string; verificationUri: string; intervalSec: number };

type SessionEvent =
  | { status: 'pending' }
  | { status: 'completed'; target: 'app' | 'account'; id: string }
  | { status: 'failed'; error: AccountErrorCode; retryAfterSec?: number };

// POST /orgs/:orgId/connect/sessions/:id/resume — ввод пользователя на form-шаге
interface ConnectResumeBody { inputs: Record<string, FieldValue> }
interface ConnectResumeResponse { session: SessionEvent; launch?: LaunchView }
```

Ошибки старта: `404` — неизвестный вид; `422 { error: 'invalid_fields', fields: { <key>: 'required' | 'pattern' | 'type' | 'option' | 'unknown' } }` — поля вне дескриптора отклоняются; `409 app_required` — вид требует App, а `appId` не передан или не подходит по виду/организации.

### 6.2 Шаги ядра на `start`

1. Резолв вида через реестр; `target` должен соответствовать (`app` — только виды с `setup`).
2. Для Account с `requiresApp`: `appId` принадлежит организации, вид App входит в `requiresApp`. Для переподключения — `accountId` принадлежит организации и совпадает по виду.
3. Валидация `inputs` по дескриптору (обязательность, тип, `pattern`, `options`, неизвестные ключи — отказ); заполнение `generated`-полей.
4. Расчёт `scopes`: запрошенные ∪ уже выданные (при переподключении), все обязаны быть ключами каталога вида.
5. Создание сессии (state — 32 случайных байта, base64url) и сборка `ConnectStartCtx` (`http` — по егресс-политике вида; `urls.redirectUri` — единый callback §6.6).
6. `handler.start(ctx)`: `done` → финализация (§6.3), ответ `completed`; `wait` → сессия получает `state` провайдера и TTL, ответ `pending` (`html` превращается в одноразовый URL страницы).

Для `target: 'app'` `appId` генерируется до сборки ctx, чтобы id существовал в setup-контексте. `urls.webhookUrl` в setup-контексте передаётся, только когда `endpoints` вида объявляет `webhookUrl` и базовый URL публичный (https); иначе провайдер получает `null` — GitHub-манифест опускает `hook_attributes`.

### 6.3 Финализация (одна для App и Account)

Вызывается из `start`, `resume` и `poll`, когда обработчик вернул `done`.

- Проверка результата (fail-closed): ключи `secrets` ⊆ `secrets` вида, обязательные секреты присутствуют, `scopes` ⊆ каталога, `validateMetadata(result.metadata)`.
- Account: App существует (если требуется); upsert по `(kind, externalAccountId, partition)` — при переподключении идентичность обязана совпасть с `existing`, иначе `identity_mismatch`; scopes объединяются; несекретные `inputs` → `config`; секреты → хранилище; затем строка (§2.5); статус `connected`, `lastError = null`, `verifiedAt = now`.
- App (setup): значения по ключам дескриптора, секреты, статус `configured`.
- Событие `account.connected` / `app.created` (§11), сброс кэша доступа, результат в сессию (`completed` + `id`).

### 6.4 Сессии

`ConnectSessionStorePort` — адаптер в памяти.

| Поле | Смысл |
| --- | --- |
| `id`, `state` | `state` одноразовый; `id` отдаётся клиенту |
| `orgId`, `principalId` | владелец; чужая организация/пользователь сессию не видит |
| `target`, `kind`, `appId`, `accountId` | контекст подключения |
| `inputs`, `scopes` | то, с чем стартовали (живут только в памяти сессии) |
| `providerState` | JSON провайдера (PKCE verifier и т. п.), ядро его не читает |
| `launchFormFields`, `launchFormHosts` | поля form-запуска и CSP-хосты html-запуска актуального шага |
| `resumeCount` | счётчик отправок формы (кап §6.5) |
| `retryAfterSec` | cooldown, полученный от провайдера |
| `status`, `result`, `expiresAt` | `pending` → `completed`/`failed(code)` |

TTL задаёт провайдер в `wait.ttlSec` (по умолчанию 600 с, максимум 3600). Завершённые сессии держатся ещё 120 с ради подписчика SSE. Не более 20 живых сессий на организацию. Reaper — Croner, раз в 30 с. Рестарт сервера обрывает незавершённые подключения: пользователь запускает заново; секреты в БД из сессий не попадают — это сделано намеренно. Порт имеет `watch(id, cb)` — SSE-подписка опирается на него (store в памяти, подписка process-local).

### 6.5 Завершение без опроса

- Возврат с провайдера → `resume` (§6.6). Device code → сервер сам вызывает `poll` по `intervalSec` (серверный таймер, учитывает `slow_down`-подобные ответы провайдера через `pending`) до `done`, ошибки или TTL.
- `GET /orgs/:orgId/connect/sessions/:id/events` — SSE: первое событие — текущее состояние (поэтому переподписка после обрыва безопасна), затем `pending → completed|failed`; heartbeat раз в 15 с; поток закрывается на терминальном состоянии. `GET /orgs/:orgId/connect/sessions/:id` — одно чтение того же состояния.
- `DELETE /orgs/:orgId/connect/sessions/:id` — отмена (сессия удаляется, state гасится).

**Форма: продолжение без редиректа.** `POST /orgs/:orgId/connect/sessions/:id/resume` — общий вход для `Launch.form`. Ограничения: сессия владельца, статус `pending`, launch kind = `form`; иначе `404`. `inputs` валидируются по полям запуска тем же правилом, что и на `start` (`422 invalid_fields`). Исполнитель общий с callback (`ConnectResumeExecutor`, порты `ConnectContextPort`/`ConnectFinalizePort`): `done` → финализация → `completed`; `wait` → сессия продолжается; `ProviderError` → `failed` (± `retryAfterSec`). Кап — 25 отправок на сессию; счётчик растёт на каждой отправке, включая `422` (защита от перебора кодов); превышение → `failed session_expired`. Просроченная сессия (за TTL) не `404`: помечается `failed session_expired` с keep-alive 120 с, клиент показывает expiry. Ответ инлайновый `{ session, launch? }` — SSE несёт только статус; следующий form-шаг рендерится из ответа; изменение сессии шлёт `notify()` подписчикам SSE как обычно. Неверный код/пароль провайдер обрабатывает сам, возвращая новый `wait` с той же формой; сессия становится `failed` только по истёкшему TTL или по необработанному `ProviderError`.

### 6.6 Единый callback

`GET|POST /api/apps/oauth/callback` — публичный, один на все провайдеры. POST нужен для `response_mode=form_post`. Провайдер определяется **по сессии**, найденной по `state`, а не по пути — поэтому добавление провайдера не добавляет маршрут, а redirect URI у каждого App один и тот же.

1. `state` отсутствует/неизвестен/просрочен → страница результата с `session_expired`; провайдерский код не вызывается.
2. Сессия помечается использованной (повтор того же `state` невозможен), вызывается `resume` с `params` (query или form-body).
3. `resume` вернул `done` → финализация; `wait` → сессия продолжается (многошаговые потоки); `ProviderError` → сессия `failed(code)`.
4. Ответ — статичная страница «Окно можно закрыть» с кодом результата без текста провайдера и без отражения параметров; заголовки `Cache-Control: no-store`, `Referrer-Policy: no-referrer`, строгий CSP.

Политика пиров (например, только loopback в локальной установке) — флаг конфигурации сервера, а не код провайдера.

### 6.7 Страница запуска

`Launch.kind = 'html'` — когда провайдеру нужна страница с формой (GitHub manifest: POST манифеста на github.com). Ядро сохраняет HTML в сессии и отдаёт по `GET /api/apps/connect/launch/:token` (одноразовый токен, TTL сессии). Заголовки: CSP `default-src 'none'; style-src 'unsafe-inline'; form-action <formActionHosts>; script-src 'nonce-<n>'` — ядро подставляет nonce вместо `{{nonce}}` в HTML провайдера; `Referrer-Policy: no-referrer`; `Cache-Control: no-store`.

## 7. Доступ к учётным данным, проверка, статусы

### 7.1 `AccountAccessService` — единственный владелец жизненного цикла токена

Провайдер умеет только говорить с внешним API; когда обновлять и куда писать, решает ядро.

```
access(orgId, accountId, { scopes? }) → { credentials, expiresAt }
 1. account и вид найдены, иначе not_found / fail-closed.
 2. status = expired → бросить AccountAccessError(lastError). status = error → пробуем дальше.
 3. scopes запрошены и не покрыты → insufficient_scopes (с перечнем недостающих).
 4. Кэш жив (expiresAt - 60 с > now) → вернуть.
 5. access.source = 'stored':
      нет handler, либо expiresAt = null, либо токен жив → credentials = stored[access.keys].
      иначе single-flight(accountId): handler.resolve(reason).
    access.source = 'derived': single-flight(accountId): handler.resolve('missing').
 6. Есть persist → секреты и типизированные поля (expires_at, scopes) записываются ДО возврата (§2.5).
 7. Кэш в памяти до expiresAt - 60 с; аудит (кто, аккаунт, исход, без значений).
 8. ProviderError → статус по §7.2, last_error = код, исключение вызывающему.
```

Single-flight — карта `accountId → Promise`: параллельные вызовы ждут один refresh. Кэш сбрасывается событиями обновления/удаления/переподключения аккаунта. Расхождение «секрет обновлён, срок протух» невозможно: срок — типизированная колонка, единственный писатель — этот сервис.

### 7.2 Код ошибки → статус

Таблица живёт в ядре как данные типа `Record<AccountErrorCode, AccountStatus | null>`: добавить код без маппинга не даст компилятор.

| Код | Статус |
| --- | --- |
| `invalid_credentials`, `expired`, `revoked`, `insufficient_scopes` | `expired` (нужно переподключение) |
| `rate_limited`, `provider_unavailable`, `invalid_response`, `not_found`, `unknown`, `identity_mismatch` | `error` (проверить позже) |
| `denied`, `invalid_signature`, `invalid_input`, `session_expired` | `null` — к статусу аккаунта не относятся (подключение, вебхук) |

### 7.3 Проверка (`verify`)

1. `credentials` ← `access()` (его ошибки обрабатываются по §7.1–7.2, `verify` провайдера не вызывается).
2. `module.verify(ctx)` под семафором (не более 8 параллельно) с общим таймаутом 15 с.
3. `identity.externalAccountId` ≠ сохранённому → `identity_mismatch`, ничего больше не пишется.
4. `validateMetadata(result.metadata)`; запись `status = connected`, `lastError = null`, `verifiedAt`, `metadata`, `scopes` (только ключи каталога). `label` при проверке не перезаписывается.
5. `ProviderError` → статус по §7.2.

Проверка App (`verify` вида App) ставит `configured` / `invalid` + `lastError`; вид без `verify` получает `configured` после валидации полей. **Статус ставит только результат реальной проверки у провайдера или валидации полей — не клиент.**

### 7.4 `report`

Потребитель увидел 401/403 от провайдера и сообщает код. Ядро применяет ту же таблицу §7.2 и сбрасывает кэш; к провайдеру не обращается.

### 7.5 Удаление

- Account: `AccountHolderPort.holders()` (§11.3) непуст → `409 account_referenced` со списком держателей; иначе `revoke` провайдера (best-effort, таймаут 5 с, сбой логируется и не блокирует) → строка → секреты → событие → сброс кэша.
- App: если у любого его Account есть держатели — `409`; иначе revoke и удаление всех его Account, затем App и его секреты. Молчаливого удаления используемой записи нет нигде.

## 8. Вебхуки

### 8.1 Адресация

URL выдаёт ядро и показывает в `endpoints.webhookUrl` App/Account:

```
/api/apps/hook/:orgId/apps/:appId
/api/apps/hook/:orgId/accounts/:accountId
```

Организация и цель известны из пути, поэтому **глобальный индекс идентичности не нужен**: вебхук не перебирает организации и не лезет в чужие базы. Подходит любому провайдеру, у которого URL задаётся на стороне нашей регистрации: у каждого App/Account он свой.

### 8.2 Конвейер

1. Организация/цель не найдены, у вида нет `webhook` → `404` (одинаково, без утечки причин).
2. Тело читается как байты, лимит 1 MiB; лимит частоты по `(ip, цель)` (token bucket в памяти).
3. Сборка `WebhookCtx` (без `http`; `SecretReader` цели — для цели-аккаунта читатель объединяет ключи вида Account и вида App, §4.5) и `handler.handle` под таймаутом 2 с.
4. `ProviderError('invalid_signature')` → `401`; `invalid_input` → `400`; прочее → `503` без деталей (провайдеры ретраят). Успех → `response` обработчика уходит немедленно (ack, challenge-ответ Slack/Discord/Graph и т. п.).
5. Уже после ответа: дедупликация `(цель, deliveryId)` (LRU, TTL 10 мин); `effects` применяются по §7.2 (отзыв установки → `expired`/`revoked`); `AccountRef` резолвится в `accountId` через уникальный индекс аккаунтов организации; `InboundEventPort.publish(orgId, envelope)`.
6. Событие, чей аккаунт не найден (удалён), отбрасывается с метрикой.

```ts
export interface InboundEnvelope {
  orgId: string; appId: string | null; accountId: string | null;
  kind: string; event: InboundEvent;
}
export abstract class InboundEventPort { abstract publish(orgId: string, e: InboundEnvelope): Promise<void> }
```

Порт реализует платформа аддонов; в Apps/Accounts есть реализация по умолчанию (журналирует и отбрасывает). Подписки у провайдера (`setWebhook`, Graph subscriptions, endpoints в Stripe) регистрирует и продлевает аддон. Секрет проверки для токен-онли видов (Telegram `secret_token`, Stripe `whsec`) — `generated`/секретное поле вида, аддон получает его через `access.keys`.

## 9. HTTP, секреты, безопасность, наблюдаемость

### 9.1 `ProviderHttp`

```ts
export interface HttpRequest {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  query?: Record<string, string>;
  headers?: Record<string, string>;
  body?: { json: unknown } | { form: Record<string, string> } | { raw: string | Uint8Array; contentType: string };
  basicAuth?: { user: string; pass: string };
  timeoutMs?: number;                 // ≤ 10000, по умолчанию 10000
}
export type HttpOutcome =
  | { kind: 'ok' | 'http_error'; status: number; headers: Record<string, string>; text: string; json: unknown | null }
  | { kind: 'timeout' } | { kind: 'network_error' } | { kind: 'blocked' } | { kind: 'too_large' };
export interface ProviderHttp { send(req: HttpRequest): Promise<HttpOutcome> }   // не бросает
```

Правила адаптера `infra/http/provider-http.adapter.ts`: ноль ретраев; лимит ответа 2 MiB; редиректы не выполняются (3xx — `http_error`); Authorization, Cookie и query-ключи `token|code|secret|key|signature` редактируются в логах, тела не логируются.

### 9.2 Егресс-политика

```ts
export interface EgressPolicy {
  hosts: string[];                    // точные хосты или '*.example.com'
  userHost?: { field: string; suffixes?: string[]; allowPrivate: boolean };   // хост берётся из поля формы
}
```

Фиксированные хосты — для SaaS (`oauth2.googleapis.com`, `slack.com`). `userHost` — для провайдеров с адресом пользователя: домен магазина (`suffixes: ['.myshopify.com']`), self-hosted GitLab/Jira/Mattermost (`allowPrivate: true`). Адаптер: только `https` (`http` — лишь для loopback при `allowPrivate`); домен резолвится под политикой, приватные/loopback/link-local/metadata-адреса блокируются до запроса, если не `allowPrivate`; но соединение выполняется по имени хоста — rebinding-окно между проверкой и соединением остаётся; pinning требует кастомного dispatcher'а в Bun и добавления зависимости — решение отложено, окно сужено, не закрыто; нарушение → исход `blocked`. Политику вида ядро применяет при сборке `ctx.http`, провайдер её обойти не может. Для не-HTTP транспорта (§4.7) список хостов не применим — границу формирует адаптер транспорта.

### 9.3 Секреты

`SecretReader` — обёртка над `SecretStorePort` с префиксом цели и белым списком ключей `secrets` вида; чтение чужого или незаявленного ключа — исключение. Писать секреты может только ядро (финализация, persist, ротация из UI). Ротация секретов App/Account из UI: `PATCH` с `secrets: { key: string | null }` (строка — заменить, `null` — удалить необязательное); смена Account-секрета, влияющего на идентичность, идёт через переподключение.

### 9.4 Безопасность

- `state` одноразовый, привязан к сессии; PKCE S256 по умолчанию в kit; callback не отражает параметры.
- HTML запуска — под CSP из §6.7; страница callback статична.
- SSE и сессии — `OrgAccessGuard` плюс проверка владельца сессии.
- Вебхуки: сравнение подписей за постоянное время (kit), допуск по timestamp там, где его требует провайдер, лимит тела и частоты.
- Все ответы с сессиями и учётными данными — `Cache-Control: no-store`.
- Спека-канарейка: известный секрет, прогнанный через все сценарии тестового провайдера, не встречается ни в DTO, ни в логах, ни в событиях, ни в тексте ошибок.

### 9.5 Наблюдаемость

`MetricsPort` (счётчики и гистограммы) с метками `provider`, `kind`, `outcome`: `apps_connect_total`, `apps_verify_total`, `apps_verify_seconds`, `apps_access_renew_total`, `apps_webhook_total`, `apps_http_total`. `outcome` — всегда `AccountErrorCode` или `ok`. Структурные логи без секретов; на старте — сводка реестра (провайдеры, виды, capabilities). По метрикам видно, какой провайдер деградировал, без чтения логов.

## 10. REST API

Контроллеры тонкие: разбор запроса → use-case → DTO. Все приватные маршруты — под `OrgAccessGuard`. Формат ошибки: `{ error: <код>, fields?, holders? }`.

### 10.1 Приватные (`/orgs/:orgId/…`)

| Метод и путь | Назначение |
| --- | --- |
| `GET /apps/catalog` | `CatalogResponse`: провайдеры, виды App и Account |
| `GET /apps?kind=` · `GET /apps/:appId` | список и карточка App (`AppView`) |
| `POST /apps` | ручное создание App: `{ kind, label, values, secrets }`; валидация по дескриптору; `verify` вида, если есть |
| `PATCH /apps/:appId` | `{ label?, values?, secrets?: { key: string \| null } }`; перепроверка |
| `DELETE /apps/:appId` | каскад по §7.5; `409 account_referenced` со списком держателей |
| `POST /apps/:appId/verify` | проверка App |
| `GET /accounts?kind=&appId=&status=&scopes=` · `GET /accounts/:accountId` | список и карточка Account (`AccountView`) |
| `PATCH /accounts/:accountId` | `{ label?, config? }` — только поля `editable` и не секреты; неизвестные и секретные ключи — `422` |
| `DELETE /accounts/:accountId` | §7.5 |
| `POST /accounts/:accountId/verify` | §7.3; ответ `{ account }` |
| `POST /connect/start` | §6.1; **единственный путь создать Account** и автосоздать App |
| `POST /connect/sessions/:id/resume` | ввод пользователя на form-шаге (§6.5) |
| `GET /connect/sessions/:id` · `GET …/events` (SSE) · `DELETE …/:id` | состояние, поток, отмена (§6.5) |

`POST /accounts` отсутствует намеренно: Account без проверки у провайдера не создаётся. Для App ручное создание (`POST /apps`) и автосоздание (`connect/start` с `target: 'app'`) — два входа в одну сущность. Несекретные поля неизменяемы после создания, если не помечены `editable`; секреты можно заменять всегда.

### 10.2 Публичные (`/api/apps/…`)

| Метод и путь | Назначение |
| --- | --- |
| `GET\|POST /oauth/callback` | единый возврат с провайдера (§6.6) |
| `GET /connect/launch/:token` | одноразовая страница запуска (§6.7) |
| `GET\|POST\|PUT\|PATCH\|DELETE /hook/:orgId/apps/:appId` · `GET\|POST\|PUT\|PATCH\|DELETE /hook/:orgId/accounts/:accountId` | вебхуки (§8) |

Роутер без `ANY` — методы объявлены явно, прочие возвращают `404`. Новый провайдер не добавляет ни одного маршрута.

## 11. Фасад для аддонов, события, целостность

Apps/Accounts не содержит бизнес-логики; аддоны потребляют его через узкий фасад. Как платформа аддонов оборачивает фасад в свой протокол и проверяет гранты — её задача.

### 11.1 Фасад

```ts
// application/apps/accounts-facade.port.ts
export abstract class AccountsFacadePort {
  abstract find(orgId: string, q: { kind?: string; appId?: string; scopes?: string[]; connectedOnly?: boolean }): Promise<AccountView[]>;
  abstract get(orgId: string, accountId: string): Promise<AccountView | null>;
  abstract access(orgId: string, accountId: string, opts?: { scopes?: string[] }): Promise<{ credentials: Credentials; expiresAt: number | null }>;
  abstract report(orgId: string, accountId: string, code: AccountErrorCode): Promise<void>;     // §7.4
  abstract subscribe(orgId: string, handler: (e: AccountEvent) => void): () => void;
}
```

`find` со `scopes` возвращает аккаунты, покрывающие набор. Недостаток scopes проявляется в `access` как `insufficient_scopes`; UI предлагает доподключить (`connect/start` с `accountId` и `scopes`).

### 11.2 События

`AccountEventPort`: `app.created|updated|deleted`, `account.connected|updated|status_changed|removed` с `orgId`, `appId`/`accountId`, `kind`, `status`. Без секретов и без `metadata`. Доставка в процессе, без гарантий повтора: потребитель на старте читает состояние через `find`.

### 11.3 Целостность ссылок

```ts
export abstract class AccountHolderPort {      // реализаций несколько; платформа аддонов регистрирует свою
  abstract holders(orgId: string, accountId: string): Promise<Array<{ holderType: string; holderId: string; label: string }>>;
}
```

`delete-account` и `delete-app` опрашивают все зарегистрированные реализации. Таблицы ссылок в Apps/Accounts нет: привязку «аддон использует аккаунт» хранит тот, кто её создаёт.

## 12. Фронтенд

### 12.1 Принципы и структура

- Один раздел `apps/webui/src/features/manage-apps/**`. Ни провайдерных файлов, ни строк с именами провайдеров, ни иконок в бандле: всё из каталога.
- Серверное состояние — TanStack Query; состояние мастера — локальный reducer. Опроса нет: завершение подключения приходит по SSE.
- Добавление провайдера не требует ни одной правки фронта.

```
features/manage-apps/
  api/       apps-client.ts, connect-events.ts (EventSource), query-keys.ts, hooks.ts
  model/     catalog.ts (селекторы), plan-connect.ts, connect-machine.ts, field-validation.ts, error-text.ts
  ui/fields/ FieldRenderer.tsx (закрытый набор управлений в одном файле)
  ui/        ProviderCard (провайдер, его Apps и Accounts в одном компоненте), StatusBadge, EndpointsHelp
  ui/connect/ ConnectDialog, StepApp, StepPickApp, StepInputs, ScopePicker, LaunchPanel, StepDone
  ui/picker/ AccountPicker.tsx
  index.ts   публичный API: AppsPane, AccountPicker
```

Клиент — `shared/api/apps.ts` поверх схем `packages/contracts/src/apps.ts`; текущие `apps-pane/app-form/account-form` заменяются.

### 12.2 Данные

- Каталог грузится один раз за сессию и кэшируется; `iconSvg` рендерится как `<img src='data:image/svg+xml,…'>` (скрипты в `img` не исполняются).
- Чистые селекторы: `kindIndex`, `accountKindsOf(provider)`, `appKindsFor(accountKind)`, `candidateApps(apps, accountKind)`.
- SSE-подписка на сессию: первое событие — снимок состояния, поэтому автопереподключение `EventSource` безопасно.

### 12.3 Мастер подключения

Шаги выводятся из дескрипторов чистой функцией `planConnect(accountKind, apps, reconnect?)`:

```
steps = []
если accountKind.requiresApp непуст:
    нет подходящих App    → step 'app'      (выбор вида, если их несколько; форма + справка)
    несколько App         → step 'pick-app'
если accountKind.inputs непуст         → step 'inputs'
если accountKind.scopes.options непуст → step 'scopes'
step 'connect'
```

- **`app`**: форма по `AppKindDescriptor.fields`, рядом `help.steps` и `consoleUrl`. На не созданном App вместо `EndpointsHelp` — пометка, что значения `endpoints` появятся после создания приложения (`EndpointsHelp` рендерится на созданных App). Если у вида `capabilities.setup`, основная кнопка — «Создать автоматически» (`connect/start` с `target: 'app'`; единым `connect/start.inputs` отправляются и несекретные значения, и введённые секреты — у setup ctx только `inputs`), ручное создание (`POST /apps`) — вторичный вход, сохраняет `values` и `secrets` раздельно.
- **`inputs`**: `DescriptorForm` по `accountKind.inputs`.
- **`scopes`**: `ScopePicker` — чекбоксы из `scopes.options`, `defaults` отмечены; при переподключении уже выданные заблокированы.
- **`connect`**: `POST connect/start` → `completed` сразу в `done`; `pending` → `LaunchPanel`: `redirect`/`page` — `window.open(url)`, окно открывается один раз; если popup заблокирован — кнопка-ссылка остаётся; `device` — код, ссылка и копирование; `form` — рендер по полям запуска, отправка на `resume` (§6.5), инлайновый ответ `{ session, launch? }` рендерит следующий шаг; `failed` с `retryAfterSec` показывает отсчёт cooldown. Подписка на SSE сессии.
- После `app`-шага мастер автоматически переходит к шагам Account.
- Закрытие мастера отменяет сессию (`DELETE`).

| Состояние | Событие | Следующее |
| --- | --- | --- |
| `planning` | шаги вычислены | первый шаг |
| `step(app)` | App создан | следующий шаг |
| `step(inputs/scopes)` | валидная отправка | следующий шаг |
| `starting` | ответ `completed` | `done` |
| `starting` | ответ `pending` | `waiting` |
| `waiting` | SSE `completed` | `done` (инвалидация запросов) |
| `waiting` | SSE `failed(code)` | `failed` |
| `failed` | повтор | `starting` |
| любое | отмена | закрыто (`DELETE` сессии) |

Переподключение запускается из строки аккаунта: тот же мастер с `accountId`, `scopes` = выданные, секретные поля пустые; `planConnect` возвращает только шаг `connect`.

### 12.4 Рендер полей

`FieldRenderer` выбирает компонент по `type` — закрытый набор, не по провайдеру. `secret`: поле пароля с переключателем показа, `autocomplete=off`, не предзаполняется; в режиме правки — «задан» + «Заменить»; `generated` не показывается. Клиентская валидация `buildValidator(fields)` строится из дескриптора (обязательность, `pattern`, `url`, `number`, `options`); авторитетна серверная: `422 invalid_fields` раскладывается по полям. Подсказки — `placeholder`, `help`.

### 12.5 Списки и действия

`AppsPane`: карточка провайдера (иконка, описание, ссылка на документацию) → блок App (статус, `EndpointsHelp`) и блок Account (label, `externalAccountId`, бейдж статуса, чипы scopes с подписями из каталога, срок токена, время проверки). Действия: **Подключить** (по виду; меню, если у провайдера несколько видов), **Проверить** (`verify`), **Переподключить** (при `expired`/`error` и для расширения scopes), **Изменить** (label и `editable`-поля), **Удалить** (подтверждение; при `409` — список держателей и предложение сначала отключить их). Пустые состояния и тексты — из дескрипторов.

### 12.6 Тексты ошибок

`error-text.ts`: `Record<AccountErrorCode, { title: string; hint: string; action: 'reconnect' | 'retry' | 'none' }>` — тип-запись делает карту исчерпывающей: новый код без текста не компилируется. Тексты английские; коды стабильны, тексты — нет. Аналогичная карта — для кодов полей (`required`, `pattern`, `type`, `option`, `unknown`). Текст провайдера в UI не попадает никогда.

### 12.7 Выбор аккаунта в аддонах

```ts
<AccountPicker kinds={['google-account']} scopes={['calendar']} value={id} onChange={setId} allowCreate />
```

Компонент показывает подходящие подключённые аккаунты (`GET /accounts?kind=…&scopes=…`), неподходящие — недоступными с причиной, и по «Подключить новый» открывает тот же мастер. Страница аддона с секцией `connections` использует его, поэтому аддон не заводит вторую форму с теми же полями. Мультивидовые pickers запрашивают список аккаунтов организации и фильтруют годность по набору `kinds` на клиенте (сервер фильтрует по одному `kind`); для однокиндового вызывающего авторитетен серверный фильтр `?kind=`.

### 12.7.1 Проверки фронта

- `scripts/check-provider-names.ts` (`bun run check:provider-names`) выводит список токенов из каталога `providers/**` (включая `__fixtures__`; родовые токены вроде `webhook` — в блок-листе) и case-insensitively ищет их в `domain`, `application`, `api`, `apps/webui` (кроме легаси-зон §14.1 и задокументированных исключений): пусто.
- В разделе нет `setInterval` и `refetchInterval` по статусу подключения.
- Юнит-спеки чистой модели: `planConnect`, `connect-machine`, `buildValidator`, селекторы — на фикстуре каталога тестового провайдера; фикстура коммитится в репозиторий, скрипт проверки дрейфа фикстуры от реестра остаётся гейтом — реализация отложена.

## 13. Прогон контракта на десяти провайдерах

Проверка на бумаге: ложится ли каждый провайдер на контракт без правок ядра.

| Провайдер | App → Account | Подключение | Доступ | Вебхук |
| --- | --- | --- | --- | --- |
| **Google** | `google-oauth-client` → `google-account` | OAuth code + PKCE; каталог scopes (calendar, gmail, drive…); `partition` разводит YouTube и Workspace | `stored`, refresh по refresh-токену; `revoke` | — |
| **GitHub** | `github-app` (`setup`: manifest) → `github-installation` | manifest через `Launch.html`; затем редирект на установку с `state`, `resume` принимает `installation_id` | `derived`: app-JWT → installation token, кэш по `expiresAt` | уровень App: подпись `X-Hub-Signature-256`; удаление установки → `effect` `expired` |
| **Slack** | `slack-app` → `slack-bot`, `slack-user` | OAuth v2; бот и пользовательский токен — разные виды с разными scopes | `stored`; ротация токенов (если включена) — через `persist` | уровень App: подпись с timestamp; challenge `url_verification` в `response`; `tokens_revoked` → `effect` |
| **Notion** | `notion-integration` → `notion-workspace`; `notion-internal-token` без App | OAuth, клиентская аутентификация `basic` в `oauth2.ts`; либо вставка токена | `stored` | — |
| **Microsoft 365** | `microsoft-app` (поле `tenant`) → `microsoft-account`, `microsoft-service` | OAuth code + PKCE, при необходимости `form_post` (POST callback); `service` — client credentials без интерактива | `stored` + refresh; `service` — `derived` | challenge с `validationToken` в `response` |
| **Atlassian** | `atlassian-app` → `atlassian-account` | OAuth 3LO с `offline_access` | `stored`, refresh с ротацией: новый refresh-токен обязан попасть в `persist` | — |
| **Shopify** | `shopify-app` → `shopify-store` | `inputs`: домен магазина до старта; `resume` проверяет HMAC параметров callback | `stored` | уровень App: HMAC тела |
| **Stripe** | — → `stripe-api-key` | вставка `apiKey` и `webhookSecret` (оба секретные) | `stored` | уровень Account: подпись с timestamp |
| **Telegram** | `telegram-app` (apiId/apiHash) → `telegram-bot`, `telegram-user` | бот: вставка `botToken`; user: телефон → код/2FA-пароль через form-запуск и MTProto (§4.7); идентичность: `getMe` у бота, профиль у пользователя | `stored`: bot token; user — живая `session`-строка из SecretStore | бот: заголовок secret token (Account); user: — |
| **Discord** | `discord-app` (public key) → `discord-bot` | вставка `botToken`; App нужен для interactions | `stored` | уровень App: подпись Ed25519 (не HMAC — проверка в обработчике вида), ответ на PING |

Пограничный случай: IMAP/SMTP и прочие не-HTTP протоколы. Дескрипторы, `connect`, `access`, егресс (`userHost` для адреса сервера) ложатся как есть; сетевой доступ добавляется необязательным `ctx.net` (§5.4) без правок существующих провайдеров; MTProto-логин — через `ctx.mtproto` (§4.7).

Что прогон потребовал от фундамента, и всё это уже заложено выше:

1. Обработчики на уровне **вида**, а не провайдера (Slack, Microsoft, GitHub).
2. Поля до старта подключения (`inputs`: Shopify) и каталог scopes (Google).
3. Виды запуска (`redirect`, `html`, `device`, `form`) и callback как `GET|POST` (Microsoft `form_post`).
4. `derived`-доступ и `AccessGrant.persist` для ротации refresh-токена (GitHub, Microsoft service, Atlassian).
5. Вебхуки двух уровней (App и Account), ответы-challenge, `effects` отзыва доступа.
6. `partition`, `generated`-секреты, егресс с адресом из поля формы.
7. Интерактивные логины без redirect от провайдера — form-запуск + `resume`-маршрут и `ProviderCtx.mtproto` (§4.7) для не-HTTP логина; `ProviderError.meta` для cooldown провайдера.

## 14. Структура кода и изоляция от легаси

### 14.1 Запрещено менять (проверка — пустой `git diff` по путям)

```
apps/server/src/app/infra/integration/**
apps/server/src/app/application/integrations/**
apps/server/src/app/api/rest/integrations*.ts
apps/server/src/app/infra/connector/**
apps/server/src/app/application/connectors/**
apps/server/src/app/infra/integrations/**
apps/webui/src/features/manage-connectors/**
apps/webui/src/features/integrations/**
apps/webui/src/shared/api/integrations.ts
```

Разрешено: новые файлы в `domain/apps/**`, `application/apps/**`, `infra/apps/**`, `infra/http/**`, `api/rest/**` (новые контроллеры), аддитивные правки `apps.module.ts`, `api.module.ts`, `infra/org-sqlite/**` (новые таблицы и миграции), `packages/contracts/src/apps.ts`, `apps/webui/src/features/manage-apps/**`, `apps/webui/src/shared/api/apps.ts`.

Следствия: новая система не читает и не пишет легаси-таблицы (`integrations`, `connectors`, `integration_oauth_sessions`) и секреты (`cloud:google:*`, `connector_telegram_*`, `github-app.json`); маршруты — только под `/api/apps/*` и `/orgs/:orgId/{apps,accounts,connect}`; регистрации у провайдеров новые (отдельный OAuth-клиент или дополнительный redirect URI, отдельный GitHub App со своим webhook URL); общего кода с легаси нет — дублирование дешевле связи двух систем.

### 14.2 Бэкенд

```
domain/apps/
  field.ts  descriptors.ts  records.ts  errors.ts  egress.ts  provider-module.ts  form-launch.ts  mtproto-port.ts
  ports/  provider-registry  app-repository  account-repository  secret-scope  provider-http
          connect-session-store  inbound-event  account-event  account-holder  public-urls  metrics  clock
application/apps/
  catalog/list-catalog.use-case.ts
  apps/{create,update,delete,verify,get,list}-app.use-case.ts
  accounts/{update,delete,verify,get,list}-account.use-case.ts
  connect/{start,resume,poll,cancel,get-session}-connect.use-case.ts  resume-form-connect.use-case.ts
          connect-finalizer.ts  connect-scheduler.ts  connect-context.port.ts  connect-finalize.port.ts
          wait-launch.ts  resume-executor.ts  resume-form-connect.spec.ts  resume-form-connect.spec-fakes.ts
  access/account-access.service.ts  status-map.ts
  webhooks/handle-webhook.use-case.ts
  facade/accounts-facade.service.ts
  shared/{field-validation,scope-coverage,record-views}.ts
infra/apps/
  apps.module.ts  provider-registry.adapter.ts (+ валидация §5.2)  app-repository.adapter.ts  account-repository.adapter.ts
  scoped-secrets.adapter.ts  connect-session-store.adapter.ts  public-urls.adapter.ts  orphan-sweeper.ts  mtproto.adapter.ts
  providers/index.ts  providers/_kit/**  providers/<id>/** (модуль, errors.ts, <id>.spec.ts)  providers/__fixtures__/acme/**
infra/http/provider-http.adapter.ts      (+ егресс-охрана)
infra/org-sqlite/schema/apps.ts  org-sql-apps.ts  (миграция)
api/rest/  apps-catalog  apps  apps-request  apps-response  apps-pages  apps-oauth-callback  apps-connect-public  apps-hook  (контроллеры и хелперы)
packages/contracts/src/apps.ts
scripts/check-provider-names.ts
docs/PROVIDER_MODULES.md
```

### 14.3 Автоматические гейты

- Biome `noRestrictedImports`: `providers/**` импортируют только `domain/apps`, `_kit` и стандартные крипто-модули; `domain/apps`, `application/apps` не импортируют `infra`, `api`.
- Biome `noRestrictedGlobals` на `fetch` в `infra/apps/providers/**`.
- `check-provider-names` (`bun run check:provider-names`): токены каталога `providers/**` отсутствуют в `domain`, `application`, `api`, `apps/webui` (кроме легаси-зон §14.1 и задокументированных исключений).
- AST-правило на сравнения `account.kind`, `app.kind`, `descriptor.kind`, `provider.id` с литералами и `switch` по ним в `domain`, `application`, `api`: пусто.
- `grep -rnE "(values|config|metadata)\.[a-zA-Z_]+" domain application api`: нет обращений по литеральному ключу (допустимо `values[field.key]`).
- Пустой `git diff --stat` по путям §14.1.

## 15. Тесты и проверка

Только unit-спеки рядом с кодом (`bun test`), как принято в репозитории.

### 15.1 Двойники и тестовый провайдер `acme`

`FakeProviderHttp` (скриптованные ответы), in-memory репозитории, `FakeSecretStore`, `FakeClock`. Провайдер `acme` в `providers/__fixtures__/acme/` в `providerModules` продакшена не входит и покрывает **все** пути ядра: OAuth с PKCE и `form_post`, device code, прямой ввод, `derived`-доступ, ротацию refresh, `setup` App, вебхук с challenge и `effects`, `userHost`, `generated`-поле, `partition`, form-запуск с `resume` и капой. На нём доказывается, что ядро провайдер-нейтрально.

### 15.2 Спеки ядра (на `acme`)

- Реестр: каждое нарушение §5.2 на отдельной фикстуре, сообщение содержит все нарушения сразу.
- Подключение: одноразовость `state`, TTL, лимит сессий, reaper, снимок первым событием SSE, финализация (upsert, `identity_mismatch`, объединение scopes, порядок «секреты → строка», сбой посередине), `resume` формы — валидация `inputs`, капа, инлайновый ответ, просрочка → `failed session_expired`.
- Доступ: кэш, single-flight, персист ротации до возврата, `expired` без обращения к провайдеру, `insufficient_scopes`.
- Verify: маппинг каждого кода в статус по таблице §7.2; `identity_mismatch` ничего не пишет; `label` не перезаписывается.
- Вебхуки: `404/401/400/503`, лимит тела, дедупликация, `effects`, неразрешимый аккаунт.
- Егресс и HTTP: `blocked` для приватных адресов и rebinding, суффиксы `userHost`, таймаут, лимит ответа, редакция логов.
- Удаление: `409` с держателями, best-effort `revoke`, порядок «строка → секреты»; сверка сирот.
- Канарейка секрета: не встречается в DTO, логах, событиях, ошибках.
- Тип-спека: `z.infer` контрактов равен доменным типам.

### 15.3 Конформанс (`providers.conformance.spec.ts`)

Параметризован по `providerModules`: дескрипторы проходят §5.2; у каждого вида Account есть `connect` и `verify`; маппинг ошибок тотален (каждый исход HTTP → код из union); `validateMetadata` идемпотентен и отвергает ключи, дублирующие поля ядра (`externalAccountId`, `label`, `scopes`, `expiresAt`, `lastError`); `access.keys` соответствуют `credentials`, которые возвращает обработчик; у провайдера есть собственная спека. Намеренно сломанная фикстура валит спек внятным сообщением.

### 15.4 Спеки провайдера (обязательны в его PR)

На `FakeProviderHttp`: `connect` (`start`/`resume`/`poll` по применимости), `verify`, `access`, `revoke`, `webhook` (валидная и невалидная подпись, replay), маппинг — по кейсу на каждый код.

### 15.5 Протокол проверки задачи

```
bun run lint:fix
bun run lint
bun run typecheck
bun test
SERVER_PORT=47999 DEV_HARNEYSYS_HOME=$(mktemp -d) bun run --cwd apps/server start
git diff --stat -- <пути §14.1>      # пусто
```

Изолированная загрузка: дождаться строки прослушивания, остановить процесс; живой стенд не трогать. Зелёные типы и тесты не доказывают корректность DI — доказывает загрузка (маркер сбоя: `metadata erased the token to Object`).

### 15.6 Браузерный смоук

Из `/settings/apps` на реальных провайдерах: подключён и проверен Google-аккаунт (в т. ч. доподключение scopes), создан GitHub App через manifest и установлена установка, добавлен Telegram-бот; удаление с `409` на занятый аккаунт; легаси-страницы интеграций и коннекторов работают как раньше.

## 16. Состав работ

Пакеты и зависимости; каждый закрывается своим критерием приёмки и протоколом §15.5.

```
A ─┬─► B ──┬─► E ──► F ──┐
   ├─► C ──┤            ├─► J ──► K
   └─► D ──┴─► G ──► H ──┘
A ─► I  (фронтенд идёт параллельно на фикстуре каталога; сквозная проверка — после F)
```

| Пакет | Содержание | Приёмка |
| --- | --- | --- |
| **A. Контракты и домен** | §3, §4: типы, порты, Zod-схемы `packages/contracts/src/apps.ts`, `ProviderError` | типы собираются; контракт-спека зелёная; в `domain` нет обращений по литеральным ключам |
| **B. Хранилище** | §2: DDL и миграция, репозитории, `ScopedSecrets`, порядок записи, сверка сирот | порядок «секреты → строка» и «строка → секреты» проверен спеками; сверка удаляет сирот |
| **C. Реестр и kit** | §5: `providerModules`, валидация, `_kit`, `defineProvider`, фикстура `acme` | фикстуры нарушений валят загрузку полным списком; `acme` проходит |
| **D. HTTP-порт** | §9.1–9.2: адаптер, егресс-охрана, редакция логов | `blocked`, таймаут, лимит, rebinding покрыты спеками; `fetch` в провайдерах ловится линтом |
| **E. App/Account CRUD** | §10, §11.3: каталог, App/Account use-cases, валидация полей, держатели, `409` | поля вне дескриптора отклоняются; удаление занятого аккаунта — `409` |
| **F. Подключение** | §6: сессии, finalizer, `start/resume/poll`, callback, launch-страница, SSE | все пути `acme` проходят; `state` одноразовый; опроса клиента нет |
| **G. Доступ** | §7, §11.1–11.2: access-сервис, verify, report, фасад, события | single-flight и ротация проверены; таблица статусов исчерпывающая |
| **H. Вебхуки** | §8 | `404/401/400/503`, дедупликация, `effects` на `acme` |
| **I. Фронтенд** | §12 | `check-provider-names` пуст; мастер и picker работают на фикстуре и на реальном бэкенде |
| **J. Референсные провайдеры** | Google (OAuth, refresh, partition), GitHub (setup, `derived`, вебхук App), Telegram (direct, `generated`, вебхук Account) | сквозные сценарии §15.6; ни одной правки ядра при их написании сверх уже принятых пакетов |
| **K. Конформанс, гайд, гейты** | §15.3, `docs/PROVIDER_MODULES.md`, CI-гейты §14.3; контрольное добавление ещё одного тестового провайдера (каталог + строка) | дифф контрольного провайдера не содержит ядра, фронта и других провайдеров |

Остальные провайдеры (Slack, Notion, Microsoft, Atlassian, Shopify, Stripe, Discord и далее) добавляются по чек-листу §17 без правок пакетов A–I.

## 17. Чек-лист добавления провайдера

1. `infra/apps/providers/<id>/`: `index.ts` (`ProviderModule` через `defineProvider`), описания видов, `errors.ts` (чистый маппинг ответов в `AccountErrorCode`), `<id>.spec.ts`.
2. Дескрипторы: вид начинается с `<id>-`; ключи полей не меняются после релиза; заполнены `help.steps`, `consoleUrl`, `endpoints`, каталог scopes.
3. Заявлены `secrets`, `access` (`source` и `keys`), `egress`.
4. Обработчики: `connect` (`directConnect` или kit `oauth2`), `verify`; при необходимости `access`, `revoke`, `webhook`, `setup`; `validateMetadata`.
5. Сеть только через `ctx.http`, секреты только через `SecretReader`, время только `ctx.now()`.
6. Строка в `providers/index.ts`.
7. `bun test` (конформанс и спека провайдера), lint, typecheck, изолированная загрузка.
8. `git diff --stat` не содержит `domain/`, `application/`, `api/`, `packages/contracts`, `apps/webui`, других провайдеров и путей §14.1.

Пункт 8 — критерий приёмки PR. Если провайдеру не хватает контракта, сначала отдельный PR расширения (§5.4), потом PR провайдера.

## 18. Definition of done

- Пакеты A–K приняты; `bun run check` и изолированная загрузка зелёные.
- Сервер не стартует при нарушении любого правила §5.2, и сообщение перечисляет все нарушения.
- Ядро, API и фронт не содержат имён провайдеров, ветвлений по виду, литеральных обращений к `metadata`/`values`/`config`, `fetch`, опроса.
- Два таблицы, ноль провайдерских таблиц и миграций; секреты только в `SecretStorePort`; в DTO, логах, событиях и ошибках секретов нет (канарейка).
- Три референсных провайдера проходят §15.6; контрольный провайдер добавлен без правок ядра.
- Пустой `git diff` по путям §14.1; легаси-поверхности работают как до начала работ.
- **Финальный критерий:** новый провайдер — это каталог в `providers/<id>/`, одна строка в индексе и спеки. Любой PR, которому нужна правка ядра ради провайдера, — дефект архитектуры, а не задача разработчика.

## 19. Отличия от набросков

1. **Единый путь создания Account.** Только `connect/start`; `POST /accounts` с записями `pending` убран. Account появляется после проверки у провайдера.
2. **Обработчики на уровне вида.** Вместо методов, возвращающих `null`, — отсутствие необязательного обработчика; `capabilities` вычисляет ядро.
3. **App создаётся тем же механизмом** (`setup`), поэтому `ConnectResult.app` не нужен.
4. **Две таблицы вместо четырёх.** `connect_sessions` — память процесса; `account_identity_index` не нужен: `orgId` и цель в URL вебхука. Ограничение: провайдер, который принимает вебхуки только на один фиксированный глобальный URL для всех организаций сразу, этой моделью не поддерживается.
5. **`partition` вместо `scope_key`;** scopes хранятся ключами каталога. `config` (ввод пользователя) отделён от `metadata` (данные провайдера).
6. **Единый callback** `/api/apps/oauth/callback` вместо маршрута на провайдера; завершение подключения для всех способов — SSE.
7. **Добавлено по прогону на десяти провайдерах:** `inputs` до старта, `derived`-доступ и `persist` ротации, challenge-ответы и `effects` вебхуков, егресс-политика с адресом из поля, `generated`-секреты, `form_post`, `AccountHolderPort`.
8. **Деление на Части I/II/III снято:** план один. Работы с легаси в него не входят.
