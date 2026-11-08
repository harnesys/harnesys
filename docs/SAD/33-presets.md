# 33. Пресеты (presets)

## Обзор

Пресеты — готовые конфигурации агентов и команд, которые можно применить к организации. Поддерживаются системные пресеты (комплектуются из поставки) и пользовательские пресеты (включая импорт legacy). Реализовано в `app/domain/presets/` и `app/infra/presets/`.

## Домен (app/domain/presets/)

| Файл | Назначение |
|------|------------|
| `preset-view.ts` | представление пресета (`toCatalogItem`, `toPresetDetail`) |
| `preset.error.ts` | ошибки пресета |
| `preset-catalog.port.ts` | порт каталога пресетов (`PresetCatalogPort`: `list`, `listDetailed`, `get`) |
| `preset-library.port.ts` | порт библиотеки пресетов (`PresetLibraryPort`: `findAnyById`, `findById`, `save`, `delete`, `listByOrigin`, `deleteSystemRowsExcept`) |

не проверено кодом — точные файлы в `app/domain/presets/` не найдены в объёме этого раздела; имена взяты из существующего SAD и требуют проверки.

## Контракты (packages/contracts/src/presets.ts, preset-id.ts)

| Сущность | Описание |
|----------|----------|
| `PresetKind` | `agent` \| `team` |
| `PresetOrigin` | `system` \| `user` \| `registry` |
| `PresetId` | `/^[a-z0-9][a-z0-9-]{0,63}\/[a-z0-9][a-z0-9-]{0,63}$/` (владелец/имя) |
| `PRESET_ENVELOPE_MAX_BYTES` | `512 * 1024` |
| `Semver` | `^\d+\.\d+\.\d+$` |

### AgentPresetBody

`name`, `role`, `instructions`, `color?`, `skills?`, `mcpServers?`, `budget?`, `capabilities?`, `permissions?` (`allow`\|`ask`\|`deny` по ключу), `graph?`.

### TeamPresetBody

`roles[]` (`roleKey`, `name`, `agentRef: PresetId`, `budgetUsdDaily`, `requiresModel`, `capabilitiesExtra?`), `board` (`statuses[]` min 2, `rules[]` с триггером, условиями, действиями `assign_agent`\|`set_status`\|`notify_owner`), `digest` (`cronDefault`, `roleKey`, `detail`).

### Каталог

`CatalogItem` (дискриминированная по `kind`): `AgentCatalogItem`, `TeamCatalogItem`. `PresetDetail` (с `body`). `PresetEnvelope` (`formatVersion: 1`, `manifest`, `presets[]` min 1). `PresetManifest` (`id`, `version`, `kind`, `name`, `description?`, `author?`, `tags[]`, `harnesysRange?`).

## Use-cases (application/presets/)

`preset.use-case.module.ts` — управление пресетами. Файлы:
- `save-preset.use-case.ts` (+ spec)
- `delete-preset.use-case.ts`
- `get-preset.use-case.ts`
- `list-presets.use-case.ts`
- `import-presets.use-case.ts` (+ spec)
- `export-preset.use-case.ts`
- `preset-versioning.ts` (+ spec)
- `preset-path.ts`
- `preset-library.fakes.ts`

не проверено кодом — файлы не найдены в объёме этого раздела.

## Адаптеры (infra/presets/)

`preset-repository.adapter.ts` (+ spec), `preset-rows.ts`, `preset-envelope.ts` (+ spec), `system-presets-seed.ts` (+ spec), `legacy-user-presets.ts` (+ spec), `presets.module.ts`, `presets.schema.ts`.

не проверено кодом — файлы не найдены в объёме этого раздела.

## Системные пресеты

`system-presets-seed.ts` (не проверено кодом):
- `SYSTEM_OWNER = 'harnesys'`, `SYSTEM_VERSION = '1.0.0'`.
- Читает бандл пресетов из `bundledPresetsPath('agents')` (директории агентов, валидация `config.json` + `instructions.md`) и `bundledAssetsRoot()/presets/teams` (файлы `.json`).
- `planSystemPresets(bundle, existingSystem)` — вычисляет `upserts` (все из бандла) и `deletes` (системные строки, отсутствующие в бандле).
- `systemPresetsSeed({layout, log})` — внутри транзакции SQLite (`withMachineSqlite`) делает `onConflictDoUpdate` по `id` и удаляет устаревшие системные строки. Пути определяются через `HostFsLayoutPort`.
- Вызывается из `main.ts` (`systemPresetsSeed`) вместе с `importLegacyUserPresets` (`legacy-user-presets.ts`).

Пользовательские пресеты происходят от `origin: 'user'` и создаются через `PresetLibraryPort.save`. Пресеты применяются к агентам (см. [16-агенты-и-agent-definition.md](./16-агенты-и-agent-definition.md)).

## Импорт legacy

`legacy-user-presets.ts` — не проверено кодом. Импорт пользовательских пресетов из legacy-формата при старте системы.

## Связанные разделы

- [34-mode-presets.md](./34-mode-presets.md) (режимные пресеты)
- [16-агенты-и-agent-definition.md](./16-агенты-и-agent-definition.md) (пресеты применяются к агентам)
- [05-архитектура-сервера.md](./05-архитектура-сервера.md) (seed при старте)
- [11-база-данных-schema.md](./11-база-данных-schema.md) (таблица presets)
