# Платформа аддонов — чистовой план реализации

*Пакет, манифест, вклады, протокол, права, исполнение, данные, интеграция с Apps/Accounts. Бэкенд + фронтенд. Строится параллельно легаси и не затрагивает его.*

## 0. Назначение, границы, допущения

**Платформа аддонов** — способ добавлять функциональность (инструменты агентов, триггеры, джобы, транспорты чатов, страницы, источники) пакетами, которые ставятся и обновляются независимо от ядра, не могут его уронить и не получают доступа сверх выданного.

Платформа:

- описывает **пакет** и **манифест** аддона: статические вклады, права, требования к аккаунтам, данные;
- ставит, обновляет, удаляет пакеты, хранит версии и контрольные суммы;
- включает аддон **для организации** с явной выдачей прав;
- исполняет код аддона в **изолированном процессе** на пару (организация × аддон), лениво, под надзором;
- регистрирует **вклады** в реестрах ядра как данные, не запуская код аддона;
- даёт аддону **сервисы хоста** по протоколу JSON-RPC: данные, конфиг, секреты, HTTP, аккаунты, события, запуски агентов;
- рисует страницу аддона из дескрипторов.

**Не делает:** хранение учётных данных провайдеров и сценарии подключения (это Apps/Accounts; аддон только объявляет `connections`); бизнес-логику (она в аддонах); маркетплейс, подпись пакетов, удалённое исполнение — для них заложены точки расширения (§21), реализации нет.

**Допущения** (расхождение с реальностью = правка плана):

1. Apps/Accounts реализован по своему плану: есть `AccountsFacadePort`, `AccountHolderPort`, `InboundEventPort`, компонент `AccountPicker`, тип `FieldSpec`.
2. Рантайм аддона — процесс Bun, транспорт — stdio.
3. Сервер — один процесс: супервизор, кэши и лимиты частоты живут в памяти.
4. Хранилище организации — SQLite, миграции идемпотентные, в `infra/org-sqlite/**`; у организации есть каталог данных `orgDataDir/<org>/`.
5. Существующие `infra/addons/*` и `packages/sdk` — черновик этой системы: берутся как источник рабочих решений (JSON-RPC по stdio, супервизор) и перестраиваются по плану. Легаси — `infra/integrations/*`, `harnesys/integration`, `integration-host` — не меняется (§16.1).
6. Для профиля `restricted` на целевых ОС возможна песочница процесса (§7.5). Конкретный механизм — решение реализации; план задаёт порт и политику.
7. Утверждения про VS Code, JetBrains, Chrome и Android в §1 — по общеизвестному опыту этих систем; в этой сессии по их документации не перепроверялись.

## 1. Какие грабли учтены

| Проблема в известных системах | Решение здесь | Где |
| --- | --- | --- |
| Общий процесс расширений: медленное или зависшее расширение тормозит остальные (VS Code) | Процесс на (организация × аддон), таймауты, квоты, watchdog | §8 |
| Нет модели прав: расширение — код с правами пользователя; in-process плагины видят всё (VS Code, JetBrains) | Права с областью и обоснованием, выдаёт администратор организации; диспетчер проверяет каждый вызов; профиль `restricted` с песочницей; сеть и аккаунты — только через хост | §7 |
| Тихое расширение прав при обновлении (урок Chrome и Android) | Версия закреплена за организацией; обновление с новыми правами ждёт согласия | §4.6, §7.3 |
| Ранняя активация замедляет старт (`*` в VS Code, startup-активности в JetBrains) | Активация ленивая и выводится из вкладов; на старте сервера код аддонов не исполняется | §8.2 |
| Выгрузка без перезапуска добавлена поздно, и большинство плагинов к ней не готово (динамические плагины JetBrains) | Статические вклады, владелец и `dispose` у каждой регистрации с первого дня; тест «реестр после `dispose` равен исходному» | §5.3, §17 |
| Утечки после выгрузки (держатся ссылки на классы плагина) | Код аддона умирает вместе с процессом; в ядре нет ссылок на код аддона, только данные | §2, §8 |
| Диапазоны совместимости по номеру сборки (`since/until` в JetBrains, `engines` в VS Code) ломаются каждый релиз | Один целочисленный `platform`, рукопожатие с возможностями, терпимый разбор неизвестных полей, поддержка текущей и предыдущей мажорной версии | §4.5, §6.2 |
| Внутренние и пробные API попадают в публикуемые расширения | `experimental.*` только для `builtin` и `local`; из внешних источников недоступны | §6.6 |
| Произвольный UI-код внутри приложения; выход — песочничные webview | Декларативные секции ядра плюс изолированный `frame`; кода аддона в UI хоста нет | §11 |
| Зависимости плагин → плагин создают хрупкие графы | Зависимостей на уровне кода нет: события, вклады, `connections` | §2 |
| Конфигурация без владельца, путаница областей | Конфиг принадлежит хосту, одна область (организация), секреты отдельно, аккаунты через Apps | §10, §11 |
| Данные расширений без миграций и без политики удаления | Собственная БД, миграции с резервной копией и защитой от понижения версии, удаление с выбором «оставить/стереть» | §9 |
| Автору нечем проверить аддон без запуска всего продукта | SDK с fake-хостом, CLI с горячей перезагрузкой, схемы как источник документации | §14 |
| Нет надзора: падающий плагин перезапускается бесконечно или тихо отключён | Backoff, circuit breaker, карантин с причиной, метрики и журналы на экземпляр | §8.4, §15 |
| Скрытые побочные эффекты инструментов | `effect` в дескрипторе инструмента; политика согласований остаётся в ядре | §5.5 |

## 2. Инварианты

Нарушение любого пункта — отказ на ревью независимо от зелёных тестов.

1. **Dependency rule.** Аддон импортирует только `@harnesys/sdk`; SDK не импортирует ядро; ядро не импортирует аддоны. Вклады приходят данными.
2. **Ядро не знает аддонов и не ветвится по семейству, методу или сервису.** Диспетчеры табличные: модули семейств и сервисов регистрируются в реестрах (§5.2, §7.1).
3. **Вклады статические.** Они объявлены в манифесте и регистрируются без запуска кода. Динамической регистрации из кода аддона нет.
4. **Активация ленивая.** На старте сервера код аддонов не исполняется.
5. **Нет ambient authority.** Всё сверх базового набора — через право, выданное организации на конкретную версию. Эффективный доступ = декларация ∩ грант ∩ политика.
6. **Изоляция.** Процесс на (организация × аддон). Аддон не видит других организаций, чужих данных и процессов.
7. **Владелец и `dispose`.** Каждая регистрация принадлежит `OwnerKey`; выключение, обновление и удаление не оставляют процессов, регистраций, таймеров и подписок.
8. **Секреты провайдеров не уходят аддону по умолчанию.** Аккаунты — через `connections` и `bindings`; токен можно вообще не отдавать аддону (инъекция в `http.fetch`).
9. **Обновление с расширением прав не применяется молча.** Организация остаётся на закреплённой версии до согласия.
10. **Контракт растёт аддитивно.** Удаление или смена семантики — новая мажорная версия `platform`.
11. **Нет зависимостей аддон → аддон** на уровне кода.
12. **UI аддона — декларативные секции ядра и изолированный `frame`.** Код аддона в UI хоста не исполняется.
13. **Наружу идут коды `AddonErrorReason`,** не тексты исключений аддона.
14. **Fail-closed:** неизвестный `platform`, неизвестное обязательное семейство, битый манифест, несовпадение контрольной суммы — отказ, не деградация.
15. **Параллельность.** Пути легаси из §16.1 не меняются; новая система не читает и не пишет легаси-таблицы и секреты.

## 3. Модель

### 3.1 Сущности

| Сущность | Уровень | Что это |
| --- | --- | --- |
| **Пакет** (`AddonPackage`) | хост | Каталог с `addon.json`, кодом и ресурсами; идентифицируется `id` + `version` + `digest` |
| **Установка** | хост | Запись в `addons.lock.json`: версия, источник, контрольная сумма, доверие (`trust`) |
| **Активация** (`OrgAddon`) | организация | Включён ли аддон, закреплённая версия, выданные права, конфиг |
| **Экземпляр** (`Instance`) | рантайм | Процесс аддона для организации; создаётся лениво, живёт под надзором |
| **Вклад** (`Contribution`) | организация | Статическая запись манифеста в реестре ядра, принадлежит `OwnerKey` |
| **Привязка** (`Binding`) | организация | Какие аккаунты Apps выданы аддону под какую потребность `connection` |
| **Экземпляр триггера** | организация | Пользовательская настройка вклада `trigger`: конфиг, цель, включён ли |

### 3.2 Идентификаторы

`addonId = <publisher>.<name>`, оба сегмента `[a-z][a-z0-9-]*`; встроенные аддоны — издатель `harnesys`. Идентификатор вклада локален в аддоне (`[a-z][a-z0-9-]*`), глобальный ключ — `<addonId>/<contributionId>`. Имена инструментов, видов триггеров, событий и маршрутов получают префикс аддона на стороне ядра, коллизий между издателями нет.

### 3.3 Состояния

Желаемое и фактическое состояния разделены; фактическое приводит к желаемому цикл согласования (reconciler), а не обработчики кнопок.

| Что | Значения | Где живёт |
| --- | --- | --- |
| Желаемое | `enabled`, закреплённая `version`, выданные права | `org_addons` |
| Совместимость | `ok` · `needs_consent` (манифест версии просит больше, чем выдано) · `incompatible` (`platform` не поддерживается, обязательное семейство неизвестно) | вычисляется |
| Экземпляр | `stopped → starting → running → stopping → stopped`; `failed` (ошибка и пауза backoff); `quarantined` (сработал breaker) | память супервизора, зеркало в `org_addons.health` |

Желаемо «работает» = `enabled` ∧ совместимость `ok` ∧ не `quarantined` ∧ есть причина работать (§8.2). Ручные действия (включить, перезапустить, выйти из карантина) меняют желаемое состояние или сбрасывают счётчики; процессами управляет только супервизор.

### 3.4 Схема данных

Хостовые файлы: `~/.harnesys/add-ons/<id>/<version>/` (пакеты), `~/.harnesys/add-ons/addons.lock.json`. В хранилище организации — пять таблиц:

```sql
CREATE TABLE org_addons (
  org_id         TEXT NOT NULL,
  addon_id       TEXT NOT NULL,
  version        TEXT NOT NULL,                  -- закреплённая версия
  enabled        INTEGER NOT NULL DEFAULT 0,
  grants_json    TEXT NOT NULL DEFAULT '[]',     -- выданные права: [{id, scope}]
  grants_digest  TEXT NOT NULL DEFAULT '',       -- хэш декларации прав, на которую выданы
  config_json    TEXT NOT NULL DEFAULT '{}',     -- несекретные значения конфига
  health         TEXT NOT NULL DEFAULT 'stopped' CHECK (health IN ('stopped','running','failed','quarantined')),
  last_error     TEXT,                           -- код AddonErrorReason
  created_at     TEXT NOT NULL,
  updated_at     TEXT NOT NULL,
  PRIMARY KEY (org_id, addon_id)
);

CREATE TABLE addon_bindings (
  org_id        TEXT NOT NULL,
  addon_id      TEXT NOT NULL,
  connection_id TEXT NOT NULL,                   -- потребность из манифеста
  account_id    TEXT NOT NULL,                   -- аккаунт Apps/Accounts
  created_at    TEXT NOT NULL,
  PRIMARY KEY (org_id, addon_id, connection_id, account_id)
);
CREATE INDEX addon_bindings_account ON addon_bindings (org_id, account_id);

CREATE TABLE addon_trigger_instances (
  id           TEXT PRIMARY KEY,
  org_id       TEXT NOT NULL,
  addon_id     TEXT NOT NULL,
  trigger_id   TEXT NOT NULL,                    -- вклад семейства trigger
  label        TEXT NOT NULL,
  config_json  TEXT NOT NULL DEFAULT '{}',
  target_json  TEXT NOT NULL DEFAULT '{}',       -- какого агента/тред запускать
  enabled      INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX addon_trigger_instances_addon ON addon_trigger_instances (org_id, addon_id);

CREATE TABLE addon_trigger_fires (
  instance_id TEXT NOT NULL,
  run_key     TEXT NOT NULL,
  fired_at    INTEGER NOT NULL,
  PRIMARY KEY (instance_id, run_key)             -- окно дедупликации, чистится по TTL
);

CREATE TABLE addon_job_state (
  org_id      TEXT NOT NULL,
  addon_id    TEXT NOT NULL,
  job_id      TEXT NOT NULL,
  next_run_at INTEGER,
  last_run_at INTEGER,
  last_status TEXT,                              -- ok или код AddonErrorReason
  enabled     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (org_id, addon_id, job_id)
);
```

`addon_trigger_instances` — то, что читает существующий каталог автоматизаций через реестр; под свою модель автоматизаций таблица адаптируется, контракт между ядром и аддоном (§12.1) от этого не меняется. Данные самого аддона — отдельный файл `orgDataDir/<org>/addons/<addonId>/data.db` (§9).

Дополнение: к пяти ядровым таблицам добавляется шестая — `addon_transport_bindings` (привязки чат ↔ тред транспортного моста, §12.4). Она живёт рядом с ними в том же хранилище организации и не меняет контрактов перечисленных пяти таблиц.

## 4. Пакет и манифест

### 4.1 Формат пакета

Каталог или архив `.hxa` (zip) с корнем:

```
addon.json            манифест (JSON; ключи совпадают с типом AddonManifest)
dist/                 самодостаточный бандл (одним файлом, зависимости внутри)
migrations/NNNN_*.sql миграции данных аддона (§9.3)
l10n/<locale>.json    переводы строк манифеста
content/              скиллы и промпты (семейство content)
assets/               иконка
```

Хост не запускает скрипты установки (никаких `postinstall`) и не ставит зависимостей: бандл собирает автор (`hxa build`). Установка — копирование проверенных файлов.

### 4.2 Манифест

```ts
// @harnesys/sdk — manifest.ts
export type L10n = string | Record<string, string>;     // строка или { en, ru, … }; '%key%' берётся из l10n/<locale>.json

export interface AddonManifest {
  id: string;                          // 'harnesys.telegram-feed'
  version: string;                     // semver
  platform: number;                    // мажорная версия протокола, под которую собран аддон; обязательно
  title: L10n;
  description: L10n;
  icon?: string;                       // относительный путь в assets/
  homepage?: string;
  license?: string;
  runtime: { entry: string; profile: 'trusted' | 'restricted' };    // запрошенный профиль исполнения (§7.5)
  activation: 'lazy' | 'resident';     // resident — только при праве lifecycle.resident (§8.2)
  permissions: PermissionRequest[];    // §7.2
  connections: ConnectionRequirement[];// §10
  data?: { migrations: string; quotaMb?: number };                  // §9
  features?: string[];                 // что требуется от хоста сверх platform: 'family:source-kind@1'
  contributions: Contribution[];       // §5
}

export interface Contribution {
  id: string;                          // локален в аддоне
  family: string;                      // 'tool-pack', 'trigger', …
  v?: number;                          // версия схемы дескриптора, по умолчанию 1
  optional?: boolean;                  // true: хост без такого семейства пропускает вклад с предупреждением
  descriptor: JsonObject;              // схема — по семейству
}
```

Пример (в файле — JSON с теми же ключами):

```ts
const manifest: AddonManifest = {
  id: 'harnesys.github-tools', version: '1.2.0', platform: 1,
  title: 'GitHub tools', description: '%description%',
  runtime: { entry: './dist/index.js', profile: 'restricted' },
  activation: 'lazy',
  permissions: [
    { id: 'http.fetch', scope: { hosts: ['api.github.com'] }, reason: 'Calls the GitHub REST API on behalf of the bound installation' },
  ],
  connections: [
    { id: 'github', label: 'GitHub installation', accountKinds: ['github-installation'], cardinality: 'many' },
  ],
  contributions: [
    { id: 'pack', family: 'tool-pack', descriptor: { name: 'github', connection: 'github', tools: [ /* … */ ] } },
  ],
};
```

### 4.3 Валидация манифеста

Zod-схема манифеста плюс схема дескриптора каждого вклада (из модуля семейства). Перекрёстные проверки: `connection` в дескрипторах ссылается на объявленное `connections[].id`; идентификаторы вкладов, маршрутов, джобов, воркеров уникальны; `permissions[].id` известны реестру прав; строки `%key%` присутствуют в `l10n/en.json`; размеры и глубина дескрипторов ограничены. Валидатор возвращает **все** нарушения сразу. JSON Schema манифеста публикуется из тех же Zod-схем — редакторы авторов подсвечивают ошибки без хоста.

### 4.4 Источники и доверие

`AddonSourcePort` читает пакеты из источника; доверие (`trust`) выставляет источник, а не манифест:

| `trust` | Источник | Профиль | `experimental.*` | Подпись |
| --- | --- | --- | --- | --- |
| `builtin` | `add-ons/` монорепо | `trusted` или `restricted` | разрешено | не требуется |
| `local` | каталог разработчика | `trusted`, в UI пометка «dev» | разрешено | не требуется |
| `external` | url / реестр (слот §21) | только `restricted` | запрещено | обязательна; пока верификатор не реализован, источник выключен |

Права во всех случаях выдаются явно (§7.3); `trust` определяет только допустимые профиль и экспериментальные возможности.

### 4.5 Версии и совместимость

Три независимые оси:

- **`platform`** — мажорная версия протокола и манифеста. Хост поддерживает текущую и предыдущую мажорные версии одновременно: на каждую — `ProtocolAdapter`, переводящий в каноническую внутреннюю форму.
- **Версия схемы вклада `v`** — модуль семейства объявляет поддерживаемые версии; новая версия дескриптора добавляется рядом со старой.
- **Версия аддона (semver)** — свободна; выбор версии для организации — §4.6.

Правила внутри одной мажорной версии:

1. Разрешено: новые необязательные поля, новые методы и сервисы, новые семейства, новые члены enum. Читатели терпимы к неизвестным полям; неизвестный член enum трактуется как `unknown`, а не как ошибка.
2. Неизвестное семейство: вклад `optional: true` пропускается с предупреждением, иначе аддон помечается `incompatible` (fail-closed).
3. Возможности согласуются рукопожатием (§6.2), а не сравнением номеров сборок. `features` в манифесте — жёсткое требование; недостающая возможность хоста → `incompatible`.
4. Устаревшее помечается: хост возвращает `deprecations[]` в рукопожатии, пишет в журнал аддона и показывает в админке. Удаление — только в новой мажорной версии, предыдущая поддерживается как минимум одну мажорную версию.

### 4.6 Установка, обновление, откат, удаление

**Установка пакета (хост).** `plan` → `confirm`:

1. `plan`: источник → загрузка в staging → проверка контрольной суммы (и подписи для `external`) → валидация манифеста → расчёт объявленных прав. Ничего не исполняется. Ответ — план: манифест, права, `trust`, предупреждения.
2. `confirm` (администратор хоста): атомарное перемещение в `add-ons/<id>/<version>/`, запись в `addons.lock.json` (`id`, `version`, `digest`, источник, `trust`). Повтор идемпотентен. Несколько версий лежат рядом — это нужно для закрепления версий по организациям.

**Включение в организации.** `enable { version?, grants }`: проверка совместимости, расчёт выдаваемых прав (§7.3), закрепление версии, регистрация вкладов, запуск согласования состояния.

**Обновление.** `update { version, grants? }`:

- расчёт разницы прав между закреплённой и новой версией;
- если новая версия не расширяет права — применяется сразу (политика организации `updatePolicy`: `manual` по умолчанию или `auto-within-grants`);
- если расширяет — состояние `needs_consent`: организация остаётся на закреплённой версии до явного согласия, UI показывает разницу;
- применение: штатная остановка экземпляра → смена версии → атомарная замена вкладов (§5.3) → старт; миграции данных выполняются при активации (§9.3);
- при неудаче активации новой версии (миграция, несовместимость, падение на старте) хост откатывает закрепление на прежнюю версию, восстанавливает резервную копию данных и пишет `last_error` — `rollbackOnFailure` включён всегда.

**Откат вручную** — закрепление прежней установленной версии; защита данных от понижения (§9.3) может его отклонить.

**Удаление в организации.** Отключение → снятие регистраций, остановка процесса → выбор «оставить данные» или «стереть»: стирание удаляет `data.db`, каталог данных, секреты аддона, `addon_bindings`, экземпляры триггеров, состояние джобов. Конфиг сохраняется при «оставить». **Удаление пакета на хосте** отклоняется (`in_use`), пока версию закрепляет хотя бы одна организация; неиспользуемые версии чистит `prune`.

## 5. Вклады и семейства

### 5.1 Принцип

Семейство вкладов — расширяемая точка ядра. Ядро определяет семейство и владеет его политикой; аддон приносит **дескрипторы** (данные) и **обработчики** (код в своём процессе). Политика (лимиты, согласования, назначение агентам) остаётся в ядре и аддоном не обходится.

### 5.2 Контракт модуля семейства

```ts
// domain/addons/family-module.ts
export interface OwnerKey { orgId: string; addonId: string; version: string }
export interface Disposable { dispose(): void }

export interface FamilyModule<D extends JsonObject = JsonObject> {
  readonly family: string;                       // 'tool-pack'
  readonly versions: readonly number[];          // поддерживаемые версии схемы дескриптора
  schema(v: number): ZodType<D>;
  crossCheck?(d: D, manifest: AddonManifest): Violation[];
  readonly handlers: readonly HandlerSpec[];     // методы host→addon, которые вызывает семейство (§6.3)
  readonly permissions: readonly string[];       // права, без которых вклад бесполезен (для предупреждений)
  register(owner: OwnerKey, d: D): Disposable;   // идемпотентно, без запуска кода аддона
}
```

Модуль — класс, который конструируется со своими потребительскими портами (`PackRegistryPort`, `AutomationCatalogPort`, `RouteTablePort`…) и портом вызова аддона `AddonCallPort`. Единственный список — `infra/addons/families/index.ts`; ядро ветвится не по имени семейства, а обращается к модулю из карты.

### 5.3 Реестр вкладов

`ContributionRegistry` управляет жизненным циклом регистраций:

- `activate(owner, manifest)`: валидация → `register` по каждому вкладу в порядке манифеста. Первая ошибка откатывает уже выполненные регистрации (все или ничего).
- `deactivate(owner)`: `dispose` в обратном порядке, идемпотентно.
- `swap(oldOwner, newOwner, newManifest)`: сначала полная регистрация новой версии, затем `dispose` старой; при ошибке `dispose` новой, старая остаётся.
- Чтение: `contributions(orgId, family)` и `onChange(orgId, family, handler)` — потребители ядра реактивны, перезапуск не нужен.
- Регистрации не зависят друг от друга: ссылки между вкладами проверяются в `crossCheck`, а не в `register`.

Гарантия, проверяемая тестом: после `deactivate` состояние всех реестров всех семейств равно состоянию до `activate`.

### 5.4 Состав семейств

| Семейство | Что описывает | Политикой владеет | Код аддона |
| --- | --- | --- | --- |
| `config` | поля настроек (`FieldSpec[]`) | хост: хранит, валидирует, рисует | `config.changed` (уведомление) |
| `view` | секции страницы аддона (§11) | рендерер ядра | данные секций — через `route` |
| `route` | HTTP под `/orgs/:orgId/addons/:id/r/*` | хост: guard, схемы, лимиты | `route.handle` |
| `tool-pack` | пак инструментов агента | ядро: назначение агентам, согласования | `tools.call` |
| `trigger` | вид триггера и его настройки | ядро: экземпляры, лимиты, дедупликация, запуск | `trigger.start/stop` |
| `job` | периодическая задача | ядро: расписание, перезапуск | `job.run` |
| `worker` | фоновая активность | ядро: старт, остановка, перезапуск | `worker.start/stop` |
| `transport` | транспорт внешнего чата | ядро: мост (авто-ответчик, согласования, привязка чат↔тред) | `transport.send/edit/typing` |
| `hook` | подписка на события | шина ядра | `hook.deliver` |
| `content` | скиллы и промпты | репозиторий контента | — (файлы пакета) |
| `source-kind` | бэкенд источника (например, облачный диск) | ядро: зеркало, синхронизация | `source.*` (резерв) |
| `mcp`, `lsp` | описание сервера | реестры ядра: ядро само запускает сервер под политикой профилей | — |

`tool-pack`, а не одиночный `tool`: единицей назначения агенту в ядре является пак (имя, описание, настройки, скиллы, иконка).

### 5.5 Дескрипторы ключевых семейств

```ts
export interface ToolPackDescriptor {
  name: string; title: L10n; description: L10n; icon?: string;
  connection?: string;                    // какой connection нужен паку
  specFields?: FieldSpec[];               // настройки пака на уровне назначения агенту
  skills?: string[];                      // id вкладов content
  tools: ToolDescriptor[];
}
export interface ToolDescriptor {
  name: string; description: L10n;
  inputSchema: JsonSchema;                // подмножество §6.5; ядро валидирует вход до вызова
  outputSchema?: JsonSchema;
  effect: 'read' | 'write' | 'destructive';   // политика согласований в ядре; аддон её понизить не может
  idempotent?: boolean; timeoutSec?: number; maxResultKb?: number;
}

export interface TriggerDescriptor {
  kind: string;                           // 'telegram.feed'
  title: L10n; description: L10n;
  configFields: FieldSpec[];
  connection?: string;
  limits?: { perDay?: number; throttleSec?: number; maxBurst?: number };
}

export interface JobDescriptor {
  id: string; title: L10n;
  schedule: { cron: string } | { everySec: number };
  timezone?: 'org' | 'utc';
  timeoutSec?: number;
  catchUp: 'none' | 'once';               // что делать с пропущенными запусками после простоя
  defaultEnabled?: boolean;
}

export interface WorkerDescriptor { id: string; title: L10n; autostart: boolean; restart: 'on-failure' | 'never' }

export interface RouteDescriptor {
  id: string; method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  path: string;                           // '/items/:id'
  role?: 'member' | 'admin';              // по умолчанию member
  exposure?: 'org' | 'public';            // public требует право routes.public
  bodyLimitKb?: number; requestSchema?: JsonSchema;
}

export interface HookDescriptor {
  id: string;
  on: { event: string }                                       // шаблон события хоста или аддона: 'thread.*', 'harnesys.other.*'
    | { providerEvent: { connection: string; types?: string[] } };   // события провайдера из Apps (InboundEventPort)
}

export interface TransportDescriptor {
  provider: string; title: L10n; connection: string;
  capabilities: TransportCapabilities;    // контракт ядра: threads, edit, typing, attachments, …
  limits: { textMax: number };
}
```

### 5.6 Добавление нового семейства

Модуль в `infra/addons/families/<family>/` с потребительскими портами, схемой дескриптора (`v = 1`), перечнем обработчиков и правом; строка в `families/index.ts`; секция страницы, если семейству нужна своя (§11). Другие семейства и существующие аддоны не меняются: аддоны без нового семейства работают как прежде, аддоны с ним требуют хост, который его знает (`features`, §4.5). Эволюция схемы семейства — новой версией `v`, старая версия поддерживается.

## 6. Протокол

### 6.1 Транспорт и форма

JSON-RPC 2.0, одно сообщение — одна JSON-строка (NDJSON) по stdio, UTF-8, максимум 8 MiB на сообщение. Двусторонний: обе стороны отправляют запросы, ответы и уведомления. `stderr` — журнал экземпляра, не протокол. Транспорт скрыт за `AddonTransport` (`send`, `onMessage`, `close`): stdio, in-process и будущие каналы (сокет, удалённый хост) дают одну семантику.

### 6.2 Рукопожатие

```ts
// host → addon: initialize
export interface InitializeParams {
  platform: number;                       // выбранная мажорная версия (из поддерживаемых хостом)
  host: { version: string; features: string[] };
  instance: { orgId: string; generation: number; dataDir: string; locale: string };
  permissions: EffectivePermission[];     // эффективные права (§7.3)
  experimental: string[];                 // доступные experimental.* (пусто для external)
  deprecations: string[];                 // что из используемого устарело
}
export interface InitializeResult {
  addon: { id: string; version: string };
  handlers: string[];                     // реализованные методы host → addon
  deactivateTimeoutMs?: number;
}
```

После ответа хост шлёт уведомление `initialized`; аддон вправе вызывать сервисы хоста только после него. Хост сверяет `handlers` с обработчиками, которые требуют **необязательные-не-пропущенные** вклады манифеста; нехватка → остановка с `incompatible_handlers`. Хост никогда не вызывает метод, которого нет в `handlers`.

### 6.3 Вызовы host → addon

Все запросы несут `params._meta: CallMeta`:

```ts
export interface CallMeta {
  correlationId: string;
  deadline: number;                       // абсолютное время, мс epoch
  principal: { type: 'agent' | 'user' | 'system'; id?: string };
  agentId?: string; threadId?: string; runId?: string;
  locale: string;
}
```

| Метод | Семейство | Параметры → результат |
| --- | --- | --- |
| `initialize`, `initialized` (уведомление) | — | §6.2 |
| `shutdown`, `ping` | — | `{ reason, deadlineMs }` → `{}` |
| `config.changed` (уведомление) | `config` | `{ keys }` |
| `permissions.changed` (уведомление) | — | `{ permissions }` |
| `lifecycle.upgrade` (необязательный) | — | `{ fromVersion }` → `{}`; вызывается после SQL-миграций |
| `tools.call` | `tool-pack` | `{ pack, tool, input }` → `{ output }` |
| `route.handle` | `route` | `{ routeId, request }` → `{ status, headers?, body? }` |
| `trigger.start`, `trigger.stop` | `trigger` | `{ instanceId, kind, config, target? }` / `{ instanceId }` |
| `job.run` | `job` | `{ jobId }` → `{}` |
| `worker.start`, `worker.stop` | `worker` | `{ workerId }` |
| `transport.send`, `transport.edit`, `transport.typing` | `transport` | сообщения контракта ядра |
| `hook.deliver` | `hook` | `{ hookId, event }` → `{}` (ответ — сигнал противодавления) |
| `accounts.changed` (уведомление) | — | `{ connection, accountId, status }` |

Семейство добавляет свои методы через `handlers` модуля; ядро не знает их имён вне таблицы протокола (§6.7).

### 6.4 Вызовы addon → host (сервисы)

Организация и аддон проставляются хостом по экземпляру — подделать их нельзя.

| Сервис | Методы | Право |
| --- | --- | --- |
| `config` | `config.get` → значения | базовое |
| `secrets` | `secrets.get { key }` — только собственные секретные поля конфига | базовое |
| `db` | `db.exec`, `db.all`, `db.get`, `db.run`, `db.batch` (атомарный пакет операторов) | базовое |
| `log` | `log.write { level, message, fields }` | базовое |
| `events` | `events.emit { name, payload }` — только в своём пространстве имён `<addonId>.<name>` | базовое |
| `http` | `http.fetch { url, method, headers?, body?, auth? }` | `http.fetch` (хосты) |
| `accounts` | `accounts.list { connection }`, `accounts.report { connection, accountId?, code }` | `accounts.use` |
|  | `accounts.access { connection, accountId? }` — сырые учётные данные | `accounts.credentials` |
| `runs` | `runs.dispatch`, `threads.create` | `runs.dispatch`, `threads.create` |
| `triggers` | `triggers.fire { instanceId, runKey, text, … }` — только для экземпляров своих триггеров | через вклад `trigger` |
| `bridge` | `bridge.inbound { … }` — только для своего `transport` | `bridge.inbound` |
| `workers` | `workers.report { workerId, state, code? }` | через вклад `worker` |

Подписок во время работы нет: подписки на события объявляются статически вкладом `hook`.

### 6.5 Схемы

Параметры и результаты каждого метода описаны Zod-схемами в SDK (§6.7). Схемы инструментов и маршрутов — подмножество JSON Schema: `type`, `properties`, `required`, `items`, `enum`, `const`, границы чисел и длин, `additionalProperties`, ограниченные `oneOf`/`anyOf`, `description`, `default`; локальные `$defs`; без внешних `$ref`; глубина до 8, размер до 64 KiB. Хост валидирует вход до вызова аддона и результат после; нарушение — `invalid_params` / `invalid_response`.

### 6.6 Отмена, прогресс, ошибки, лимиты

- **Отмена:** уведомление `$/cancel { id }` в обе стороны; по истечении `deadline` хост отменяет сам.
- **Прогресс:** `$/progress { token, value }` от аддона для долгих обработчиков; хост пересылает в поток запуска или UI.
- **Ошибки:** JSON-RPC error с `data: { reason, retryable, detail? }`; `detail` — короткий диагностический текст для журнала, пользователю не показывается.

```ts
export type AddonErrorReason =
  | 'invalid_params' | 'invalid_response' | 'permission_denied' | 'not_found' | 'conflict'
  | 'quota_exceeded' | 'rate_limited' | 'timeout' | 'cancelled' | 'unavailable'
  | 'unsupported' | 'account_failed' | 'incompatible_handlers' | 'migration_failed'
  | 'permission_revoked' | 'internal';
```

`account_failed` дополнительно несёт `AccountErrorCode` из Apps/Accounts.

- **Лимиты:** 64 одновременных вызова host → addon (очередь 256, дальше `unavailable`) и 64 addon → host. Таймауты по умолчанию: `tools.call` 60 с (дескриптор может поднять до 600 с), `route.handle` 30 с, `hook.deliver` 10 с, `job.run` по дескриптору (до 3600 с), `db.*` 5 с, `http.fetch` 30 с.
- **Экспериментальное:** методы и поля с префиксом `experimental.` доступны, только если указаны в `initialize.experimental`; иначе `unsupported`. В `external` аддонах — никогда.

### 6.7 Протокол как код

`packages/sdk/src/protocol/` — карта методов `{ метод: { направление, params, result, право } }` на Zod. Из неё генерируются: типы клиента (аддон) и сервера (хост), JSON Schema, golden-фикстуры сообщений для контрактных тестов, диспетчер хоста. Расхождение схемы и реализации — ошибка компиляции или контрактного теста, а не поведение во время работы.

## 7. Сервисы хоста и права

### 7.1 Модули сервисов и диспетчер

```ts
// domain/addons/host-service.ts
export interface HostMethodSpec<P = unknown, R = unknown> {
  name: string;                           // 'db.run'
  params: ZodType<P>; result: ZodType<R>;
  permission: PermissionRef | null;       // null — базовый набор
  limits?: { rate?: RateSpec; timeoutMs?: number; maxResultKb?: number };
  handle(ctx: HostCallContext, params: P): Promise<R>;
}
export interface HostServiceModule { readonly namespace: string; readonly methods: readonly HostMethodSpec[] }

export interface HostCallContext {
  orgId: string; addonId: string; instanceId: string; generation: number;
  correlationId: string; grants: EffectiveGrants; now(): number; signal: AbortSignal;
}
```

`HostDispatcher.dispatch(instance, method, params)` — единственная точка входа addon → host:

1. найти метод в карте (нет → `unsupported`);
2. поколение экземпляра устарело → отбросить;
3. проверить право: `permission` покрывается актуальным эффективным грантом (читается на каждом вызове, поэтому отзыв действует немедленно);
4. валидировать `params` схемой;
5. лимит частоты и квоты;
6. выполнить `handle` с таймаутом;
7. валидировать результат, ограничить размер;
8. метрики и аудит.

`switch` по методу нет. Список — `infra/addons/services/index.ts`; проверка при загрузке: имена методов уникальны, права существуют, у каждого метода есть обе схемы. Новый сервис — новый модуль и строка в списке; существующие аддоны не меняются.

### 7.2 Права

```ts
export interface PermissionDefinition {
  id: string;                             // 'http.fetch'
  risk: 'low' | 'medium' | 'high';
  baseline?: boolean;                     // выдаётся всегда, в манифесте не заявляется
  scope?: ZodType<JsonObject>;            // форма области: { hosts: string[] }
  covers(granted?: JsonObject, needed?: JsonObject): boolean;
  describe(scope?: JsonObject): L10n;     // текст для окна согласия
}
export interface PermissionRequest { id: string; scope?: JsonObject; reason: L10n; optional?: boolean }
```

Реестр прав собирается из модулей сервисов и семейств. `reason` обязателен: окно согласия показывает администратору причину, риск и область каждого права.

| Право | Риск | Область | Что даёт |
| --- | --- | --- | --- |
| базовые: `config.read`, `log`, `db`, `secrets.own`, `events.emit.own` | low | — | собственные данные, конфиг, журнал, события в своём пространстве |
| `http.fetch` | medium | `{ hosts }` | HTTP только к перечисленным хостам, через хост (егресс-политика: https, блок приватных адресов) |
| `accounts.use` | medium | `{ connections? }` | список привязанных аккаунтов, `accounts.report`, `http.fetch` с инъекцией учётных данных |
| `accounts.credentials` | high | `{ connections }` | сырые учётные данные |
| `runs.dispatch`, `threads.create` | medium | — | запуск агентов, создание тредов |
| `events.subscribe` | low | `{ patterns }` | вклады `hook` на события хоста и других аддонов |
| `bridge.inbound` | medium | — | входящие сообщения транспорта |
| `routes.public` | high | — | публичные маршруты |
| `lifecycle.resident` | medium | — | постоянный процесс |

### 7.3 Выдача и вычисление

```
эффективные = базовые ∪ (декларация ∩ грант ∩ политика организации ∩ политика хоста)
грант       = { addonId, version, declaredDigest, grants: [{ id, scope? }], grantedAt, grantedBy }
```

- При `enable` и `update` администратор видит каждое объявленное право с причиной, риском и областью и выбирает подмножество. Обязательное право отклонить нельзя — аддон не включается. Необязательное (`optional`) можно: аддон получает урезанный набор в `initialize.permissions` и обязан это учитывать.
- Грант привязан к `declaredDigest` — хэшу канонизированной декларации прав версии. Версия, у которой каждое право покрыто имеющимся грантом, наследует его; иначе — `needs_consent` (§4.6).
- Политики — слой пересечения, а не выдача: хостовая (`addons.policy`: запрещённые права и хосты, разрешённые источники, допустимость непесочничных `external`) и организационная.
- Отзыв права пересчитывает эффективный набор; экземпляр получает `permissions.changed`; диспетчер перестаёт пропускать вызовы немедленно. Отзыв обязательного права останавливает аддон (`permission_revoked`).

### 7.4 Секреты аддона

`secrets.get` отдаёт только поля конфига типа `secret` своего аддона; хранение — `SecretStorePort`, ключ `addon:<orgId>:<addonId>:<key>`; UI значения не получает. Всё, что касается аккаунтов провайдеров, — §10, не секреты аддона.

### 7.5 Профили исполнения

| Профиль | Что это | Для кого |
| --- | --- | --- |
| `trusted` | Процесс с очищенным окружением, без песочницы ОС. Граница — **отказоустойчивость, не безопасность**: вредоносный код не остановлен | `builtin`, `local` |
| `restricted` | Процесс в песочнице: чтение — каталог пакета; запись — каталог данных и tmp аддона; сеть запрещена (только stdio к хосту); запуск процессов запрещён; окружение — белый список | `external` (обязательно), по желанию `builtin` |

Всё внешнее для `restricted` аддона идёт через `http.fetch`. Если на ОС нет механизма песочницы, `external` не стартует, пока администратор хоста явно не включит `allowUnsandboxedExternal` (предупреждение в UI, запись в аудит). Запуск — `SandboxLauncherPort.spawn(spec)`: адаптеры по ОС и адаптер `none` для `trusted`. Конформанс песочницы (попытка открыть сокет, прочитать вне каталога, запустить процесс → отказ) исполняется в CI на поддерживаемых ОС; где механизма нет, профиль `restricted` объявляется недоступным.

## 8. Исполнение

### 8.1 Экземпляр

Процесс на (организация × аддон): `bun run <entry>`, cwd — каталог пакета (только чтение), окружение — белый список (`PATH`, `TZ`, `LANG`) плюс `HARNESYS_ADDON_ID`, `HARNESYS_DATA_DIR`, `HARNESYS_PLATFORM`. Окружение хоста не наследуется, секреты через окружение не передаются. `stderr` — в журнал экземпляра. Тайм-аут запуска — 15 с до ответа на `initialize`.

### 8.2 Ленивая активация

`ensureRunning(orgId, addonId, reason)` (single-flight: параллельные вызовы ждут один запуск) вызывается из `AddonCallPort` — при вызове инструмента, маршрута, джоба, хука, транспорта, триггера, а также при включении экземпляра триггера и автостарте воркера. «Причины жить» — активный экземпляр триггера, запущенный воркер, активная привязка транспорта, `activation: resident` (при праве), незавершённый вызов. Нет причин — idle-таймаут (5 минут после последнего вызова) и штатная остановка.

На старте сервера хост только читает `org_addons` и регистрирует вклады как данные. Код запускается лишь у экземпляров с фоновой причиной жить — после готовности сервера, асинхронно, с рассеиванием по времени; старт сервера их не ждёт.

### 8.3 Согласование

Reconciler сравнивает желаемое и фактическое состояние (периодически и по событиям) и выполняет `start`/`stop`/`restart` идемпотентно. Он единственный, кто создаёт и убивает процессы.

### 8.4 Надзор

- `ping` раз в 15 с (таймаут 5 с); три промаха — перезапуск.
- Лимит RSS (по умолчанию 512 MiB, политика хоста): превышение — перезапуск.
- Падение → перезапуск с экспоненциальной паузой 1…60 с и джиттером; **circuit breaker:** более 5 падений за 10 минут → `quarantined`: автозапуск прекращён, в UI видны причина и хвост журнала, выход — ручной «Restart» (сброс счётчика).
- Падение во время вызова: исходящие вызовы завершаются `unavailable` (`retryable: true`); неидемпотентные вызовы хост сам не повторяет.
- **Поколение:** каждый запуск увеличивает `generation`; сообщения устаревшего поколения отбрасываются; остановка снимает всё runtime-состояние поколения.

### 8.5 Штатная остановка

`shutdown { reason, deadlineMs: 5000 }` → ожидание текущих вызовов до дедлайна → закрытие stdin → SIGTERM → через 2 с SIGKILL группы процессов. После остановки нет сирот-процессов, таймеров, регистраций рантайма; проверяется тестом на каждом пути остановки (disable, update, uninstall, idle, quarantine).

### 8.6 Что перезапускает, что нет

Конфиг → уведомление `config.changed`, без перезапуска. Права → `permissions.changed`, без перезапуска. Привязки аккаунтов → без перезапуска (разрешаются при каждом вызове). Версия → перезапуск. Изменение профиля исполнения → перезапуск.

### 8.7 Восстановление после старта экземпляра

После `initialized` хост повторно отдаёт `trigger.start` для всех включённых экземпляров, `worker.start` для автостартующих воркеров и пересчитывает ближайшие запуски джобов. Аддон обязан быть идемпотентным по этим вызовам.

### 8.8 In-process режим

Для `builtin`/`local` с профилем `trusted`: тот же `HostDispatcher` и тот же набор методов; вызов — прямой вызов функции, параметры и результаты проходят JSON-копирование ради паритета с процессным режимом. Изоляции сбоя нет. Режим отключается без изменения контракта.

### 8.9 Квоты

| Ресурс | По умолчанию |
| --- | --- |
| Частота вызовов addon → host | 200 в секунду, всплеск 400 |
| Размер `data.db` | 256 MiB (манифест может просить меньше; максимум — политика хоста) |
| Время оператора SQL | 5 с |
| `http.fetch` | ответ до 8 MiB, 30 с |
| `runs.dispatch` | лимиты триггера и общий потолок 60 в минуту на аддон |
| Журнал | 1000 строк в минуту |

Превышение → `quota_exceeded` или `rate_limited` и метрика.

## 9. Данные аддона

### 9.1 Хранилище

`orgDataDir/<org>/addons/<addonId>/data.db` — SQLite на (организацию × аддон); рядом каталог `files/` (`HARNESYS_DATA_DIR`) для файлов аддона. Доступ к `data.db` — только через `db.*` хоста: файл лежит вне каталога, доступного процессу, и пути к `org.db` у аддона нет.

### 9.2 Безопасность SQL и квоты

- Authorizer соединения: запрещены `ATTACH`/`DETACH`, `load_extension`; `PRAGMA` — только из белого списка (чтение `user_version`, `foreign_keys`); режим журнала и параметры соединения задаёт хост.
- Только подготовленные операторы с параметрами; результат до 8 MiB; время оператора 5 с.
- `db.batch` — атомарный пакет до 100 операторов. Интерактивных транзакций через RPC нет: они держали бы блокировки на время сетевых вызовов.
- Квота размера (`quotaMb`, потолок — политика хоста): после записи проверяется `page_count × page_size`; превышение → `quota_exceeded`, дальнейшие записи отклоняются до освобождения места.

### 9.3 Миграции

`data.migrations` — каталог файлов `NNNN_name.sql`. При активации версии:

1. читается `user_version` (N); выбираются файлы с номером больше N;
2. перед применением — резервная копия `VACUUM INTO backups/<время>.db` (хранятся три последние);
3. каждая миграция — транзакция, в которой обновляется и `user_version`;
4. сбой → восстановление копии, `migration_failed`, откат закрепления версии (§4.6);
5. **защита от понижения:** если `user_version` больше номера последней миграции активируемой версии, активация отклоняется (`migration_failed`, `detail: schema_newer`) — старый код не работает на новой схеме;
6. после миграций при смене версии вызывается `lifecycle.upgrade { fromVersion }` для миграций, требующих кода.

Миграции только вперёд; возврат данных — восстановлением копии при неудаче или ручным откатом администратора.

### 9.4 Удаление и экспорт

Удаление — §4.6. `GET /orgs/:orgId/addons/:id/data/export` (администратор) отдаёт архив `data.db` и `files/`.

## 10. Интеграция с Apps/Accounts

### 10.1 Объявление потребности

```ts
export interface ConnectionRequirement {
  id: string;                           // 'calendar'
  label: L10n;
  accountKinds: string[];               // виды Account из каталога Apps
  scopes?: string[];                    // ключи каталога scopes вида
  cardinality: 'one' | 'many';
  optional?: boolean;
}
```

Аддон не просит «Google-аккаунт вообще» и не знает идентификаторов: он объявляет потребность, организация привязывает аккаунты. Подключением, OAuth, манифестами и вебхуками провайдеров занимается Apps/Accounts; аддон **не** проводит потоков подключения.

### 10.2 Привязки

Администратор привязывает аккаунты на странице аддона (секция `connections`, компонент `AccountPicker` из Apps). Проверки при записи `addon_bindings`: аккаунт принадлежит организации, его вид ∈ `accountKinds`, scopes покрывают `scopes` (иначе UI предлагает доподключить через Apps), для `one` — не более одной привязки. Включение аддона не блокируется отсутствием привязки обязательного `connection`; вызовы, которым она нужна, возвращают `account_failed`, а страница показывает «нужно подключить» (`needs_setup`).

### 10.3 Использование из аддона

- `accounts.list { connection }` → список `{ accountId, label, externalAccountId, status }` — без секретов.
- **`http.fetch` с `auth`** (рекомендуемый путь): `auth: { connection, accountId?, scheme: 'bearer' | 'basic' | 'header', credentialKey?, header? }`. Хост получает учётные данные через `AccountsFacadePort.access(orgId, accountId, { scopes })`, подставляет заголовок и выполняет запрос; токен в процесс аддона не попадает. При 401/403 хост сам вызывает `report` (по умолчанию включено).
- `accounts.access { connection, accountId? }` — сырые учётные данные `{ credentials, expiresAt }`; только при праве `accounts.credentials` (high). Хранить за пределами `expiresAt` нельзя.
- `accountId` обязателен, если привязок несколько; иначе `invalid_params`. Аддон видит только привязанные к нему аккаунты и не может создавать, менять и удалять аккаунты.
- Ошибки Apps (`AccountAccessError`) приходят как `account_failed` с `AccountErrorCode` в `data`.

### 10.4 События и целостность

- `account.status_changed` и `account.removed` для привязанных аккаунтов хост пересылает запущенному аддону уведомлением `accounts.changed`; остановленный аддон состояние читает при следующем вызове.
- Реализация `AccountHolderPort` отдаёт Apps список держателей `{ holderType: 'addon', holderId, label }` из `addon_bindings`: удалить занятый аккаунт нельзя (`409 account_referenced`), пока привязка не снята; удаление аддона с «стереть данные» снимает привязки.
- Реализация `InboundEventPort` маршрутизирует события провайдеров во вклады `hook` с `providerEvent`: конверт доставляется, если `accountId` привязан к указанному `connection`, вид аккаунта допустим и тип события проходит фильтр. Доставка — `hook.deliver` (с ленивым запуском), очередь на аддон 256, при переполнении вытесняются самые старые события, метрика.

## 11. Конфиг и интерфейс

### 11.1 Конфиг

Семейство `config`: `{ fields: FieldSpec[] }` — тот же тип `FieldSpec`, что в Apps (плоские поля: `text`, `secret`, `textarea`, `url`, `select`, `number`, `boolean`). Структурные данные живут в БД аддона и его маршрутах, а не в конфиге. Несекретные значения — `org_addons.config_json`, секретные — `SecretStorePort`. Единственный владелец и писатель — хост: аддон читает `config.get`, записать не может; изменение из UI доставляется уведомлением `config.changed`. Настройки на уровне назначения пака агенту — `specFields` вклада `tool-pack`.

### 11.2 Страница аддона

Вклад `view` (не более одного на аддон) описывает секции. Единое правило расположения для всех страниц: `status`, `capabilities`, `permissions`, `connections`, `config`, `automations`, `jobs`, затем аддонские блоки (`table`, `form`, `actions`, `frame`) в порядке объявления, `markdown` — последним. Фронтенд сортирует секции по этому правилу независимо от порядка в манифесте. Если вклада нет, страница строится по умолчанию из манифеста: `status`, `capabilities`, `permissions`, `connections`, `config`, `automations`, `jobs`.

```ts
export interface ViewDescriptor { id: string; title: L10n; icon?: string; sections: ViewSection[] }

export type ViewSection =
  | { type: 'status' }                                   // версия, состояние, ошибка, предупреждения
  | { type: 'permissions' }                              // объявленное, выданное, разница
  | { type: 'config'; fields?: string[] }
  | { type: 'connections'; connections?: string[] }     // AccountPicker по требованиям
  | { type: 'automations'; triggers?: string[] }        // экземпляры триггеров
  | { type: 'jobs' }
  | { type: 'table'; title: L10n; source: RouteRef; columns: Column[]; rowActions?: Action[]; pageSize?: number }
  | { type: 'form'; title: L10n; fields: FieldSpec[]; submit: RouteRef; confirm?: L10n }
  | { type: 'actions'; actions: Action[] }
  | { type: 'markdown'; body: L10n }
  | { type: 'frame'; route: string; height?: number };

export interface RouteRef { route: string; params?: Record<string, string> }
export interface Column { key: string; label: L10n; format: 'text' | 'datetime' | 'number' | 'badge' | 'link' }
export interface Action { id: string; label: L10n; route: RouteRef; confirm?: L10n; destructive?: boolean }
```

Данные секций аддон отдаёт **маршрутами**: `table` ждёт `{ rows, nextCursor? }`, действие и форма возвращают `{ toast?, refresh? }`. Все вызовы идут через `/orgs/:orgId/addons/:id/r/*` — под guard, схемами и лимитами маршрута; роль (`member` или `admin`) определяет доступность секций.

### 11.3 Закрытый набор секций

Фронтенд держит `SectionRegistry`: `type` → компонент. Новый тип секции — компонент плюс запись в реестре и в схеме SDK; существующие аддоны не меняются. Старый интерфейс, встретивший неизвестный тип, скрывает секцию и показывает пометку «требует обновления интерфейса». Код аддона в UI хоста не исполняется никогда.

### 11.4 `frame` — запасной выход

Для интерфейса, который нельзя выразить секциями: iframe с `sandbox='allow-scripts'` (без `allow-same-origin`), `src` — маршрут аддона с HTML. CSP ответа задаёт хост, аддон её ослабить не может. Связь с хостом — единственный `postMessage`-мост `host.request { route, method, body }`, вызывающий маршруты того же аддона от имени пользователя; ни cookie, ни токенов, ни доступа к родительскому DOM.

### 11.5 Навигация и состояния

Один раздел «Add-ons»: список (установлено, доступно, статус, обновления) → страница аддона. Вклады других семейств видны в их собственных разделах: паки — в каталоге паков, триггеры — в автоматизациях, транспорты — в коннекторах; оттуда есть ссылка на страницу аддона. Записей «на аддон» в навигации настроек нет. Баннеры состояний: `dev`, `unsandboxed`, `quarantined`, `needs_consent`, `needs_setup`, `deprecated`. Окно согласия показывает права с причиной, риском и областью; при обновлении — разницу. Все строки — `L10n` с запасным `en`; секции строятся из общих доступных компонентов.

## 12. Семантика семейств: что делает ядро

### 12.1 Триггеры

1. Пользователь создаёт экземпляр вида `kind`: форма по `configFields`, цель (агент или тред), привязка `connection` при необходимости → строка `addon_trigger_instances`.
2. Включение → `ensureRunning` → `trigger.start { instanceId, kind, config, target }`.
3. Аддон детектирует событие и вызывает `triggers.fire { instanceId, runKey, text, … }`.
4. Ядро: экземпляр включён и принадлежит этому аддону; дедупликация по `(instanceId, runKey)` в `addon_trigger_fires` (окно 7 суток, чистка по Croner); лимиты `perDay`, `throttleSec`, `maxBurst` из дескриптора и политики организации; затем внутренний `runs.dispatch`. Ответ — `fired`, `suppressed`, `busy` или `failed`.
5. Выключение или удаление → `trigger.stop`; перезапуск экземпляра → повторный `trigger.start` (§8.7).

Лимиты видны в UI. Единственный путь запуска из триггера — `triggers.fire`; прямой `runs.dispatch` требует права и учитывается отдельным лимитом аддона.

### 12.2 Джобы

Расписанием владеет хост (Croner), состояние — `addon_job_state`. В срок: `ensureRunning` → `job.run` с таймаутом дескриптора. Пересечение запусков пропускается (single-flight на джоб). `catchUp: once` — один запуск после простоя, если пропущено. Итог пишется в `last_status`, идёт в метрики. Администратор может отключить джоб или запустить сейчас. Расписание из кода аддона не задаётся.

### 12.3 Воркеры

`worker.start`/`worker.stop` по `workerId`. `autostart` — при каждом старте экземпляра (§8.7). Если аддон сообщил `workers.report { state: 'failed' }` и `restart: 'on-failure'`, хост перезапускает воркер с паузой. Остановка — `worker.stop` и `$/cancel`.

### 12.4 Транспорт

Ядро владеет мостом: нейтральный use-case приёма внешнего сообщения (авто-ответчик, политика эха, согласования, привязка чат↔тред). Аддон говорит на протоколе провайдера: вызывает `bridge.inbound` и реализует `transport.send/edit/typing`. Формы сообщений — контракт ядра (`TransportMessage`: канал, текст, формат, ответ на, топик, вложения), существующие контракты коннекторов используются как есть.

### 12.5 Хуки и события

События хоста — конечный каталог `HostEventCatalog` (имя, схема payload, версия). Подписка по шаблону (`thread.*`) требует `events.subscribe` с покрывающей областью. События аддонов — `<addonId>.<name>`, payload до 64 KiB; подписка на чужие события — тем же правом. Доставка — at-most-once, очередь 256, вытеснение старых, метрика. Всё, что требует гарантий, строится на триггерах и джобах, а не на хуках.

### 12.6 Инструменты

Ядро строит `PackRegistration` из дескриптора; инструменты вызывают `tools.call` через `AddonCallPort`. Ядро валидирует вход и результат по схемам, применяет `effect` к согласованиям, лимит размера результата (по умолчанию 256 KiB, иначе `invalid_response`), таймаут, `correlationId` запуска и отмену вместе с запуском. Аддон не получает прав агента — только `principal` в `_meta`.

## 13. REST и события

Формат ошибки — `{ error: <код>, details? }`.

### 13.1 Хост (`HostAdminGuard`)

| Метод и путь | Назначение |
| --- | --- |
| `GET /api/addons/packages` | установленные пакеты и версии |
| `POST /api/addons/packages/plan` · `POST …/plan/:planId/confirm` | установка: план с правами и предупреждениями, затем подтверждение |
| `DELETE /api/addons/packages/:id/:version` · `POST …/prune` | удаление версии (`409 in_use`), очистка неиспользуемых |
| `GET\|PUT /api/addons/policy` | политика хоста |

### 13.2 Организация (`/orgs/:orgId/addons`, `OrgAccessGuard`; изменяющие действия — роль администратора)

| Метод и путь | Назначение |
| --- | --- |
| `GET /` · `GET /:id` | список и карточка: манифест, вклады, права (объявлено / выдано / разница), connections и привязки, состояние, предупреждения |
| `POST /:id/enable` `{ version?, grants }` · `POST /:id/disable` | включение и выключение |
| `POST /:id/update` `{ version, grants? }` · `POST /:id/rollback` `{ version }` | обновление и откат |
| `PUT /:id/grants` | изменение и отзыв прав |
| `DELETE /:id?data=keep\|purge` | удаление в организации |
| `PUT /:id/config` `{ values, secrets?: { key: string \| null } }` | конфиг |
| `PUT /:id/bindings/:connectionId` `{ accountIds }` | привязки аккаунтов |
| `GET\|POST\|PATCH\|DELETE /:id/triggers` · `POST /:id/triggers/:tid/enable\|disable` | экземпляры триггеров |
| `PATCH /:id/jobs/:jobId` · `POST /:id/jobs/:jobId/run` | джобы |
| `POST /:id/restart` · `POST /:id/quarantine/reset` | перезапуск, выход из карантина |
| `GET /:id/logs` · `GET /:id/logs/stream` (SSE) · `GET /:id/metrics` · `GET /:id/data/export` | диагностика и данные |
| `ANY /:id/r/*` | маршруты аддона (§5.5) |
| `GET /events` (SSE) | `addon.state_changed`, `addon.update_available`, `addon.consent_required` |

Публичные маршруты аддонов: `ANY /api/addons/public/:orgId/:id/*` — только при праве `routes.public`, с лимитами тела и частоты. UI ничего не опрашивает: состояние приходит по SSE.

## 14. SDK и опыт автора (DX)

### 14.1 Пакет `@harnesys/sdk`

Листовой пакет без зависимостей от ядра: манифест, карта протокола, дескрипторы семейств, определения прав, коды ошибок, `defineAddon`, клиент хоста, `testing`, CLI. Версия SDK — semver; совместимость с хостом задаёт `platform`.

```ts
import { defineAddon } from '@harnesys/sdk';

export default defineAddon({
  tools:    { 'github.list_repos': async (input, ctx) => ctx.http.fetch({ url: 'https://api.github.com/user/repos', auth: { connection: 'github', scheme: 'bearer' } }) },
  routes:   { items: async (req, ctx) => ({ status: 200, body: { rows: await ctx.db.all('select * from items') } }) },
  triggers: { 'telegram.feed': { start: async (instance, ctx) => { /* … */ }, stop: async (instance, ctx) => { /* … */ } } },
  jobs:     { sync: async (ctx) => { /* … */ } },
  workers:  { poller: { start: async (ctx) => { /* … */ }, stop: async (ctx) => { /* … */ } } },
  hooks:    { onThread: async (event, ctx) => { /* … */ } },
  transport:{ send, edit, typing },
  lifecycle:{ upgrade: async (fromVersion, ctx) => { /* … */ } },
});
```

`ctx` (`AddonContext`) — типизированный клиент хоста: `meta`, `config`, `secrets`, `db`, `http`, `accounts`, `events`, `runs`, `threads`, `triggers`, `log`, `signal`. Методы возвращают значения; отмена — через `ctx.signal`. Ключи обработчиков — идентификаторы вкладов; `defineAddon` собирает список `handlers` для `initialize`.

### 14.2 Инструменты (`hxa`)

| Команда | Что делает |
| --- | --- |
| `hxa init` | шаблон аддона с манифестом, миграцией и тестом |
| `hxa validate` | манифест и дескрипторы по схемам; каждому обязательному вкладу соответствует обработчик и наоборот; отчёт со всеми нарушениями |
| `hxa build` | единый бандл, проверка импортов (только SDK), размера, контрольная сумма |
| `hxa pack` | архив `.hxa` |
| `hxa dev` | регистрирует каталог как источник `local` на запущенном сервере, следит за файлами, перезапускает экземпляр штатно, печатает журнал в терминал; доступен, если сервер включил источник `local` |

### 14.3 Тестирование без хоста

`@harnesys/sdk/testing`: `createFakeHost({ manifest, config, accounts, http })` — in-memory реализация всех сервисов хоста по тем же схемам и тем же `covers` (db — SQLite в памяти с тем же authorizer). Помощники: `host.callTool`, `host.callRoute`, `host.runJob`, `host.startTrigger`, `host.emit`, `host.advanceTime`. Тест аддона не запускает ни сервер, ни процессы.

### 14.4 Документация

`docs/addons/` частично генерируется из схем (манифест, дескрипторы, методы протокола, права, коды ошибок) и поэтому не расходится с кодом; рукописные руководства: быстрый старт, модель прав, миграции, секции интерфейса, тестирование, политика версий (§4.5).

## 15. Наблюдаемость и аудит

- **Журнал экземпляра:** кольцевой буфер 2000 строк плюс файл (ротация 10 MiB × 3) в `orgDataDir/<org>/addons/<id>/logs/`; `stderr` и `log.write` с уровнями; значения секретов и заголовки `auth` редактируются.
- **Метрики** с метками `addon`, `family`/`method`, `outcome`: `addons_rpc_total`, `addons_rpc_seconds`, `addons_host_call_total`, `addons_instance_state`, `addons_instance_restarts_total`, `addons_instance_rss_bytes`, `addons_db_bytes`, `addons_http_total`, `addons_trigger_fire_total`, `addons_job_total`, `addons_hook_dropped_total`.
- **Сквозной `correlationId`:** запуск → вызов инструмента → вызовы хоста → `http.fetch` → доступ к аккаунту; присутствует в журналах и ошибках.
- **Аудит** (`AuditPort`, неизменяемая append-only запись: время, субъект, действие, цель, исход): установка и удаление пакета, включение и выключение, изменения прав и политики, привязки аккаунтов, `allowUnsandboxedExternal`, карантин и выход из него, выдача сырых учётных данных (аддон, connection, аккаунт — без значения).
- **Диагностика в UI:** состояние и причина, хвост журнала, счётчики перезапусков, последнее падение; «скачать диагностику» — манифест, версии, состояние, журнал без данных и секретов.
- Сводка реестра при старте: семейства, сервисы, права, источники.

## 16. Структура кода и изоляция от легаси

### 16.1 Запрещено менять (проверка — пустой `git diff` по путям)

```
apps/server/src/app/infra/integrations/**         (in-process интеграции, integration-host)
apps/server/src/app/infra/integration/**
apps/server/src/app/application/integrations/**
apps/server/src/app/api/rest/integrations*.ts
apps/server/src/app/infra/connector/**
apps/server/src/app/application/connectors/**
packages/harnesys/src/integration/**               (контракт harnesys/integration)
apps/webui/src/features/integrations/**
apps/webui/src/features/manage-connectors/**
apps/webui/src/integrations/**                     (INTEGRATION_UI_REGISTRY)
```

Перестраивается и разрешено: `infra/addons/**` и `packages/sdk/**` (черновик этой системы), `add-ons/**`, `domain/addons/**`, `application/addons/**`, `api/rest/addons*.ts`, аддитивные правки `infra/org-sqlite/**`, `packages/contracts/src/addons.ts` (список семейств — единый источник в SDK), `apps/webui/src/features/manage-addons/**`.

Следствия: новая система не читает и не пишет легаси-таблицы и секреты; её маршруты — `/orgs/:orgId/addons/*` и `/api/addons/*`, совпадающих путей с легаси нет; с Apps/Accounts связь только через порты (`AccountsFacadePort`, `AccountHolderPort`, `InboundEventPort`).

### 16.2 Дерево

```
packages/sdk/src/
  manifest/  protocol/ (карта методов)  families/<family>.ts  permissions/  define-addon.ts  host-client.ts  testing/  cli/
domain/addons/
  family-module.ts  host-service.ts  permissions.ts  errors.ts  owner.ts
  ports/  addon-catalog  addon-source  contribution-registry  org-addon-repository  binding-repository
          trigger-instance-repository  job-state-repository  instance-supervisor  addon-call
          sandbox-launcher  host-service-registry  grant-policy  audit  metrics  clock
application/addons/
  packages/{plan-install,confirm-install,remove-package,prune}.use-case.ts
  orgs/{enable,disable,update,rollback,uninstall,set-grants,set-config,set-bindings}.use-case.ts
  triggers/{manage-instance,fire-trigger}.ts   jobs/{schedule-jobs,run-job}.ts
  calls/addon-call.service.ts   reconcile/reconciler.ts
infra/addons/
  catalog/ (раскладка, lock, источники, digest, staging)   transport/ (ndjson-stdio, in-process)
  supervisor/ (instance, backoff, breaker, idle, health)   sandbox/ (launcher.none, launcher.os-*)
  dispatcher/ (host-dispatcher, permission-engine, rate-limit)
  services/ index.ts + <namespace>/…      families/ index.ts + <family>/…
  storage/ (addon-db, authorizer, migrations, backups)
  apps-bridge/ (accounts-service, holder, inbound-event adapter)   policy/
api/rest/addons-*.controller.ts
apps/webui/src/features/manage-addons/  (страницы, section-registry, consent, frame-bridge)
add-ons/   встроенные аддоны     docs/addons/
```

### 16.3 Автоматические гейты

- Biome `noRestrictedImports`: `add-ons/**` импортируют только `@harnesys/sdk`; `packages/sdk` не импортирует ядро, `harnesys`, `@harnesys/contracts`; `domain/addons` и `application/addons` не импортируют `infra`; ядро не импортирует `add-ons/**`.
- AST-правило: нет `switch` и цепочек `if` по `family`, `method`, `namespace`, `permission` в `domain`, `application`, `dispatcher`, `api`.
- `child_process`, `Bun.spawn`, `process.env` как источник окружения процесса аддона — только в `infra/addons/supervisor` и `sandbox`; спека-канарейка: переменная окружения хоста не попадает в процесс аддона.
- `check-no-addon-names`: идентификаторы встроенных аддонов отсутствуют в `domain`, `application`, `api`, `apps/webui` (кроме фикстур).
- Пустой `git diff --stat` по путям §16.1.

## 17. Тесты и проверка

Только unit-спеки рядом с кодом (`bun test`).

### 17.1 Двойники

`FakeTransport` (скриптуемый «аддон-собеседник»), `FakeClock`, `FakeSandboxLauncher`, in-memory репозитории, `FakeAccountsFacade`, `FakeProviderHttp`, аддон-фикстура `acme-addon` со всеми семействами.

### 17.2 Спеки по областям

- **Манифест:** фикстуры нарушений, все нарушения сразу, `l10n`, неизвестное право, неподдерживаемый `platform`.
- **Совместимость:** адаптер `platform` N−1 на golden-сообщениях; неизвестное семейство (`optional` и обязательное); `features`; `deprecations`.
- **Каталог:** идемпотентность `plan`/`confirm`, дрейф контрольной суммы, атомарность, `prune`, `in_use`.
- **Права:** `covers` каждого определения; наследование гранта; `needs_consent`; отзыв действует на следующем вызове; пересечение политик; базовые права.
- **Диспетчер:** устаревшее поколение, право, схема, частота, таймаут, размер результата, аудит.
- **Реестр вкладов:** `activate` — всё или ничего; `swap` атомарен; **тест утечек:** для каждого модуля из `familyModules` снимок всех реестров до `activate` равен снимку после `deactivate`; `register` и `dispose` идемпотентны.
- **Супервизор:** одиночный ленивый запуск; idle; backoff; breaker → `quarantined`; промахи `ping`; RSS; отбрасывание сообщений старого поколения; порядок остановки; **нет процессов, таймеров и регистраций после каждого пути остановки** (disable, update, uninstall, idle, карантин).
- **Данные:** authorizer (`ATTACH`, `load_extension`, `PRAGMA`); квота; `db.batch`; миграции — применение, копия, откат при сбое, `schema_newer`, вызов `lifecycle.upgrade`.
- **Apps-мост:** проверки привязок (вид, scopes, `cardinality`); инъекция `auth` — токен-канарейка не попадает ни в ответ аддону, ни в журнал; `accounts.credentials` требует права; `report` на 401; держатели; маршрутизация `providerEvent`.
- **Семейства исполнения:** дедупликация и лимиты триггеров, повторный `trigger.start` после перезапуска; `catchUp` и пересечение джобов; перезапуск воркера; ограниченная очередь хуков; валидация, `effect` и размер результата инструментов.
- **Модель UI:** неизвестный тип секции, разница прав при обновлении, страница по умолчанию, белый список моста `frame`.
- **Контракт SDK ↔ хост:** golden JSON на каждый метод для текущей и предыдущей мажорной версии.

### 17.3 Конформанс

`families.conformance.spec.ts` — по `familyModules`: схемы валидны, обработчики есть в карте протокола, права определены, тест утечек (§17.2). `services.conformance.spec.ts` — по `hostServiceModules`: у метода обе схемы, право определено, лимиты заданы, метод присутствует в карте протокола. Конформанс песочницы — §7.5. Намеренно сломанные фикстуры валят спеки внятным сообщением.

### 17.4 Протокол проверки задачи

```
bun run lint:fix
bun run lint
bun run typecheck
bun test
SERVER_PORT=47999 DEV_HARNEYSYS_HOME=$(mktemp -d) bun run --cwd apps/server start
git diff --stat -- <пути §16.1>      # пусто
```

Изолированная загрузка: дождаться строки прослушивания, остановить процесс; живой стенд не трогать.

### 17.5 Приёмочный сценарий `starter`

Установка → включение с правами → запись и чтение `db` → запуск джоба → маршрут с `:id` → запуск, `fire` и дедупликация триггера → выключение: процессов 0, регистраций 0, таймеров 0. Далее: обновление с дополнительным правом → `needs_consent`, остаётся прежняя версия → согласие → обновление; миграция вперёд; неудачная миграция → откат; цикл падений → `quarantined`; удаление со стиранием данных.

### 17.6 Браузерный смоук

Страница аддона из дескрипторов; окно согласия и разница прав; привязка аккаунта через `AccountPicker`; баннер карантина; поток журнала; неизвестный тип секции скрыт с пометкой.
