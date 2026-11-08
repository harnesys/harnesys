# 10. Инфраструктурный слой (infra: адаптеры и модули)

## Назначение и место в слоях

`apps/server/src/app/infra/` содержит реализации абстрактных портов домена — адаптеры (`*.adapter.ts`) и модули DI (`*.module.ts`). Каждая способность (capability) имеет свою директорию `infra/<способность>/`. Всего 51 элемента в директории `org-sqlite` (адаптеры, схема, миграции, сессия) и десятки директорий возможностей под `infra/`.

## DI регистрация (brix)

Каждый адаптер реализует порт домена. Модуль DI регистрирует связку:

```ts
providers: [{ provide: Port, useClass: Adapter }],
exports: [Port]
```

Токен DI — класс порта (`abstract class`), импортируется обычным `import` (не `import type`; `import type` стирает класс из метаданных `design:paramtypes`, контейнер brix видит `Object`). Если один файл экспортирует и класс-токен, и типы, импорты разделяются: `import { Port } from '...port.ts'` + `import type { SomeType } from '...port.ts'`. Проверка корректности DI возможна только при запуске сервера (ошибка: `Cannot resolve dependency at index N ... metadata erased the token to Object`).

## Перечень директорий инфраструктуры (фактически существующие)

| Директория | Ключевые файлы | Назначение |
|------------|----------------|------------|
| `org-sqlite` | `org-db.adapter.ts`, `org-sqlite-session.ts`, `org-sql-ensure.ts`, `schema/`, `org-sql-*.ts`, репозитории (runs, threads, issues, secrets, plugins, fleet и др.) | основная БД организации в SQLite (bun:sqlite + Drizzle) |
| `identity-sqlite` | `session-repository.adapter.ts`, `user-repository.adapter.ts`, `membership-repository.adapter.ts`, `password-hasher.adapter.ts`, `identity-sqlite.module.ts`, `identity.schema.ts` | идентичность в отдельной SQLite |
| `fleet-hub` | `fleet-hub.adapter.ts`, `worker-dialer.adapter.ts`, `work-executor.ts`, `fleet-worker.ws.ts` | хаб флота, исполнение работ, коммутатор работников |
| `thread` | `thread-repository.adapter.ts`, `thread-agent-repository.adapter.ts`, `thread-participant-repository.adapter.ts`, `thread-events.adapter.ts`, `attachment-repository.adapter.ts`, `attachment-storage.adapter.ts`, `thread.module.ts` | репозитории потока, агентов, участников, вложений, событий |
| `knowledge` | `knowledge.adapter.ts`, `knowledge-indexer.ts`, `knowledge-indexer-full.ts`, `knowledge-indexer-watch.ts`, `knowledge-search.ts`, `knowledge-embeddings.ts`, `knowledge.module.ts` | индексация знаний, эмбеддинги, FTS5, поиск |
| `skills` | `org-skills.adapter.ts`, `org-settings.adapter.ts`, `skills-events.adapter.ts`, `skills-search.adapter.ts`, `skills-tier-cache.ts`, `system-skills-seed.ts`, `skills.module.ts` | навыки, файловое хранение, сеяние системных |
| `secret` | `secret-store.adapter.ts`, `master-key.ts`, `secret.module.ts` | шифрование AES-GCM, мастер-ключ |
| `source` | `source-registry.adapter.ts`, `source-materialization.adapter.ts`, `source-location.adapter.ts`, драйверы `drivers/git/`, `drivers/cloud/`, `source.module.ts` | источники, материализация, наблюдение |
| `issues` | `issue-repository.adapter.ts`, `board-repository.adapter.ts`, `issue-*-repository.adapter.ts`, `issue.module.ts` | задачи, доски, вложения, комментарии, зависимости |
| `connector` | `connector-repository.adapter.ts`, `telegram-api.adapter.ts`, `connector.module.ts` | соединители, Telegram API |
| `integrations` | `integration-registry.adapter.ts`, `installed-integrations.ts`, `integration-host.ts`, `integration.module.ts` | реестр установленных интеграций, хост интеграции |
| `integration/github` | `github-api.ts`, `github-token.adapter.ts`, `app-jwt.ts`, `installation-token.ts` | GitHub App, JWT, токены установки |
| `integration/google` | `google-oauth-device.ts`, `gmail-api.ts`, `drive/calendar/sheets/...` | Google OAuth device, API |
| `runtime` | `org-runtime.ts`, `run-*`, `org-runtime-*.ts`, `sqlite-run-*` | рантайм выполнения, снимки, очереди, аренды |
| `terminal` | `terminal-sessions.adapter.ts`, `terminal.ws.ts`, `terminal.module.ts` | сессии терминала, WebSocket |
| `webhooks` | `webhook-repository.adapter.ts`, `webhook.module.ts` | репозиторий вебхуков |
| `schedules` | `schedule-repository.adapter.ts`, `schedule.module.ts` | репозиторий расписаний |
| `provider` | `sqlite-llm-provider.adapter.ts`, `sqlite-llm-model.adapter.ts`, `provider.module.ts` | провайдеры и модели LLM в SQLite |
| `mcp` | `org-mcp-json.adapter.ts`, `mcp.module.ts` | MCP конфигурация организации в JSON |
| `plugins` | `plugin-registry.adapter.ts`, `plugin-runtime.adapter.ts`, `plugins.module.ts` | плагины, реестр, рантайм |
| `presets` | `preset-repository.adapter.ts`, `system-presets-seed.ts`, `presets.module.ts` | пресеты, репозиторий, системные пресеты |
| `mode-presets` | `mode-preset-registry.adapter.ts`, `mode-presets.module.ts` | режимные пресеты |
| `lsp` | `lsp.adapter.ts`, `lsp.module.ts`, `lsp-stdio-transport.ts` | LSP серверы, транспорт stdio |
| `file-access` | `file-access-rule.adapter.ts`, `file-access.module.ts` | правила доступа к файлам |
| `content` | `local-fs.adapter.ts`, `path-jail.ts`, `routing-content.adapter.ts`, `content.module.ts` | файловый контент, path jail |
| `permissions` | `permission-rule-store.adapter.ts`, `permissions.module.ts` | правила прав |
| `plan` | `plan-events.adapter.ts`, `plan.module.ts` | события плана |
| `process-runtime` | `docker-workspace.adapter.ts`, `workspace-container.module.ts` | Docker workspace |
| `release` | `release-events.adapter.ts`, `release.module.ts` | события релиза |
| `toolchain` | `toolchain.adapter.ts`, `toolchain-discovery.ts`, `toolchain.module.ts` | цепочка инструментов |
| `usage` | `usage.adapter.ts`, `usage.module.ts` | отчёты использования |
| `desk` | `desk-events.adapter.ts`, `desk.module.ts` | события стола |
| `browser` | `browser.module.ts`, `local-browser-host.adapter.ts` | браузер |
| `events-watch` | `events-watch-hub.ts`, `events-watch.module.ts` | хаб событий (SSE) |
| `execution-profile` | `execution-profile.adapter.ts`, `execution-profile.module.ts` | профили выполнения |
| `eula` | `eula.adapter.ts`, `eula.module.ts` | EULA |
| `manager` | `manager.module.ts` | модуль менеджера |
| `machine-home` | `machine-home.module.ts` | домашний каталог машины |
| `machine-json` | `machine-config.adapter.ts`, `org-machine-store.adapter.ts` | конфигурация машины JSON |
| `node-identity` | `consumed-ticket-store.adapter.ts`, `node-identity-store.adapter.ts` | идентичность узла, билеты |
| `memory` | `memory-crawler.ts`, `org-memory-*.store.ts` | обход и хранение памяти |
| `approvals` | `approval-store.adapter.ts`, `approval-events.adapter.ts`, `approval.module.ts` | одобрения |
| `fs-layout` | `host-fs-layout.adapter.ts`, `org-data-pack.adapter.ts` | макет ФС хоста, пакет данных организации |
| `files-watcher` | `files-watcher.adapter.ts`, `files-watcher-git.ts`, `files-watcher-snapshot.ts` | наблюдение за файлами |
| `ws` | `bun-websocket.ts` | WebSocket Bun |

## Драйверы источников (`infra/source/drivers`)

- `git/`: `git.driver.ts` (`kind='git'`, `ensureMaterialized` клонирует bare-репо, `refresh` тянет изменения, worktree), `git-engine.ts`, `git-standalone-worktree.ts`, `vcs/git-cli.adapter.ts`, `vcs/git-diff.ts`, `vcs/git-exec.ts`, `vcs/git-helpers.ts`, `vcs/git-status.ts`.
- `cloud/`: `cloud-mirror-engine.ts`, `cloud-mirror-reconcile.ts`, `cloud-sync-back-*`, `google-drive.backend.ts` (Google Drive API v3).

## Пример модуля адаптеров (thread)

`infra/thread/thread.module.ts`:
```ts
providers: [
  { provide: ThreadRepositoryPort, useClass: ThreadRepositoryAdapter },
  { provide: ThreadAgentRepositoryPort, useClass: ThreadAgentRepositoryAdapter },
  { provide: ThreadParticipantRepositoryPort, useClass: ThreadParticipantRepositoryAdapter },
  { provide: AttachmentRepositoryPort, useClass: AttachmentRepositoryAdapter },
  { provide: AttachmentStoragePort, useClass: AttachmentStorageAdapter },
  { provide: ThreadEventsPort, useClass: ThreadEventsAdapter },
],
exports: [ThreadRepositoryPort, ThreadAgentRepositoryPort, ThreadParticipantRepositoryPort, AttachmentRepositoryPort, AttachmentStoragePort, ThreadEventsPort]
```

## Диаграмма: порты → адаптеры → SQLite

```mermaid
graph TD
    subgraph Ports[domain/*-port.ts]
        P1[ThreadRepositoryPort]
        P2[SourceRegistryPort]
        P3[OrgDbPort]
        P4[UserRepositoryPort]
    end
    subgraph Adapters[infra/*/*.adapter.ts]
        A1[ThreadRepositoryAdapter]
        A2[SourceRegistryAdapter]
        A3[OrgDbAdapter]
        A4[UserRepositoryAdapter]
    end
    subgraph SQLiteOrg[(org SQLite: 46+ таблиц)]
        T1[threads, runs, run_events]
        T2[sources, source_materializations]
        T3[agents, llm_providers, llm_models]
        T4[secrets AES-GCM]
        T5[issues, boards, schedule]
    end
    subgraph SQLiteIdentity[(identity SQLite)]
        I1[users, sessions, memberships, invites]
    end
    Ports -->|реализуют| Adapters
    Adapters -->|bun:sqlite / drizzle| SQLiteOrg
    Adapters -->|bun:sqlite / drizzle| SQLiteIdentity
```

## Связанные разделы

- [09-слой-domain-entities-ports.md](./09-слой-domain-entities-ports.md)
- [11-база-данных-schema.md](./11-база-данных-schema.md)
- [19-источники-и-материализация.md](./19-источники-и-материализация.md)
