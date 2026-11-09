# План: платформа аддонов и перенос интеграций

**Статус:** рабочий план для обсуждения, не ADR.
**Дата:** 2026-11-09.
**Область:** контракт аддонов, швы ядра, модель Apps/Accounts, декомпозиция Telegram/Google/GitHub, порядок миграции при сосуществовании с легаси.

Документ опирается на факты в коде с указанием `file:line`. Где факт не проверен — это сказано прямо.

---

## 0. Короткий ответ

1. Сейчас в репозитории **две несовместимые подсистемы**, и ни одна не является фундаментом: process-супервизор аддонов (`apps/server/src/app/infra/addons/*`) и in-process интеграции (`apps/server/src/app/infra/integrations/*`). Фундамент придётся выбрать, а не «доработать».
2. Фундамент — **process-супервизор**: манифест, каталог, JSON-RPC, изоляция сбоя. In-process хост остаётся легаси до конца миграции.
3. Сначала **замораживается контракт** (протокол v1 + семейства вкладов + Apps/Accounts), потом чинятся 7 дефектов шасси (они блокируют любой реальный аддон), только потом переносится Telegram.
4. `Apps` — не UI-удобство, а **недостающая сущность ядра**: сегодня креды приложения лежат в трёх разных местах и в трёх разных областях видимости (§5).
5. Переносить «жирные» интеграции целиком нельзя: Telegram распадается на 3 аддона, Google на 6, GitHub на 3 (§6). Каждому нужен свой вклад, а не свой маршрут в ядре.
6. Пока аддон не установлен, легаси работает как работает. Переключатель — **по виду автоматизации**, а не по провайдеру (§7.4).

---

## 1. Что реально есть в коде

### 1.1 Подсистема A — process-аддоны (шасси)

| Факт | Где | Следствие |
|---|---|---|
| Манифест `addon.json`: `id, version, entry, execution, assets, contributions[]` | `packages/sdk/manifest.ts:44` | Уже есть единица установки и декларация вкладов |
| Семейства вкладов объявлены в SDK | `packages/sdk/manifest.ts:6` | 11 литералов: `tool, context, content, hook, mcp, lsp, trigger, route, worker, view, config` |
| Дублирующий список семейств в контрактах | `packages/contracts/src/addons.ts:3` | Два источника истины для одного перечисления |
| Супервизор запускает `bun` процессом и общается JSON-RPC по stdin/stdout | `apps/server/src/app/infra/addons/addon-worker.ts:49` | Механика изоляции уже есть |
| Enable/disable/config/logs каталога | `apps/server/src/app/infra/addons/addon-host.ts:83,116,128` | Жизненный цикл есть, прав и грантов нет |
| Дискавери: `add-ons/` монорепо + `~/.harnesys/add-ons` | `apps/server/src/app/infra/addons/addon-discovery.ts` | Нет версионированных каталогов установки, как обещают доки |
| Из всех вкладов ядро читает **только** `config` | `apps/server/src/app/infra/addons/addon-host.ts:283` | `tool`, `route`, `worker`, `view`, `hook` — инертны |
| UI показывает вклады как JSON-строку | `apps/webui/src/features/manage-addons/manage-addons-pane.tsx:194` | Рендера вкладов нет |

### 1.2 Подсистема B — «интеграции» в процессе (легаси)

| Факт | Где | Следствие |
|---|---|---|
| Список интеграций компилируется в ядро | `apps/server/src/app/infra/integrations/installed-integrations.ts:4` | Новый провайдер = правка ядра |
| Хост поднимает каждую интеграцию на организацию | `apps/server/src/app/infra/integrations/integration-host.ts:107,188` | In-process, без изоляции, с DI-контейнером рядом |
| Контракт живёт внутри ядра (`harnesys/integration`) | `packages/harnesys/src/integration/types.ts:93,131` | Аддон обязан импортировать ядро — нарушение Dependency Rule |
| Секреты отдаются сырыми значениями | `packages/harnesys/src/integration/types.ts:21`, `apps/server/src/app/infra/integrations/addon-secrets.ts:15-26` | Дефект, который нельзя тащить в новый шов |
| Своя SQLite на интеграцию | `apps/server/src/app/infra/integrations/addon-database.adapter.ts` (`directoryOf`) | `orgDataDir/<org>/integrations/<id>/data.db` — решение верное |
| Автоматизации = снапшот в памяти процесса | `apps/server/src/app/infra/integrations/automation-items.ts:44` | Теряется при рестарте, ядро не владеет триггерами |
| Запуск идёт через `runs.dispatch` с `trigger.kind='connector'` | `apps/server/src/app/infra/integrations/integration-context.ts:74` | Канал запуска уже нейтрален, провайдер в него не протёк |
| Маршруты проксируются по общему пути | `apps/server/src/app/api/rest/integration-routes.controller.ts` | Готовый паттерн для аддонов |
| Оба модуля подключены одновременно | `apps/server/src/app/api/api.module.ts:148,181` | Два состояния «интеграция включена» |

### 1.3 Что уже правильно нейтрально

Это важно, потому что не надо переписывать:

- `ConnectorProviderSchema` — открытая строка, не enum (`packages/contracts/src/connector.ts`). Транспортный слой данных уже провайдер-нейтрален.
- `RunTriggerKind`/`PlacementTriggerKind` содержат `'connector'` как **категорию** («сработало внешнее»), а не имя провайдера (`apps/server/src/app/domain/thread/prepare-runtime-input.ts:9`, `apps/server/src/app/domain/fleet/pending-placement.ts:3`). Категорию оставляем, новых литералов не добавляем.
- `PackName = string` и `PackRegistration` (`packages/harnesys/src/domain/pack.ts:35,153,167`) — пак как единица назначения уже открыт по имени.
- `AutomationKind.kind`, `AutomationItem.integrationId` — строки (`packages/contracts/src/automations.ts`).
- Проксирование маршрутов аддона под `/orgs/:orgId/integrations/:id/*` уже соответствует правилу из `AGENTS.md`.

### 1.4 Что сломано независимо от аддонов

Две ошибки, которые план исправляет побочно, и их нельзя оставить:

- **GitHub App хранится на хост, а не на организацию:** `github-app-store.ts:15,73` пишет `github-app.json` в `layout.home()`. Две организации на одной машине получают один и тот же app registration.
- **Google-проект хранится JSON-блобом в секрете организации** `cloud:google-client` (`google-app-config.ts:5,21,48`): нельзя иметь два проекта, нельзя увидеть, какой используется, нельзя разделить ключи по смыслу.

---

## 2. Выводы, которые меняют план из доков

1. **`docs/addons/06` (волны CP-01…CP-14) как старт не годится.** CP-01 («контракт вклада без потребителя»), CP-11…CP-14 (эмбеддинги, поиск, нотификации, телеметрия) — рефакторинг ядра без первого аддона. Это месяцы до первой пользы и ровно то, что запрещают сами доки: «не выносим ради количества» (`00`, §1 non-goals). Шов открывается тогда, когда под него есть первый аддон, кроме швов из §3.3, которые дешевы сейчас и дороги потом.
2. **Контракт аддона нельзя объявлять «формa TBD».** `05`, §6 откладывает «полную схему манифеста» и «форму AddonContext» до ADR-02, но именно это и есть то, что потом не переписать. Замораживаем v1 сейчас, версионируем, дальше только аддитивно.
3. **`integration-host` не переиспользуем как контракт, но переиспользуем как инвентарь и как реализацию.** Он доказал, какие сервисы реально нужны (`db, secrets, workers, automations, threads, runs, events, routes`, `types.ts:93`) и какие отсутствуют (`connections`, `triggers`, `http`). Его реализации (`createAddonThreads`, `createAddonRuns`) переиспользуются внутри нового хоста, чтобы поведение не менялось.
4. **`view` со «Смешанной» стабильностью опасен.** React-инъекция = ядро импортирует код аддона. Для сторонних аддонов — только декларативные дескрипторы; React — только для `execution: 'in-process'` и только как флаг, а не как особая ветка в UI.
5. **Транспорт бота — не «нейтральный мост» из матрицы `01`, §1.3.** Product-семантика бота (авто-ответчик, HITL-мост, echo-политика) — инвариант ядра и живёт в ~830 строках use-case'ов (`apply-telegram-update.use-case.ts` 321, `apply-telegram-actions.ts` 333, `apply-telegram-hitl.ts` 175). В аддон уходит **протокол**, не мост. Иначе миграция упрётся и будет откачена.

---

## 3. Контракт v1: что замораживаем

Живёт в `packages/sdk` (`@harnesys/sdk`), без импорта ядра. `harnesys/integration` остаётся легаси-контрактом и новыми аддонами не импортируется.

### 3.1 Манифест

```jsonc
{
  "id": "telegram-feed",
  "version": "0.1.0",
  "platform": 1,                       // версия протокола хоста, не опционально
  "title": "Telegram feed",
  "description": "Channels and groups as a trigger",
  "icon": "send",
  "entry": "./src/index.ts",
  "execution": "process",              // process | in-process
  "capabilities": ["db", "secrets:resolve", "triggers:fire", "runs:dispatch"],
  "contributions": [
    {
      "id": "telegram-feed.trigger",
      "family": "trigger",
      "descriptor": {
        "kind": "telegram.feed",
        "label": "Telegram feed",
        "configSchema": { "type": "object" },
        "limits": { "perDay": 20, "throttleSec": 60 }
      }
    }
  ]
}
```

Отличия от текущего `addon.json` (`add-ons/starter/addon.json`):

- `platform` обязателен: без него первая же несовместимая версия ломает установленные аддоны молча.
- `capabilities` — это **запрос**, а не описание. Хост материализует его в грант-сет при установке и проверяет на каждом вызове сервиса.
- `execution` остаётся, но `in-process` не даёт права на React-инъекцию автоматически.

### 3.2 Семейства вкладов v1

| Семейство | Что описывает | Кто исполняет | Статус в v1 |
|---|---|---|---|
| `config` | поля настроек | хост рендерит | стабильно |
| `route` | HTTP под `/orgs/:orgId/addons/:id/*` | хост проксирует | стабильно |
| `tool-pack` | pack: имя, spec, список тулов | ядро назначает, аддон исполняет | стабильно |
| `trigger` | вид триггера + схема конфига + лимиты | ядро диспетчеризует, аддон детектит | стабильно |
| `transport` | протокол внешнего чата + capability-набор | ядро ведёт мост, аддон говорит по API | стабильно |
| `source-kind` | бэкенд источника (например Drive) | ядро владеет зеркалом, аддон — API | резерв (после ADR-06) |
| `worker` | фоновая активность | хост запускает, аддон исполняет | стабильно |
| `content` | скиллы/промпты | репозиторий ядра | стабильно |
| `hook` | подписка на событие | шина ядра | стабильно |
| `view` | декларативные секции страницы аддона | рендерер ядра | стабильно (декларативный) |
| `mcp`, `lsp` | дескрипторы | реестры ядра | стабильно |

Apps/Accounts — не семейство вкладов и не аддон: это сущность ядра (§5), аддоны её потребляют.

Удаляется из v1: `tool` (по одному тулу) — заменяется на `tool-pack`, потому что единица назначения в ядре — pack (`pack.ts:27,35`), и pack несёт spec, skills, иконку, настройки. Одиночный тул не может быть назначен агенту.

`context` уходит в `view`/`content`; отдельного семейства не нужно, пока нет потребителя.

### 3.3 Швы, которые фиксируются сейчас (дорого потом)

Это ответ на вопрос «что больше никогда не переписывается». Остальные швы открываются по мере появления аддонов.

| # | Шов | Почему сейчас |
|---|---|---|
| S1 | Реестр установленных аддонов вместо компилированного списка | Иначе каждый новый аддон правит ядро |
| S2 | **Apps + Accounts** в ядре | Три разных дома для кредов уже расходятся (§5) |
| S3 | Протокол хост-сервисов v1 (13 методов) | Публичный контракт для сторонних аддонов |
| S4 | Грант-сет и проверка прав на диспетчере хоста | Дешево сейчас, дорого после первого аддона третьей стороны |
| S5 | `tool-pack` → `PackRegistration` | Убивает 4 switch-таблицы провайдеров |
| S6 | `trigger` → диспетчеризация и лимиты в ядре | Лимиты сейчас внутри аддона (Telegram `maxRunsPerDay`) |
| S7 | `source-kind` + `GitCredentialResolver` | `backend: z.literal('google')` (`source.ts:12`) в контракте |
| S8 | `transport` + нейтральные binding-строки | Данные уже нейтральны, рантайм — нет |
| S9 | Страница аддона из дескрипторов | `INTEGRATION_UI_REGISTRY` и `settings-nav` — компилированные |
| S10 | Изоляция окружения процесса аддона | Сейчас аддон получает весь `process.env` |

### 3.4 Протокол хост-сервисов v1

Транспорт: JSON-RPC 2.0 поверх stdin/stdout, версия в `register`.

```ts
// packages/sdk/protocol.ts (v1)
export const PROTOCOL_VERSION = 1;

export interface HostMethodsV1 {
  'register':        (p: RegisterParams) => RegisterResult;
  'config.get':      () => { values: Record<string, unknown> };
  'config.set':      (p: { values: Record<string, unknown> }) => { applied: number };
  'secret.resolve':  (p: { ref: string }) => { value: string };      // только при гранте
  'db.exec':         (p: { sql: string }) => void;
  'db.all':          (p: { sql: string; params?: unknown[] }) => unknown[];
  'db.get':          (p: { sql: string; params?: unknown[] }) => unknown | null;
  'db.run':          (p: { sql: string; params?: unknown[] }) => void;
  'events.emit':     (p: { kind: string; action: 'changed' | 'removed' }) => void;
  'threads.create':  (p: { agentId: string; title: string }) => { threadId: string };
  'runs.dispatch':   (p: DispatchInput) => 'fired' | 'busy' | 'failed';
  'triggers.fire':   (p: FireInput) => 'fired' | 'suppressed' | 'busy' | 'failed';
  'bridge.inbound':  (p: InboundInput) => { threadId: string };
}
```

Правила, которые нельзя менять после v1:

- Все вызовы — **значения**, не замыкания. Отмена — по идентификатору операции, не по `AbortSignal` в аргументе. Это единственное, что делает in-process режим прямым вызовом, а process-режим — маршалингом без переделки API.
- Работа аддона запускается **хостом**: `worker.start(id)` / `worker.stop(id)` → аддон сам сообщает о готовности. Замыкание `ctx.workers.register(fn)` (`types.ts:41`) в v1 отсутствует.
- `secret.resolve` возвращает значение, только если аддону выдан грант и ref принадлежит его пространству имён. Сырые `get/set` из `types.ts:21` в v1 отсутствуют.
- Любой новый метод — только аддитивно; удаление метода = версия 2.

### 3.5 Гранты

```
Грант-сет = { addonId, version, caps: string[], grantedAt, grantedBy }
Эффективный доступ = декларация ∩ грант ∩ организация
```

Диспетчер хоста — единственная точка проверки (одна функция на `switch (method)`), не транспорт и не адаптер. Причины: in-process аддон проходит тот же диспетчер, значит проверка не зависит от режима исполнения; проверка живёт в одном месте, значит её нельзя забыть в новом сервисе.

Пока проверки нет — минимум, который всё равно обязателен перед первым сторонним аддоном: `addon-worker.ts:238-242` копирует **весь** `process.env` в процесс аддона. Заменить на allowlist (`HOME`, `PATH`, `TZ`, `LANG`) + переменные аддона.

---

## 4. Швы ядра: наброски

### 4.1 S1 — реестр установленных аддонов

```ts
// domain/addons/addon-registry.port.ts
export interface InstalledAddon {
  addonId: string; version: string; state: 'installed' | 'enabled';
  execution: 'process' | 'in-process'; grants: readonly string[];
}

export abstract class AddonRegistryPort {
  abstract list(orgId: string): InstalledAddon[];
  abstract contributions<T extends AddonFamily>(orgId: string, family: T): ContributionOf<T>[];
  abstract enabled(orgId: string, addonId: string): boolean;
}
```

Замена точек: `installed-integrations.ts:4`, циклы по `INSTALLED_INTEGRATIONS` в `integration-host.ts:107,127`, `routes()` `:140`. Легаси-интеграции на время миграции регистрируются в реестре как «встроенный источник», тогда `if (family === 'route')` работает одинаково и для встроенных, и для аддонов.

### 4.2 S5 — pack из аддона

Ядро строит `PackRegistration` само, аддон даёт только дескриптор и обработчик:

```ts
// ядро
function packFromAddon(reg: AddonRegistryPort, orgId: string, descriptor: ToolPackDescriptor): PackRegistration {
  return registerPack(
    {
      name: descriptor.name,
      version: descriptor.version,
      description: descriptor.description,
      icon: descriptor.icon,
      specSchema: descriptor.specSchema,
      meta: { tools: descriptor.tools, skills: descriptor.skills ?? [], hasSettings: Boolean(descriptor.specSchema) },
      create: ({ ports }) => ({ tools: ports.tools, skills: ports.skills }),
    },
    {
      ports: { tools: proxyTools(reg, orgId, descriptor), skills: descriptor.skills },
      resolveScope: liveScope,     // политика остаётся в ядре
    },
  );
}
```

`proxyTools` — тонкий адаптер: `ToolDefinition.handler → rpc('tools.call', { pack, name, input })`. Это снимает switch-таблицы: `org-pack-list.ts`, `org-pack-requirements.ts`, `org-pack-registrations.ts`, `application/capabilities/org-pack-catalog.ts` — все четыре правки на провайдера исчезают.

### 4.3 S6 — триггер

Ядро владеет частотой и дедупликацией, аддон — детекцией:

```ts
// ядро
async fire(orgId, addonId, triggerId, input: { runKey: string; text: string; threadId?: string; agentId?: string }) {
  if (this.seen(orgId, addonId, triggerId, input.runKey)) return 'suppressed';
  if (!this.underLimit(orgId, addonId, triggerId)) return 'suppressed';
  return this.runs.dispatch({ ...input, fireId: input.runKey });
}
```

`limits` берутся из дескриптора вклада. Сейчас `maxRunsPerDay`/`throttleSec` живут в БД аддона и проверяются им самим — это политика, которую ядро обязано видеть (инвариант бюджета из `01`, §1.1).

### 4.4 S8 — транспорт

Аддон реализует протокол, ядро — мост:

```ts
export interface ChatTransportContribution {
  provider: string;                       // 'telegram', 'slack', ...
  capabilities: ConnectorCapabilities;    // уже существует в contracts/connector.ts
  connectRoute: { method: string; path: string };
  outbound: {
    send(input: OutboundMessage): Promise<{ externalId: string }>;
    edit(input: OutboundEdit): Promise<void>;
    typing(input: { channelId: string; topicId?: string }): Promise<void>;
  };
}
```

Ядро оставляет себе: `ApplyExternalUpdateUseCase` (переименованный `ApplyTelegramUpdateUseCase` без телеграм-специфики), выбор авто-ответчика, echo-политику, HITL, привязку чат↔thread. `ConnectorRepositoryAdapter` уже пишет в org.db и уже хранит `provider` строкой — данные переписывать не придётся, только снять `telegram-poller.ts` и `telegram-api.adapter.ts`.

### 4.5 S9 — UI

```ts
export interface AddonPageDescriptor {
  id: string; title: string; icon: string;
  config?: ConfigField[];                       // реюзать sdk/families/config.ts
  connections?: { appKinds: string[]; accounts: 'none' | 'single' | 'many' };
  automations?: AutomationCardDescriptor[];
  actions?: { id: string; label: string; route: { method: string; path: string } }[];
}
```

Один рендерер в `apps/webui` рисует страницу по дескриптору и ходит в `/orgs/:orgId/addons/:addonId/*`. Тогда `settings-nav.ts:163,205`, `settings-page.tsx:93,127,131` и `INTEGRATION_UI_REGISTRY` (`apps/webui/src/integrations/registry.ts:10`) уходят; в навигации остаётся один раздел «Add-ons» и одна страница на аддон.

---

## 5. Apps и Accounts

### 5.1 Зачем

Сегодня «приложение провайдера» — это три разные вещи в трёх местах:

| Провайдер | Где лежит | Область | Дефект |
|---|---|---|---|
| Google | секрет организации `cloud:google-client` (`google-app-config.ts:5`) | организация | нельзя два проекта, нет статуса |
| GitHub | `github-app.json` в `layout.home()` (`github-app-store.ts:15,73`) | **хост** | две организации делят один app |
| Telegram MTProto | `api_hash` в секретах аддона, `apiId` в его БД (`readers.ts:40`) | интеграция | форма собирает одно и то же на каждого читателя |

Именно это и есть та «нагромождённость форм», о которой речь: форма аддона просит client id, который уже введён трижды.

### 5.2 Модель

Две сущности в ядре, обе — в `org.db`, обе провайдер-нейтральны:

```sql
create table apps (
  id text primary key,
  org_id text not null,
  kind text not null,            -- 'google-cloud-project' | 'github-app' | 'telegram-mtproto' | 'telegram-bot'
  label text not null,
  status text not null,          -- 'configured' | 'invalid'
  config_json text not null,     -- НЕ секреты
  created_at text not null,
  updated_at text not null
);

create table accounts (
  id text primary key,
  org_id text not null,
  app_id text,                   -- null, когда креды и есть идентичность (bot token)
  kind text not null,
  external_account_id text not null,
  label text not null,
  status text not null,          -- 'connected' | 'expired' | 'error' | 'pending'
  scopes_json text not null,     -- [] если не применимо
  scope_key text not null,       -- хэш отсортированного набора scope
  secret_ref text not null,
  last_error text,
  created_at text not null,
  updated_at text not null,
  unique (org_id, kind, external_account_id, scope_key)
);
```

`scope_key` решает конкретную проблему Google: у одного аккаунта может быть несколько грантов с разными наборами scope, и YouTube обязан быть отдельным (`integrations.ts:223` — refine, запрещающий YouTube вместе с другими). Сейчас это костыль в схеме; с `scope_key` — нормальная модель: два `account` одной Google-почты.

### 5.3 Правила владения

- **Ядро**: список видов приложений (дескриптор полей и признака «секретное»), хранение app/account, секреты по ref, уникальность `(kind, externalAccountId, scopeKey)`, статусы, life-cycle, каскадное удаление, аудит, проверка прав.
- **Аддон — потребитель**: получает `appId`/`accountId`, выбирает аккаунт по scope и пользуется доступом; client id, api_hash и токены у себя не хранит.
- Поток подключения (OAuth loopback, manifest, MTProto login) — маршрут аддона, аккаунт он создаёт через `POST /accounts`, а не пишет в `org.db` напрямую.
- Новый провайдер = свой модуль вида в `infra/apps/providers/<provider>/` (`AppKindProviderPort`), который агрегатор `app-kind-registry.adapter.ts` сводит в один список; не новый аддон и не новый литерал в union.

### 5.4 API

```
GET    /orgs/:orgId/app-kinds              → дескрипторы видов (поля, что из них секретное)
GET    /orgs/:orgId/apps?kind=             → список приложений (без секретов, только имена секретных полей)
POST   /orgs/:orgId/apps                   → создание (values + secrets по полям дескриптора)
GET    /orgs/:orgId/apps/:id               → одно приложение
PATCH  /orgs/:orgId/apps/:id               → правка, ротация секретов (пустая строка удаляет)
DELETE /orgs/:orgId/apps/:id               → каскад: снять accounts, удалить их секреты
GET    /orgs/:orgId/accounts?kind=&appId=  → подключённые аккаунты и статусы
POST   /orgs/:orgId/accounts               → регистрация или переподключение по (kind, externalAccountId, scopeKey)
GET    /orgs/:orgId/accounts/:id
PATCH  /orgs/:orgId/accounts/:id           → label, status, lastError от аддона
DELETE /orgs/:orgId/accounts/:id
```

Поток подключения выполняет аддон по своему маршруту: `POST /orgs/:orgId/addons/google-calendar/oauth/start` → пользователь авторизуется → аддон регистрирует аккаунт через `POST /orgs/:orgId/accounts` с `appId`, `externalAccountId`, `scopes` и `credentials`. Флоу у каждого аддона свой, реестр один.

---

## 6. Декомпозиция интеграций

Правило деления: один аддон = один вид вклада в одном домене ядра, а доступ к провайдеру он берёт из Apps и сам его не заводит. Аддон, который «умеет всё про Google», ломает и назначение паков, и права, и UI.

### 6.1 Telegram → 2 аддона (+2 позже)

| Аддон | Вклад | Что переносим | Откуда |
|---|---|---|---|
| `telegram-feed` | `trigger: telegram.feed`, `worker`, `view` | источники, правила фильтрации, инgest, диспетчеризация | `packages/integration-telegram/src/{sources,feed,db,publish,routes}.ts` |
| `telegram-bot` | `transport: telegram`, `route` | Bot API, pairing, топики, публикация | `infra/connector/*` (15 файлов), `application/connectors/*` (46 файлов, из них мост остаётся в ядре) |
| `telegram-bot-outbound` / `-inbound` | split `telegram-bot` | — | позже, id вкладов закладываем сразу (`telegram.bot.*`) |

MTProto-сессия — не аддон, а аккаунт вида `telegram-mtproto` в Apps: `telegram-feed` выбирает готовый аккаунт и не спрашивает api_id/phone (`readers.ts:40`), а вход по телефону/коду/паролю выполняет его собственный маршрут поверх `infra/integration/telegram`-файлов, переезжающих в аддон.

### 6.2 Google → 5 аддонов

| Аддон | Вклад | Что переносим | Откуда |
|---|---|---|---|
| `google-drive-sources` | `source-kind: cloud-drive` | Drive API, экспорт документов | `source/drivers/cloud/google-drive.backend.ts:26`, `cloud-sync-back.ts:90,121` |
| `google-calendar` | `tool-pack: google-calendar` | календарь | `runtime/packs/org-google*.port.ts` (часть) |
| `google-gmail` | `tool-pack: google-gmail` | почта, вложения | там же |
| `google-sheets-docs` | `tool-pack: google-sheets-docs` | Sheets, Docs, Search Console | там же + `docs-api.ts`, `sheets-api.ts`, `searchconsole-api.ts` |
| `google-youtube` | `tool-pack: google-youtube` | видео, плейлисты, комментарии, аналитика | `youtube-*.ts` |

Следствия: `GoogleOAuthServiceSchema` (`integrations.ts:212`) и refine про YouTube (`:223`) распадаются на scope-наборы аккаунтов (§5.2, `scope_key`), а OAuth loopback переезжает в маршрут первого Google-аддона; `backend: z.literal('google')` (`source.ts:12`, `:228`) заменяется на строку `backend: string` с реестром; `OrgGooglePort` (286 строк, ~40 методов) распадается по пакам.

### 6.3 GitHub → 2 аддона

| Аддон | Вклад | Что переносим | Откуда |
|---|---|---|---|
| `github-tools` | `tool-pack: github` | repos, issues, PR, CI, code search | `runtime/packs/org-github.port.ts` (281 строка) |
| `github-git-credentials` | `route` + резолвер кредов для git | `git-credential`, токен для clone/push | `integrations-github.controller.ts` (public route), `github-token.adapter.ts` |

Сегодня git-креды выдаёт публичный маршрут ядра `/integrations/github/git-credential` — провайдер протёк в URL-пространство ядра. Шов: ядро спрашивает `GitCredentialResolver.resolve(accountId)`, какой аддон это обслуживает — не дело ядра. Manifest flow и установки GitHub App — не отдельный аддон: приложение создаётся в Apps, а установка становится её аккаунтом (`infra/integration/github/*`, 12 файлов, переезжают в маршрут `github-tools`).

### 6.4 Apps — ядро, аддоны — потребители

Apps не входит в §6.1–6.3: это не аддон, а сущность ядра (§5.1–5.4). Аддон приносит функциональность и получает доступ через аккаунт этой сущности:

| Что делает аддон | Через что |
|---|---|
| выбрать приложение и аккаунт | `GET /apps`, `GET /accounts?kind=` |
| провести свой флоу подключения | собственный `route`, затем `POST /accounts` |
| получить секрет по ref | `secret.resolve` (S3) после проверки принадлежности ref |
| сообщить, что доступ протух | `PATCH /accounts/:id` — `status`, `lastError` |

Правило проверки: если для работы нужен client id, api_hash или installation id — это Apps, ядро уже хранит; аддон не заводит вторую форму с теми же полями.

---

## 7. Порядок работ

### Этап 0 — фиксация контракта (1 PR, без кода поведения)

- `packages/sdk`: `protocol.ts` → v1 (13 методов из §3.4), `manifest.ts` → `platform` + `capabilities`, семейства из §3.2, `context.ts` → `AddonContext` без замыканий и с `secrets.ref`.
- `packages/contracts/src/addons.ts:3` — убрать дублирующий список семейств, импортировать тип из SDK.
- Документ `docs/addons/07-addon-contract-v1.md` — то, что отдаётся автору аддона.
- Выход: типы собираются, легаси не тронут.

### Этап 1 — дефекты шасси (1 PR на дефект, поведение легаси не меняется)

| # | Дефект | Где | Что сделать |
|---|---|---|---|
| D1 | `db` — заглушка, аддон не может хранить данные | `packages/sdk/process-entry.ts:137` | `db.*` через RPC в собственную SQLite `orgDataDir/addons/<id>/data.db` |
| D2 | `threads.create` и `runs.dispatch` бросают «not wired» | `process-entry.ts:150-151` | Подключить к существующим реализациям (`createAddonThreads`, `createAddonRuns`) |
| D3 | Маршруты с `:param` не находятся (сравнение пути по `===`) | `process-entry.ts:180` | Использовать `resolveIntegrationRoute`-подобный матчер (он уже написан, `packages/harnesys/src/integration/define-integration.ts`) |
| D4 | Секреты только `ref()`, значения не доставляются | `packages/sdk/context.ts:12`, `addon-worker.ts` | `secret.resolve` + проверка принадлежности ref |
| D5 | Двойной источник конфига: каталог хоста и `config.json` внутри аддона | `addon-host.ts:128`, `process-entry.ts` (`writeConfig`) | Один владелец — каталог хоста; аддон получает значения |
| D6 | Аддон получает весь `process.env` | `addon-worker.ts:238-242` | Allowlist + переменные аддона |
| D7 | Worker = замыкание в аддоне | `types.ts:41`, `integration-telegram/src/workers.ts` | `worker.start/stop(id)` от хоста, отмена по id |

Выход: `add-ons/starter` проходит цикл enable → `db` запись/чтение → worker старт/стоп → маршрут с `:id` → disable, и после disable ничего не остаётся в процессах.

### Этап 2 — Apps/Accounts (S2)

- Таблицы `apps`, `app_accounts` в схеме `org.db`, порты `AppRegistryPort`/`AppKindRegistryPort`, REST из §5.4, generic-форма по дескриптору вида.
- Сделано: `infra/apps/*`, `application/apps/*`, `api/rest/{apps,app-kinds,accounts}.controller.ts` — хранение, секреты по полям, `scope_key`, каскад.
- Осталось: потребители — `google-calendar` (OAuth loopback) **или** `github-tools` (manifest flow уже есть). Легаси не трогаем: `cloud:google-client` и `github-app.json` продолжают работать.
- Выход: аддон находит App, проводит flow, регистрирует Account, ядро отдаёт `secret.resolve`.

### Этап 3 — pack и trigger (S5, S6)

- Фабрика `packFromAddon` (§4.2), `triggers.fire` (§4.3) с дедупликацией и лимитами.
- Первый pack-аддон: `github-tools` (уже изолирован по данным, не требует flow).
- Выход: агент получает тулы GitHub из аддона; добавление второго провайдера не правит ядро.

### Этап 4 — пилот Telegram (S1, S3, S4, S9)

- `telegram-feed`, переключатель по виду автоматизации (§7.4).
- Обе реализации живут одновременно; данные — в разных файлах, dual-write не нужен.
- Выход: те же поведенческие проверки на обеих реализациях (см. §8), карточка автоматизации одна.

### Этап 5 — транспорт (S8)

- Нейтральный `ApplyExternalUpdateUseCase`, `telegram-bot` как `transport`, ядро владеет мостом.
- Выход: бот работает из аддона, `telegram-poller.ts` не запускается для организаций на аддоне.

### Этап 6 — Google и GitHub

- `google-calendar` → `google-drive-sources` → паки по одному (`gmail`, `sheets-docs`, `youtube`); каждый берёт аккаунт из Apps.
- `github-tools` + `github-git-credentials` → снятие публичного маршрута из ядра.
- Выход: ни одного `if (provider === …)` в ядре; ни одного провайдер-литерала в контрактах, кроме исторических значений в данных.

### Этап 7 — удаление легаси

- Удаление `installed-integrations.ts`, `integration-host.ts`, `integration-context.ts`, `INTEGRATION_UI_REGISTRY`, google/github-файлов ядра, `GoogleOAuthServiceSchema`, `CONNECTOR_CATALOG`.
- Grep-гейты: `INSTALLED_INTEGRATIONS`, `harnesys/integration`, `cloud:google-client`, `github-app.json`, `GoogleOAuthServiceSchema`.

### 7.4 Сосуществование: один писатель

Переключатель — **вид автоматизации**, не провайдер:

```ts
// integration-host.ts, automationKinds()
const legacyOff = new Set(config.integrations.disabledAutomationKinds ?? []);
kinds.filter((kind) => !legacyOff.has(kind.kind));
```

Почему так: видимая карточка одна, писатель один, откат = убрать строку из списка. Для транспорта (бот) переключатель жёстче: строка коннектора получает `runtime: 'legacy' | 'addon'`, и `TelegramPoller.shouldPoll` её читает — иначе два поллера одного бота дадут двойные ответы.

Данные: Telegram-feed у аддона в своей SQLite. Перенос — копия `orgDataDir/<org>/integrations/telegram/data.db` → `orgDataDir/<org>/addons/telegram-feed/data.db` плюс переезд ref'ов секретов; старые файлы не удаляются до этапа 7, значит откат — это снятие флага.

---

## 8. Проверка паритета

Ограничение репозитория: `bun test`, только unit рядом с кодом, без HTTP/e2e (`AGENTS.md`, «Tests»). Значит «те же поведенческие тесты» из `04` §1 надо понимать буквально иначе, чем в доке:

- Переносятся **существующие unit-спеки** вместе с кодом: `feed/filter.spec.ts`, `feed/normalize.spec.ts`, `db/store.spec.ts`, `auth/login-sessions.spec.ts` (Telegram); `apply-telegram-actions.spec.ts`, `apply-telegram-hitl.spec.ts`, `attach-chat.use-case.spec.ts`, `chat-ref.spec.ts`, `connector-view.spec.ts` (бот).
- Ручной чек-лист паритета на вид функции (5–8 пунктов), выполняется один раз при переключении и записывается в `docs/addons/04`.
- Golden-master на уровне чистых функций: одна и та же фикстура через легаси-функцию и через аддон в unit-спеке. Это единственный способ сравнить две реализации без HTTP-тестов и без нарушения правил.

---

## 9. Где я не согласен с набросками доков

| Док | Утверждение | Возражение |
|---|---|---|
| `01`, §1.3 | «Telegram: подключение, поллинг, транспорт, данные → аддон; ядро сохраняет нейтральный мост» | Мост — это ~830 строк product-семантики (HITL, авто-ответчик, echo). В аддон уходит протокол, мост остаётся в ядре (§2.5) |
| `01`, §2 | Таблица швов ссылается на `capability-set.ts:80`, `pack.ts:27`, `plugin-ir.ts:43` как на готовые точки | Это не швы расширения, а внутренние структуры. Pack-шов — это `PackRegistration`, а он описан только внутри, публичного контракта нет |
| `01`, §2 | `integration/types.ts:93` как «контекст хоста аддона» | Использовать его как форму нельзя (сам же док это признаёт в `05`, §4), но и как ориентир он неполон: нет `connections`, `triggers`, `bridge` |
| `02`, §1.1 | Стабильность `view` — «Смешанная» | Для сторонних аддонов допустим только декларативный view; React-инъекция = импорт кода аддона в UI (§3.2) |
| `03`, Фаза 2 | Подготовка ядра до первого аддона | Шов без потребителя — риск неверной формы. Открываем по одному, вместе с аддоном; исключения — §3.3 |
| `05`, §4 | `AddonContext` «проектируется заново», финальные формы — на ревью ADR-02 | Контракт, который отдают наружу, нельзя оставить TBD. Замораживаем v1 сейчас |
| `05`, §3 | Список семейств без `tool-pack` | Одиночный `tool` не назначается агенту: единица назначения — pack (`pack.ts:27,35`) |
| `06`, CP-01…CP-14 | 14 тикетов подготовки | К платформе аддонов относятся CP-01…CP-10; CP-11…CP-14 (эмбеддинги, поиск, нотификации, телеметрия) — самостоятельные улучшения ядра, их нельзя ставить блокером |

---

## 10. Рефлексия: проверка плана

1. **Dependency Rule.** Новый аддон импортирует только `@harnesys/sdk`; `harnesys` и `@harnesys/contracts` ему недоступны. В ядре нет ни одного импорта аддона — вклады приходят данными через реестр. Легаси `harnesys/integration` изолирован и умирает на этапе 7.
2. **Циклы.** `sdk → (ничего)`, `server infra/addons → sdk`, `add-ons/* → sdk`. `apps/webui` получает дескрипторы по REST, не импортирует аддоны.
3. **Один писатель.** Для feed — переключатель по виду автоматизации; для бота — поле `runtime` в коннекторе. Двух писателей одновременно не бывает ни в одном сценарии.
4. **Мёртвые швы.** Ни один шов не открывается «на будущее»: на каждый есть аддон в §6, кроме S2 — её закрывает Apps (§5), а не аддон. Остались только §3.3 — и на каждый там указано, почему дешевле сейчас.
5. **Необратимые решения.** Их пять: протокол v1, `Apps`/`Accounts`, гранты, `tool-pack` вместо `tool`, разделение «мост в ядре / протокол в аддоне». Всё остальное (имена аддонов, split бота, порядок Google-паков) меняется без переписывания.
6. **Что проверить до старта.** (а) `add-ons/starter` действительно проходит enable после D1–D7 — иначе этап 1 не закрыт; (б) `resolveIntegrationRoute` переносится в SDK без импорта ядра; (в) SQLite аддона доступна только через `db.*` и не имеет пути к `org.db`; (г) отключение аддона не оставляет процессов (`addon-host.ts:116` → `worker.stop`).
7. **Чего план не покрывает.** Публикация/маркетплейс, подпись бандлов, миграция версий аддонов, флот (размещение резидентных аддонов). Это не блокеры для Telegram/Google/GitHub и не должно попадать в первые 10 коммитов.

---

## 11. Что делать на этой неделе

1. **PR-1:** `packages/sdk` — протокол v1, манифест с `platform`/`capabilities`, семейства из §3.2. Никакого поведения.
2. **PR-2:** D1 + D2 (аддон получает БД и `runs.dispatch`) — без этого нельзя даже начать пилот.
3. **PR-3:** D3 + D4 (маршруты с `:param`, `secret.resolve`).
4. **PR-4:** D6 + D7 (allowlist окружения, host-driven worker) — до первого аддона, который держит долгоживущий цикл.
5. **PR-5:** `docs/addons/07-addon-contract-v1.md` — то, что читает автор аддона, и то, на что ссылаются все дальнейшие PR.
6. Решение по `Apps`/`Accounts` (§5) принять **до** написания `telegram-feed`: это единственный шов, который нельзя ввести позже без миграции кредов трёх провайдеров.

Дальше — этап 2 (Apps уже в коде) и пилот `telegram-feed`. Бот и Google идут после, потому что зависят от транспорта и `source-kind` соответственно.
