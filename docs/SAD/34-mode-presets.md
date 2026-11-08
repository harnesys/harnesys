# 34. Режимные пресеты (mode presets)

## Обзор

Режимные пресеты (mode presets) определяют правила работы агентов: права на операции (`fs.write`, `process`, `network`, `mcp`, `agents`), навыки, паки, отключённые инструменты, политику отклика и инструкции. Реализованы в `app/domain/mode-presets/` и `app/infra/mode-presets/`.

## Домен (app/domain/mode-presets/)

| Файл | Назначение |
|------|------------|
| `mode-preset.ts` | сущность режимного пресета (`ModePresetRecord`, `ModePresetInsert`, `ModePresetPatch`) |
| `mode-preset.error.ts` | ошибки режимных пресетов |
| `mode-preset-registry.port.ts` | порт реестра режимных пресетов |
| `builtin-mode-presets.ts` | встроенные предустановки режимов |
| `preset-shell-merge.ts` / `preset-shell-merge.spec.ts` | слияние оболочки пресета |

не проверено кодом — точные файлы в `app/domain/mode-presets/` не найдены в объёме этого раздела; имена взяты из существующего SAD и требуют проверки.

## Контракты (packages/contracts/src/mode-presets.ts)

### Операции и гейты

`MODE_OPS` = `['fs.write', 'process', 'network', 'mcp', 'agents']`. `ModeOpGate` = `allow` \| `ask` \| `deny`. `ModeOpPermissions` — частичная запись по `ModeOp`.

### Идентификатор и константы

`MODE_ID_RE` = `/^[a-z0-9][a-z0-9_-]*$/`. `DEFAULT_MODE_ID = 'default'` (зарезервировано, нельзя создать пользовательский пресет с таким id).

### Присваивание паков

`PackAssignment` = `true` \| `false` \| `{spec?}` \| `null`.

### Экспозиция инструментов

`ModeToolExposure` = `direct` \| `deferred`. `ModeDisabledTools` — массив строк, max 64. `ModeExposureMap` — запись строк → `ModeToolExposure`.

### ModePresetPublic

`orgId`, `id` (regex `MODE_ID_RE`, max 48), `name`, `description?`, `instructions?`, `skills?`, `packs?`, `disabledTools?`, `exposure?`, `permissions?`, `builtin`, `installedByDefault`, `createdAt`, `updatedAt`.

### Тела запросов

`CreateModePresetBody`: `id !== 'default'` (рефайн), остальные поля как в теле. `UpdateModePresetBody`: частичное тело без `id`. `ListModePresetsResponse` (`items[]`).

## Режимы по умолчанию (builtin-mode-presets.ts)

| id | fs.write | process | network | mcp | agents | installedByDefault | Особенности |
|----|----------|---------|---------|-----|--------|--------------------|-------------|
| `ask` | ask | ask | ask | ask | ask | да | Подтверждение каждой операции или команды |
| `auto` | allow | ask | ask | ask | ask | да | Редактирование файлов без подтверждения |
| `plan` | deny | deny | allow | allow | deny | да | Планирование через пак `plan`, навык `superpowers:writing-plans`, инструкция PLAN_INSTRUCTIONS |
| `bypass` | allow | allow | allow | allow | allow | нет | Everything без подтверждений |
| `dont_ask` | allow | deny | deny | deny | deny | нет | Записи авто-пуск, сеть и MCP запрещены |

## Use-cases (application/mode-presets/)

`mode-presets.use-case.module.ts` — управление режимными пресетами. Файлы:
- `create-mode-preset.use-case.ts`
- `delete-mode-preset.use-case.ts`
- `list-mode-presets.use-case.ts`
- `update-mode-preset.use-case.ts`
- `mode-preset.helpers.ts` (+ spec)

не проверено кодом — файлы не найдены в объёме этого раздела.

## Контроллер и адаптер (app/api/rest/, infra/mode-presets/)

`mode-presets.controller.ts`. Адаптер: `infra/mode-presets/mode-preset-registry.adapter.ts` (+ spec), `infra/mode-presets/mode-presets.module.ts`. — не проверены кодом.

## Связанные разделы

- [33-presets.md](./33-presets.md)
- [16-агенты-и-agent-definition.md](./16-агенты-и-agent-definition.md) (режимы применяются к агентам)
