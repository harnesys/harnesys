# 09. Доменный слой (domain: сущности, порты, ошибки)

## Назначение и место в слоях

`apps/server/src/app/domain/` содержит сущности (записи/интерфейсы), абстрактные порты (`*-port.ts`) и доменные ошибки (`*.error.ts`). Домен не знает об инфраструктуре — порты определяют контракты, которые реализуют адаптеры в `infra/`. Ядро `packages/harnesys` не знает об инфраструктуре сервера; сервер вызывает ядро через порты.

## Количество и конвенция файлов

41 директория доменов. Конвенция:

| Суффикс | Назначение |
|---------|------------|
| `*-port.ts` | абстрактный класс порта (DI-токен) |
| `*.error.ts` | доменные ошибки |
| `*.ts` (иные) | сущности, записи, утилиты, политики |
| `*.spec.ts` | тесты чистой логики |

Порт — абстрактный класс, используется как DI-токен. Импортируется обычным `import` (не `import type`), иначе контейнер brix видит `Object` вместо токена (ошибка `metadata erased the token to Object`).

## Перечень доменов (по коду)

| Домен | Ключевые файлы |
|-------|----------------|
| `agent` | `agent.ts` (`AgentRecord`), `agent-registry.port.ts`, `agent-memory.port.ts`, `hook-run-store.port.ts`, `agent.error.ts` |
| `approval` | процессы одобрения |
| `automations` | автоматизации |
| `browser` | агентский браузер |
| `connector` | соединители (connector) |
| `content` | каталог хоста, порт контента организации |
| `desk` | события стола |
| `eula` | ошибки и порт EULA |
| `events-watch` | кадры наблюдения, порт хаба |
| `execution-profile` | ошибки, порт, сущность профиля выполнения |
| `file-access` | правила доступа к файлам, порты, factory политик |
| `fleet` | ошибки, порты: claim, истечение аренды, контент-прокси, события флота, хаб флота, репозиторий приглашений, очередь команд узла, хранилище идентичности узла, репозиторий узлов, подтверждение снимка, аудит организации, ревизия конфигурации, реплика выполнения, ожидающее размещение, размещение, сессия записи источника, константы claim, команда работника, квитанция операции |
| `identity` | `principal.ts` (`UserPrincipal`, `NodePrincipal`), `capability.ts` (`Capability`, `NodeAction`), `role-presets.ts` (`OrgRole`, `ROLE_PRESETS`), `authorize.ts`, порты репозиториев/сессий/паролей/ключей билетов/аудита/связей/приглашений, `identity.error.ts` |
| `integration` | ошибки, порты: аддон-БД, события интеграции, хост, реестр, токен |
| `issue` | `issue.ts` (`IssueRecord`), `rule-engine.ts` (`runRules`), `dependency-cycle.ts`, `issue-execution.ts` (`IssueExecution`), `issue-fire.port.ts`, порты репозиториев/событий/комментариев/вложений/меток, `issue.error.ts` |
| `knowledge` | порты: наблюдение за файлами, сводка состояния индекса, события индекса, индексатор, корни, поиск, хранилище, `knowledge.error.ts` |
| `lsp` | порт LSP |
| `machine` | порты: хранилище билетов consumption, макет ФС хоста, конфигурация машины, пакет данных организации, хранилище машины организации |
| `manager` | порт хвоста менеджера, математика пульса |
| `mcp` | ошибки, порт MCP организации |
| `mode-presets` | встроенные предустановки режимов, порт реестра, ошибки |
| `model-execution` | ошибки, порты: изображение, речь, транскрипция, каталог голосов |
| `one-time-code.ts` | разовый код |
| `org` | `org-db.port.ts` (`OrgDbPort`: `bootstrap`, `rename`), `org.error.ts` |
| `permissions` | порт хранилища правил прав |
| `plan` | события плана, порт репозитория плана |
| `plugin` | ошибки, плагин, порты реестров, рантайм плагина |
| `presets` | порт каталога пресетов, порт библиотеки, представление пресета, ошибки |
| `process-runtime` | порт контейнера workspace |
| `provider` | порт провайдера LLM, ошибки провайдера |
| `release` | события релиза, порт репозитория релиза |
| `schedule` | планировщик, порт репозитория расписания, ошибки |
| `secret` | `vault-keys.ts` (префиксы `secret:`, `var:`, `llm_provider:`, `cloud:`), `secret-store.port.ts` (`SecretStorePort`), `provider-api-key.ts`, `secret.error.ts` |
| `skills` | порты: настройки организации навыков, навыки организации, поиск навыков, события навыков, источники навыков, ошибки |
| `source` | порты: драйвер источника, Git VCS, материализация, облачный бэкенд, наблюдение, реестр, локация, события, шлюз, ошибки, политика видимости UI |
| `teams` | ошибки команды |
| `terminal` | события терминала, порт сессии терминала, ошибки терминала |
| `thread` | `thread.ts` (`ThreadRecord`, `ThreadActiveRun`), `thread-policy.ts`, `local-executor.port.ts`, порты репозиториев/агентов/участников/событий/вложений/таймера ожидания, ошибки потока |
| `toolchain` | порт цепочки инструментов |
| `usage` | дневной бюджет, порт использования, ошибки |
| `webhook` | репозиторий вебхуков, ошибки, вебхук |

## Примеры сущностей

`app/domain/thread/thread.ts` — `ThreadRecord`:
```ts
interface ThreadRecord {
  id: string;
  orgId: string;
  title: string;
  kind: ThreadKind; // 'chat' | 'group' | 'schedule' | 'webhook' | 'issue'
  autoReplyAgentId: string | null;
  policy: ThreadPolicy;
  lastThreadSeq: number;
  conversationCount: number;
  parentThreadId: string | null;
  forkAt: string | null;
  inheritedEventCount: number;
  metadata: Record<string, unknown>;
  issueId?: string | null;
  runProfileId: string | null;
  runDirectory: string | null;
  createdAt: string;
  updatedAt: string;
  lastReadAt: string;
}
```
`ThreadActiveRun`: `runId, threadId, status ('queued'|'running'|'needs_input'|'waiting'), leaseExpiresAt?, startedByUserId?, via ('direct'|'agent'), onNodeId?`.

`app/domain/agent/agent.ts` — `AgentRecord`: `id, orgId, name, role, instructions, modelId, budgetUsdDaily, level, parentId, executionProfileId, status, sharedSourceIds, sourceLevels, secretNames, skills, mcpServers, enabledPlugins, defaultModeId, config, hooks, createdAt, updatedAt`.

`app/domain/identity/principal.ts` — `Principal = UserPrincipal | NodePrincipal`.

## Формат ошибок

Доменные ошибки типизированы (`*.error.ts`). Единый транспортный контракт: `ErrorResponse { statusCode, errorCode, message, path, timestamp, traceId?, details? }`. Домен выбрасывает `DomainException`, глобальный фильтр маппит в `HttpException`. Неизвестные → `500 INTERNAL_ERROR` + `pino.error` (`packages/brix/src/errors/error-filter.ts`).

## Диаграмма: домен → порты → адаптеры

```mermaid
graph TD
    subgraph Domain[app/domain/]
    TR[thread/thread.ts — ThreadRecord]:::domain
    AR[agent/agent.ts — AgentRecord]:::domain
    ID[identity/principal.ts — Principal]:::domain
    ORG[org/org-db.port.ts — OrgDbPort]:::domain
    end

    subgraph Ports[*-port.ts = DI токены (abstract class)]
    TP[thread-repository.port.ts]
    AP[agent-registry.port.ts]
    SP[session-store.port.ts]
    OP[org-db.port.ts]
    end

    subgraph Adapters[infra/*/*.adapter.ts]
    TA[thread-repository.adapter.ts]
    AA[org-sqlite/agents adapter]
    SA[session-repository.adapter.ts]
    OA[org-db.adapter.ts]
    end

    subgraph DB[(org SQLite per orgId)]
    end

    TR --> TP
    AR --> AP
    ID --> SP
    ORG --> OP
    TP -.->|реализует| TA
    AP -.->|реализует| AA
    SP -.->|реализует| SA
    OP -.->|реализует| OA
    TA --> DB
    AA --> DB
    SA --> DB
    OA --> DB

    classDef domain fill:#e1f5fe,stroke:#01579b;
```

## Связанные разделы

- [08-слой-application-use-cases.md](./08-слой-application-use-cases.md)
- [10-слой-infra-adapters.md](./10-слой-infra-adapters.md)
- [11-база-данных-schema.md](./11-база-данных-schema.md)
- [13-org-и-идентичность.md](./13-org-и-идентичность.md)
- [14-потоки-threads.md](./14-потоки-threads.md)
