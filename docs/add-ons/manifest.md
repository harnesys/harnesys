# Манифест `addon.json` — справочник

`addon.json` — статическое описание пакета: кто, что даёт, что просит, как запускать. Валидируется Zod-схемой SDK (`parseAddonManifest`, `validateManifest`) и на стейдже установки, и на enable. Всё, чего нет в манифесте, аддон сделать не может: вклады регистрируются хостом **как данные, без запуска кода**.

Схемы в коде: `packages/sdk/src/manifest/` (manifest.ts, connections.ts, l10n.ts, validate.ts, json-schema.ts).

## Top-level поля

| Поле | Тип | Обязательное | Правила |
|---|---|---|---|
| `id` | string | да | `^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$` — `<publisher>.<name>`; встроенные используют publisher `harnesys`; имя каталога пакета должно совпадать с id |
| `version` | string | да | строгий semver `^\d+\.\d+\.\d+$` (без pre-release хвостов) |
| `platform` | int | да | мажорная версия протокола; сейчас `1`; неизвестная → fail-closed `incompatible` |
| `title` | L10n | да | см. ниже |
| `description` | L10n | да | видна в каталоге и на странице |
| `icon` | string | нет | относительный путь к ресурсу пакета |
| `homepage` | string | нет | |
| `license` | string | нет | |
| `runtime` | object | да | `{ entry: string; profile: 'trusted' \| 'restricted' }` |
| `activation` | enum | да | `'lazy'` \| `'resident'` (resident требует права `lifecycle.resident`) |
| `permissions` | PermissionRequest[] | да | [Права и согласие](permissions.md); только небазовые права |
| `connections` | ConnectionRequirement[] | да | [Accounts и connections](accounts-connections.md) |
| `data` | object | нет | `{ migrations: string; quotaMb?: number }` — [Хранение данных](data-storage.md) |
| `features` | string[] | нет | жёсткие требования к хосту сверх platform: `'family:source-kind@1'`; недостающая фича → `incompatible` |
| `contributions` | Contribution[] | да | [Contributions](contributions.md) |

### runtime

```json
"runtime": { "entry": "dist/index.js", "profile": "trusted" }
```

- `entry` — путь от корня пакета; исполняется Bun. В монорепо собирается так: `bun build --target=bun src/index.ts --outfile dist/index.js`.
- `profile: 'trusted'` — for builtin/local запуск in-process (тот же протокол поверх in-memory пары) либо процесс с очищенным окружением. Граница — отказоустойчивость, не безопасность.
- `profile: 'restricted'` — spawn в OS-песочнице (`sandbox-exec` на macOS, адаптер на Linux): чтение — каталог пакета, запись — каталог данных и tmp, сеть — только stdio. Для `external`-trust это единственный допустимый профиль; нет песочницы — установка/старт отклоняются, пока не включена политика `allowUnsandboxedExternal`.

### activation

- `'lazy'` — процесс стартует на первый вызов (инструмент, маршрут, старт триггера, джоб, хук, транспорт) и простаивает в `stopped` после ~5 минут без причин жить.
- `'resident'` — хост держит процесс живым (нужно право `lifecycle.resident`); типично для поллеров и планировщиков (`harnesys.telegram-bot`, `harnesys.scheduler`, `harnesys.github`).

## L10n

```ts
type L10n = string | Record<locale, string>;   // 'Greeter' или { en: 'Greeter', ru: 'Приветчик' }
```

Разрешение: запрошенная локаль → `en` → первая запись. В строках допустимы плейсхолдеры `%key%`; каждый ключ обязан существовать в `l10n/en.json` пакета — иначе нарушение `missing_l10n_key`.

## PermissionRequest

```json
{ "id": "http.fetch", "scope": { "hosts": ["api.github.com"] }, "reason": "Fetch GitHub API", "optional": false }
```

- `id` — из каталога прав, неизвестный → `unknown_permission`.
- `reason` — обязателен: попадает в диалог согласия.
- `optional: true` — право можно не выдавать, аддон обязан деградировать gracefully.
- `scope` — форма зависит от права (`{ hosts }`, `{ connections }`, `{ patterns }`); покрытие проверяет `covers` на каждом вызове.
- Risk (`low/medium/high`) — метаданные хоста, в манифесте не декларируется.

## ConnectionRequirement

```json
{
  "id": "github",
  "label": "GitHub installation",
  "accountKinds": ["github-installation"],
  "scopes": ["repo"],
  "cardinality": "one",
  "optional": true
}
```

- `accountKinds` — минимум один; вид аккаунта Apps обязан совпадать при привязке.
- `scopes` — ключи каталога scopes вида; аккаунт без нужных scopes не подойдёт (UI предложит доподключить).
- `cardinality: 'one'` — не более одной привязки (вторая → 409); `'many'` — сколько угодно.
- Ссылки дескрипторов (`connection:` в tool-pack/trigger/transport/source-kind/hook.providerEvent) обязаны указывать на объявленную здесь — иначе `unknown_connection`.

## Вклады (кратко — см. [Contributions](contributions.md))

```json
{ "id": "pack", "family": "tool-pack", "v": 1, "optional": false, "descriptor": { } }
```

- `id` вклада: `^[a-z][a-z0-9-]*$`, уникален в манифесте (`duplicate_contribution_id`).
- `family` — из 13 зарегистрированных; неизвестное семейство → ошибка, кроме `optional: true` (тогда warning и пропуск с пометкой в compatibility view).
- `v` — версия схемы дескриптора (все семейства на `1`).
- `descriptor` — валидируется Zod-схемой семейства + `crossCheck` против манифеста.

## Полноценный пример

Манифест `harnesys.scheduler` (сокращён до каркаса, реальный файл — 124 строки):

```json
{
  "id": "harnesys.scheduler",
  "version": "1.0.0",
  "platform": 1,
  "title": "Scheduler",
  "description": "Cron schedules for agent threads…",
  "runtime": { "entry": "dist/index.js", "profile": "trusted" },
  "activation": "resident",
  "connections": [],
  "permissions": [
    { "id": "trigger", "reason": "Fire scheduler.cron instances when their cron expression is due" },
    { "id": "lifecycle.resident", "reason": "Stay running so the planner keeps firing due schedules" },
    { "id": "org.read", "reason": "Evaluate cron times in the organization timezone" },
    { "id": "approvals.request", "reason": "Open approval inbox items when a schedule misses its catch-up window" }
  ],
  "data": { "migrations": "migrations", "quotaMb": 16 },
  "contributions": [
    { "id": "cron", "family": "trigger", "descriptor": { "kind": "scheduler.cron", "configFields": [ … ] } },
    { "id": "tick", "family": "job", "descriptor": { "id": "tick", "schedule": { "everySec": 60 }, "timeoutSec": 55, "catchUp": "none", "defaultEnabled": true } },
    { "id": "schedules", "family": "route", "descriptor": { "id": "schedules", "method": "GET", "path": "/schedules", "role": "member" } },
    { "id": "main", "family": "view", "descriptor": { "id": "main", "title": "Scheduler", "sections": [ … ] } }
  ]
}
```

## Валидация

```ts
import { validateManifest } from '@harnesys/sdk';

const { manifest, violations } = validateManifest(JSON.parse(raw));
// violations: { path, code, message, severity: 'error' | 'warning' }[] — все разом
```

Коды нарушений: `schema`, `unknown_permission`, `resident_without_permission`, `unknown_family` (warning только для `optional`-вклада), `descriptor_schema`, `unknown_connection`, `duplicate_contribution_id`, `duplicate_id` (routes/jobs/workers), `missing_l10n_key`. Хост отказывает во включении пакета с error-нарушениями.

Полезный паттерн из встроенных аддонов — тест манифеста (`harnesys.github` имеет `addon-manifest.spec.ts`): прогнать собственный `addon.json` через `validateManifest` и `expect(violations.filter(v => v.severity === 'error')).toEqual([])`. Манифест перестаёт быть «JSON на глаз».

## JSON Schema для редакторов

SDK публикует схемы из тех же Zod-определений:

```ts
import { manifestJsonSchema, contributionDescriptorJsonSchema } from '@harnesys/sdk';
```

Положите `manifestJsonSchema()` в `"$schema"`-ссылку или рядом с `addon.json` — редактор подсвечивает ошибки без хоста.

## Формат пакета целиком

```
addon.json
dist/index.js              # самодостаточный бандл — runtime.entry
migrations/NNNN_name.sql   # если есть data.migrations
l10n/<locale>.json         # если есть %key%-плейсхолдеры
content/…                  # файлы вклада content (скиллы/промпты)
assets/                    # иконка
```

Хост не исполняет скрипты установки и не ставит зависимости; установка — копирование проверенных файлов с контролем digest (sha256 по сортированным путям+содержимому). `node_modules` в пакет не кладётся.

---

Дальше: [Contributions](contributions.md)
