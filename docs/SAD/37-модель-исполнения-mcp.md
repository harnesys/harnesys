# 37. Модель исполнения MCP

## Обзор

MCP (Model Context Protocol) позволяет подключать внешние серверы контекста как источники инструментов и ресурсов для агентов. Поддерживаются транспорт `stdio`, `SSE` и `HTTP`. Инструменты и ресурсы подключённых серверов объединяются в реестр и доступны агентам.

## Домен (app/domain/mcp/)

| Файл | Назначение |
|------|------------|
| `org-mcp.port.ts` | порт MCP организации (`OrgMcpPort`: `listConfig`, `upsert`, `remove`, `setEnabled`) |
| `mcp.error.ts` | ошибки MCP (`McpValidationException`, `McpServerNotFoundException`) |

## Use-cases (application/mcp/)

`application/mcp/mcp.use-case.module.ts` — управление MCP-серверами: создание, обновление, удаление, включение/выключение. — не проверено кодом.

## Контроллер (app/api/rest/)

`mcp.controller.ts`. — не проверено кодом.

## Адаптер (infra/mcp/)

| Файл | Назначение |
|------|------------|
| `mcp.module.ts` | DI-модуль: `providers: [{ provide: OrgMcpPort, useClass: OrgMcpJsonAdapter }]` |
| `org-mcp-json.adapter.ts` | `OrgMcpJsonAdapter extends OrgMcpPort` — конфигурация MCP организации в JSON (`mcpConfigPath(orgId)` = `orgs/<orgId>/mcp.json`) |

`OrgMcpJsonAdapter` хранит серверы в файле `mcp.json` (Zod-схема `mcpJsonSchema`: запись `mcpServers` с полями `command`, `args`, `env`, `url`, `type`, `headers`, `enabled`). Валидация: для `stdio` требуется `command`, для `http`/`sse` требуется `url`. `setEnabled` удаляет поле `enabled` при включении или ставит `enabled: false` при выключении. `connected` всегда `false` в конфиге (живой статус определяется рантаймом).

## Доменная модель MCP (packages/harnesys/src/domain/mcp.ts)

`McpTransport` = `McpStdioTransport` (`type: 'stdio'`, `command`, `args?`, `env?`, `cwd?`) \| `McpHttpTransport` (`type: 'http'`, `url`, `headers?`) \| `McpSseTransport` (`type: 'sse'`, `url`, `headers?`).

`McpServerConfig` (`serverId`, `transport`, `toolPrefix?`, `allowTools?`). `McpToolInfo` (`name`, `description`). `McpResourceInfo` (`uri`, `name`, `title?`, `description?`, `mimeType?`).

## Порты MCP (packages/harnesys/src/ports/mcp.ts)

`StdioEntry` (`command`, `args?`, `env?`, `cwd?`, `enabled?`, `toolPrefix?`). `UrlEntry` (`url`, `headers?`, `type?` (`sse`\|`http`), `enabled?`, `toolPrefix?`). `CursorMcpJson` (`mcpServers: McpServerEntries`, `McpServerEntries = Record<string, StdioEntry \| UrlEntry>`). `McpServerInfo` (`serverId`, `transport`, `connected`, `tools[]`, `resources[]`). `McpRegistry` (`loadJson`, `enable`, `disable`, `forget`, `reload`, `list`, `tools`, `closeAll`).

## Порт управления MCP (packages/harnesys/src/ports/mcp-manage.ts)

`McpManagePort`: `list(scope) → McpServerOverview[]`, `upsert(scope, serverId, entry) → McpHealthReport`, `remove(scope, serverId)`, `setEnabled(scope, serverId, enabled) → McpHealthReport`, `health(scope, serverId) → McpHealthReport`.

`McpServerOverview` (`serverId`, `transport`, `managed`, `enabled`, `connected`, `command?`, `url?`, `toolCount`, `tools[]`). `McpHealthReport` (`serverId`, `connected`, `tools[]`, `error?`).

## Реестр MCP (packages/harnesys/src/adapters/mcp-registry.ts)

не найден в объёме этого раздела — не проверено кодом.

## Приложение MCP (packages/harnesys/src/application/mcp/)

| Файл | Назначение |
|------|------------|
| `create-mcp-tool.ts` | создание инструмента MCP (`tool(\`${prefix}${raw.name}\`)`, `exposure: 'deferred'`, вызов `conn.callTool`) |
| `create-mcp-resource-tools.ts` | инструменты ресурсов MCP (`list_resources`, `read_resource`) |
| `mcp-connector.port.ts` | порт подключения MCP |

### McpConnection (mcp-connector.port.ts)

`connect(config: McpServerConfig) → McpConnection`. `McpConnection`: `serverId`, `listTools() → RawToolDescriptor[]`, `callTool(name, input) → unknown`, `listResources(cursor?) → ListResourcesPage`, `readResource(uri) → RawResourceReadResult`, `close()`.

`RawToolDescriptor` (`name`, `description`, `inputSchema`). `RawResourceDescriptor` (`uri`, `name`, `title?`, `description?`, `mimeType?`, `size?`). `ListResourcesPage` (`resources[]`, `nextCursor?`). `RawResourceReadResult` (`contents[]`).

### createMcpTool

Создаёт инструмент с именем `${prefix}${raw.name}`, группе `serverId`, операцией `mcp`, экспозицией `deferred`. При ошибке возвращает `{ code: 'MCP_FAILED', message }`.

### createMcpResourceTools

Создаёт два инструмента: `${prefix}list_resources` (список ресурсов с курсором) и `${prefix}read_resource` (чтение ресурса по URI, обязательный параметр `uri`).

## Пак MCP (packages/harnesys/src/packs/mcp/)

`mcpCapability`: имя `mcp`, версия `1.0.0`. Инструменты: `mcp_list`, `mcp_connect`, `mcp_check`, `mcp_toggle`, `mcp_remove` (через `createMcpTools`).

### createMcpTools

- `mcp_list` — список серверов с конфигом, статусом подключения, инструментами.
- `mcp_connect` — установка/замена сервера на уровне организации: stdio (command + args/env/cwd) или remote (url + type sse|http + headers). Проверка подключения (health). Запись в org mcp config. Инструменты доступны агенту только после `agents_update mcpServers` и `load_tools`.
- `mcp_check` — проверка здоровья сервера (пробное подключение).
- `mcp_toggle` — включение/выключение сервера.
- `mcp_remove` — удаление сервера из конфига.

Идентификатор сервера: `/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/`.

## Контракты (packages/contracts/src/mcp.ts)

| Схема | Тип |
|-------|-----|
| `McpTransportKindSchema` | `z.enum(['stdio','http','sse'])` → `McpTransportKind` |
| `McpOriginSchema` | дискриминированная union: `{kind: 'org'}` или `{kind: 'plugin', pluginName, status?, inertReason?}` → `McpOrigin` |
| `McpToolSummarySchema` | `name`, `description?` → `McpToolSummary` |
| `McpLiveServerSchema` | `serverId`, `transport`, `connected`, `toolCount`, `tools[]`, `resources[]` → `McpLiveServer` |
| `ListOrgMcpResponseSchema` | `servers: McpLiveServer[]` → `ListOrgMcpResponse` |
| `McpConfigServerSchema` | `serverId`, `enabled`, `transport`, `command?`, `args?`, `env?`, `url?`, `headers?`, `connected`, `toolCount`, `origin`, `disabledByUser?`, `requiredGrant?` → `McpConfigServer` |
| `ListOrgMcpConfigResponseSchema` | `servers: McpConfigServer[]` → `ListOrgMcpConfigResponse` |
| `UpsertOrgMcpServerBodySchema` | `enabled?`, `transport`, `command?` (required для stdio), `args?`, `env?`, `url?` (required для http/sse), `headers?` → `UpsertOrgMcpServerBody` |
| `UpsertOrgMcpServerResponseSchema` | `server: McpConfigServer` |
| `SetOrgMcpServerStateBodySchema` | `enabled` → `SetOrgMcpServerStateBody` |

## Поток подключения MCP-сервера

```mermaid
flowchart TD
  Cfg[McpServerConfig: stdio/http/sse] --> Conn[McpConnector.connect(config)]
  Conn --> LT[listTools]
  LT --> Prefix[префикс toolPrefix || serverId__]
  Prefix --> Tools[createMcpTool + appendResourceTools]
  Tools --> Coll[assertNoCollisions: уникальность имён инструментов между серверами]
  Coll --> Enabled[сервер в реестре, McpServerInfo connected = true]
  Enabled --> Use[инструменты доступны агенту через createRuntime mcp option]
  Enabled --> Res[ресурсы доступны через list_resources / read_resource]
```

## Связанные разделы

- [32-plugins.md](./32-plugins.md) (плагины могут предоставлять MCP-серверы через `McpServerSpec`, слияние в org mcp config через `mergePluginMcpFragments`)
- [10-слой-infra-adapters.md](./10-слой-infra-adapters.md)
- [34-mode-presets.md](./34-mode-presets.md) (права `mcp` в режимных пресетах)
