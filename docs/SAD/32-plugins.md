# 32. Плагины (plugins)

## Обзор

Плагины расширяют возможности системы: агенты, навыки, команды, хуки, MCP-серверы, LSP-серверы, мониторы, точки входа, настройки, пути. Плагин описывается промежуточным представлением (IR) и загружается из файловой системы. Два формата источника: `agent-plugins` (`plugin.json`) и `claude-compat` (`.claude-plugin/plugin.json`). Ядро плагинов — в `packages/harnesys/src/domain/plugin-ir.ts`, `packages/harnesys/src/domain/plugin.ts`, `packages/harnesys/src/domain/plugin-diagnostics.ts`, `packages/harnesys/src/application/plugins/`, `packages/harnesys/src/ports/plugins.ts`. Серверная часть: `app/domain/plugin/`, `app/infra/plugins/`, `app/application/plugins/`.

## Домен (app/domain/plugin/)

| Файл | Назначение |
|------|------------|
| `plugin.ts` | `PluginName`, `PluginSourceFormat` |
| `plugin.error.ts` | ошибки плагина (`PluginConflictException`, `PluginValidationException`) |
| `plugin-registry.port.ts` | порт реестра плагинов |
| `plugin-registries.port.ts` | порт реестров плагинов (каталог) |
| `plugin-runtime.port.ts` | порт рантайма плагина |

не проверено кодом — точные файлы в `app/domain/plugin/` не найдены в объёме этого раздела; 위의 имена взяты из существующего SAD и требуют проверки.

## Плагин IR (packages/harnesys/src/domain/plugin-ir.ts)

### PluginKind

`skill` \| `command` \| `agent` \| `hook` \| `mcp-server` \| `lsp-server` \| `monitor` \| `path-entry` \| `setting-default` \| `config-option` \| `theme` \| `workflow` \| `channel` \| `output-style` \| `eval`.

### InertKind

`theme` \| `workflow` \| `channel` \| `output-style` \| `eval` — компоненты без исполнения.

### ComponentStatus

`native` \| `inert` \| `blocked_by_grant` \| `dropped`.

### Спецификации компонентов (PluginIr)

| Компонент | Поля |
|-----------|------|
| `SkillSpec` | `id`, `name`, `dir` |
| `CommandSpec` | `id`, `name`, `file` |
| `AgentSpec` | `id`, `name`, `description?`, `file`, `model?`, `effort?`, `maxTurns?`, `tools?`, `disallowedTools?`, `skills?`, `memory?`, `background?`, `color?` |
| `HookSpec` | `binding: HookBinding` |
| `McpServerConfig` | `type: 'stdio'` (`command`, `args?`, `env?`, `cwd?`) или `type: 'streamable-http' \| 'sse'` (`url`, `headers?`) |
| `McpServerSpec` | `serverId`, `config` |
| `LspServerSpec` | `serverId`, `command`, `args?`, `transport?`, `env?`, `initializationOptions?`, `settings?`, `projectFolder?`, `startupTimeoutMs?`, `shutdownTimeoutMs?`, `restartOnCrash?`, `maxRestarts?`, `diagnostics?`, `extensionToLanguage` |
| `MonitorSpec` | `name`, `command`, `description`, `when?` |
| `PathEntrySpec` | `dir` |
| `SettingDefaultSpec` | `key`, `value` |
| `ConfigOptionSpec` | `key`, `type` (`string\|number\|boolean\|directory\|file`), `title`, `description`, `sensitive?`, `required?`, `default?`, `multiple?`, `min?`, `max?` |
| `InertSpec` | `raw` |

### PluginGrants, PluginIdentity, PluginIr

`PluginGrants`: `needsProcess: boolean`, `needsNetwork: boolean` (вычисляются из компонентов со статусом `native` в `load-plugin.ts`).

`PluginIdentity`: `name`, `displayName?`, `version?`, `description?`, `author?`, `homepage?`, `repository?`, `license?`, `keywords?`, `defaultEnabled?`.

`PluginIr = { identity, sourceFormat, declaredSchema?, components: PluginComponent[], grants, diagnostics: PluginDiagnostic[] }`.

`PluginComponent = { kind, spec, source: {file, pointer}, status, inertReason? }`.

### PluginDiagnosticCode (plugin-diagnostics.ts)

`unsupported_schema_version` \| `invalid_manifest` \| `unknown_manifest_field` \| `path_escapes_root` \| `invalid_plugin_name` \| `invalid_component_path` \| `invalid_component` \| `inert_component` \| `event_unsupported` \| `handler_type_unsupported` \| `unsupported_isolation` \| `unsupported_transport` \| `unsupported_frontmatter_field` \| `unsupported_tool` \| `claude_tool_unmapped` \| `unresolved_model` \| `server_config_invalid` \| `dependency_unsatisfied` \| `dependency_cycle` \| `blocked_by_grant` \| `needs_server_approval` \| `hook_failed` \| `hook_timeout` \| `hook_invalid_output` \| `lsp_shadowed` \| `source_unsupported` \| `invalid_command_form`.

## Порты плагинов (packages/harnesys/src/ports/plugins.ts)

`PluginLoader` — `loadPluginIrFromDirectory({root, pluginData}) → Promise<{ir, diagnostics}>`. Один метод, один порт.

## Загрузка и валидация IR (packages/harnesys/src/application/plugins/load-plugin.ts)

`loadPluginIrFromDirectory(options: {root, pluginData})`:

1. `listRoot(root)` — чтение директории плагина.
2. `detectLayout(listing)` — `agent-plugins` если есть `plugin.json`, `claude-compat` если есть `.claude-plugin`, иначе `unknown` → `UnknownPluginLayoutError`.
3. Чтение манифеста (`plugin.json` или `.claude-plugin/plugin.json`), парсинг через `agent-plugins.parseManifest` или `claude-compat.parseManifest`.
4. Обнаружение компонентов:
   - навыки (`discoverSkillComponents` из `skills/` и `SKILL.md` в корне)
   - команды (`discoverCommandComponents` из `commands/`, `.md` файлы)
   - агенты (`discoverAgentComponents` из `agents/`, `.md` файлы с frontmatter)
   - хуки (`discoverHookComponents` из `hooks/hooks.json`)
   - MCP-серверы (`discoverMcpComponents` из `mcp.json` / `.mcp.json`)
   - прочие (`discoverExtraComponents`: мониторы, bin/path-entry, settings, инертные виды, LSP)
5. `userConfig` из манифеста → компоненты `config-option`.
6. `computeGrants(components)` — `needsProcess` (monitor, path-entry, lsp-server, hook command, mcp stdio), `needsNetwork` (hook http, mcp http/sse).
7. Возвращает `{ir, diagnostics}`.

Валидация манифеста через AJV схемы (`schema-loader.ts`): `apPlugin` (ajv2020), `apMcp` (ajv2020), `claudeManifest` (ajvDraft07). Схемы: `ap-plugin-1.0.0.schema.json`, `ap-mcp-1.0.0.schema.json`, `claude-plugin-manifest.schema.json`.

## Привязка компонентов (packages/harnesys/src/application/plugins/)

| Файл | Назначение |
|------|------------|
| `bind-skills.ts` | привязка навыков (`FsSkillRegistry`, `prefixSkillRegistry` с префиксом `pluginName:`) |
| `bind-agents.ts` | привязка агентов (`CatalogAgentEntry`, стандартный граф `start → generate → end`, модель через `resolveModel`) |
| `bind-monitors.ts` | привязка мониторов (`MonitorJobSpec`: `when` = `always` \| `on-skill-invoke:<skill>`) |
| `hooks.ts` (formats/) | обнаружение хуков из `hooks.json` |
| `merge-plugin-runtime.ts` | слияние MCP-фрагментов плагина в org mcp config (`scopedToolPrefix` = `mcp__plugin_<name>_<serverId>__`) |
| `plugin-conformance.ts` | проверка соответствия: `assertPluginName` (1–64 символа, `[a-z0-9.-]`, граница, нет `--`/`..`), `assertInsideRoot` (контроль выхода за корень плагина) |
| `schema-loader.ts` | AJV валидация манифестов плагинов |
| `find-marketplace-manifest.ts` | поиск `marketplace.json` или `.claude-plugin/marketplace.json` |
| `parse-claude-marketplace.ts` | парсинг маркетплейса Claude (источники: github, url, git-subdir, npm, archive, relative) |
| `expand-plugin-vars.ts` | подстановка `${PLUGIN_ROOT}`, `${PLUGIN_DATA}`, `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` |
| `user-config.ts` | подстановка `${user_config.*}` (сensitive ключи возвращают '') |
| `prefixed-skill-registry.ts` | реестр навыков с префиксом плагина |

## Маркетплейс и compliance

Маркетплейс плагинов — через реестры (`PluginRegistriesPort`, адаптер `PluginMarketplacesAdapter` поверх machine SQLite: таблицы `pluginRegistriesTable`, `pluginCatalogEntriesTable`). Источники установки (`CatalogInstallSource`): `relative`, `github`, `url`, `git-subdir`, `npm`, `archive`. Парсинг маркетплейса Claude: `parseClaudeMarketplace`.

Проверка соответствия (conformance check): `plugin-conformance.ts` — валидация имён плагинов, контроля путей (внутри корня), статусов компонентов (`dropped` для непроходящих валидацию), диагностики с кодами (`invalid_plugin_name`, `path_escapes_root`, `server_config_invalid` и др.).

## Порты плагинов сервера (app/domain/plugin/)

`PluginRegistryPort`, `PluginRegistriesPort`, `PluginRuntimePort` — не проверены кодом (файлы не найдены в объёме этого раздела).

## Use-cases (app/application/plugins/)

`plugins.use-case.module.ts` — установка, обновление, удаление, включение/выключение плагинов, управление разрешениями и опциями. Точные файлы use-case не найдены в объёме этого раздела — не проверено кодом.

## Контроллеры (app/api/rest/)

`plugins.controller.ts`, `plugin-registries.controller.ts` (`PluginCatalogController`, `PluginRegistriesController`) — не проверены кодом.

## Адаптеры (infra/plugins/)

| Файл | Назначение |
|------|------------|
| `plugin-registry.adapter.ts` | адаптер реестра плагинов |
| `plugin-runtime.adapter.ts` | адаптер рантайма плагина |
| `plugin-marketplaces.adapter.ts` | адаптер маркетплейсов (machine SQLite) |
| `plugin-marketplaces.schema.ts` | схема БД маркетплейсов |
| `install-sources.ts` | источники установки плагинов |
| `plugin-git.ts` | git-установка плагинов |
| `plugins.module.ts` | DI-модуль плагинов |

## Поток загрузки и валидации плагина IR

```mermaid
flowchart TD
  Dir[директория плагина] --> List[listRoot: чтение файлов]
  List --> Detect{detectLayout}
  Detect -->|plugin.json| AP[agent-plugins]
  Detect -->|.claude-plugin| CC[claude-compat]
  Detect -->|иное| Unknown[UnknownPluginLayoutError]
  AP --> Manifest[прочитать plugin.json]
  CC --> Manifest[прочитать .claude-plugin/plugin.json]
  Manifest --> Parse[parseManifest: identity, pathOverrides, userConfig]
  Parse --> Skills[discoverSkillComponents: skills/, SKILL.md]
  Parse --> Commands[discoverCommandComponents: commands/*.md]
  Parse --> Agents[discoverAgentComponents: agents/*.md frontmatter]
  Parse --> Hooks[discoverHookComponents: hooks/hooks.json]
  Parse --> Mcp[discoverMcpComponents: mcp.json/.mcp.json]
  Parse --> Extras[discoverExtraComponents: monitors, bin, settings, inert, lsp]
  Skills & Commands & Agents & Hooks & Mcp & Extras --> Components[компоненты PluginComponent]
  Components --> Grants[computeGrants: needsProcess, needsNetwork]
  Components --> Diag[диагностика PluginDiagnostic[]]
  Grants & Diag --> IR[PluginIr: identity, sourceFormat, components, grants, diagnostics]
  IR --> Result[{ir, diagnostics}]
```

## Связанные разделы

- [33-presets.md](./33-presets.md)
- [34-mode-presets.md](./34-mode-presets.md)
- [37-модель-исполнения-mcp.md](./37-модель-исполнения-mcp.md) (плагины могут предоставлять MCP-серверы через `McpServerSpec`)
- [16-агенты-и-agent-definition.md](./16-агенты-и-agent-definition.md) (агенты плагинов)
- [10-слой-infra-adapters.md](./10-слой-infra-adapters.md)
