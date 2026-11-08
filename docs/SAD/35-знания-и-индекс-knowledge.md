# 35. База знаний и индекс (knowledge)

## Обзор

База знаний индексирует файлы организации, хранит чанки, поддерживает полнотекстовый поиск (FTS) и семантический поиск (векторы), отслеживает изменения файлов через watcher. Реализована в `app/domain/knowledge/` и `app/infra/knowledge/`, порты и пак — в `packages/harnesys/src/ports/memory.ts` и `packages/harnesys/src/packs/memory/`.

## Домен (app/domain/knowledge/)

| Файл | Назначение |
|------|------------|
| `knowledge-index-events.port.ts` | события индекса знаний (`KnowledgeIndexEventsPort`) |
| `knowledge-indexer.port.ts` | порт индексатора (`KnowledgeIndexerPort`: `startFullReindex`, `cancel`, `getState`, `listIndexStates`, `onFileEvent`) |
| `knowledge-roots.port.ts` | порт корней знаний (реэкспорт `KnowledgeStorePort` как `KnowledgeRootsPort`) |
| `knowledge-search.port.ts` | порт поиска (`KnowledgeSearchPort`: `search(orgId, sourceId, query, limit?)`) |
| `knowledge-store.port.ts` | порт хранилища (`KnowledgeStorePort`: `listRoots`, `upsertRoot`, `deleteRoot`, `countChunks`, `countFilesByStatus`, `getSettings`, `putSettings`, `listFiles`, `getIndexState`, `getStats`, `readChunk`, `deleteForSource`) |
| `files-watcher.port.ts` | порт наблюдения за файлами (`FilesWatcherPort`: `watch`, `listTree`) |
| `index-state-summary.ts` | сводка состояния индекса |
| `knowledge.error.ts` | ошибки знаний |

не проверено кодом — точные сигнатуры портов в `app/domain/knowledge/` не найдены в объёме этого раздела; имена взяты из существующего SAD и требуют проверки.

## Use-cases (application/knowledge/)

`knowledge.use-case.module.ts` — управление знаниями: корни, индексация, поиск, настройки. — не проверено кодом.

## Контроллеры (app/api/rest/)

`knowledge.controller.ts`, `knowledge-org.controller.ts`. — не проверены кодом.

## Адаптер (infra/knowledge/)

`KnowledgeAdapter` (`knowledge.adapter.ts`, `knowledge.module.ts`) реализует `KnowledgeStorePort`, `KnowledgeIndexerPort`, `KnowledgeSearchPort`. Работает через `org-sqlite` (`openOrgSqlite`, `SqliteKnowledgeIndexRepo`), `StudioEmbeddings` для эмбеддингов, `KnowledgeIndexer` (`knowledge-indexer.ts` с `*-full.ts`, `*-shared.ts`, `*-uri.ts`, `*-watch.ts`), `KnowledgeSourceWatch` (`knowledge-source-watch.ts`) поверх `FilesWatcherPort`.

Файлы инфраструктуры:
- `knowledge-indexer.ts`, `knowledge-index-file.ts`, `knowledge-index-repo.ts`, `knowledge-index-settings.ts`, `knowledge-index-types.ts`
- `knowledge-root-store.ts`, `knowledge-search.ts` (`searchKnowledgeFts`, `searchKnowledgeVector`), `knowledge-delete.ts`, `knowledge-embeddings.ts`, `knowledge-settings-default.spec.ts`
- `chunk-text.ts`, `embedding-vec.ts`, `embeddings.ts`, `fts-query.ts`, `knowledge-walk.ts`, `knowledge-walk-ignore.ts`, `knowledge-watch.ts`
- `memory-backend.ts`, `sqlite-client.ts`, `sqlite-knowledge.port.ts`

## Бэкенды поиска и настройки

Поддерживаются `fts` (полнотекстовый) и `vector` (семантический). Настройки задаются в `knowledgeSettingsTable` (org-sqlite schema). По умолчанию: `entireSource: false`, `backend: 'fts'`, `embedProvider: null`, `embedModel: null`, `watchEnabled: false`.

### Константы (apps/server/src/const.ts)

| Константа | Значение | Назначение |
|-----------|----------|------------|
| `KNOWLEDGE_MAX_SIZE_BYTES` | `2_000_000` | max размер файла для индексации |
| `DEFAULT_CHUNK_CHARS` | `1200` | размер чанка символами |
| `DEFAULT_OVERLAP` | `150` | перекрытие чанков |
| `KNOWLEDGE_EMBED_BATCH_SIZE` | `64` | размер батча эмбеддингов |
| `KNOWLEDGE_TEXT_EXTS` | `Set` | текстовые расширения для индекса |
| `KNOWLEDGE_WATCH_ENSURE_INTERVAL_MS` | `30_000` | интервал проверки watcher |
| `KNOWLEDGE_INDEX_SLOW_FILE_MS` | `5000` | порог медленного файла индекса |
| `KNOWLEDGE_EMBED_SLOW_MS` | `8000` | порог медленного эмбеддинга |
| `OLLAMA_EMBED_KEEP_ALIVE` | `'10m'` | keep-alive Ollama |

## Поток индексации и поиска

```mermaid
flowchart TD
  Root[upsertRoot: orgId, sourceId, path, enabled] --> Watch{watchEnabled?}
  Watch -->|да| SW[KnowledgeSourceWatch: FilesWatcherPort.watch]
  Watch -->|нет| Idle[без наблюдения]
  SW -->|событие файла| FE[onFileEvent: удалить чанки или enqueuePaths]
  Root --> RI[startFullReindex / KnowledgeIndexer]
  RI --> Chunk[chunk-text: 1200 символов, overlap 150]
  Chunk --> Emb[StudioEmbeddings (вектор) или FTS]
  Emb --> Store[SqliteKnowledgeIndexRepo: чанки, файлы, настройки]
  Q[search(query)] --> Backend{settings.backend}
  Backend -->|vector| V[searchKnowledgeVector]
  Backend -->|fts| F[searchKnowledgeFts]
  V --> Hit[KnowledgeHit[]]
  F --> Hit
```

Пошагово:

1. `upsertRoot` регистрирует корень (`orgId`, `sourceId`, `path`, `enabled`).
2. При `watchEnabled: true` — `KnowledgeSourceWatch` следит за файлами (`FilesWatcherPort.watch`); при событии `onFileEvent` удаляет чанки файла (при удалении) или ставит путь в очередь индексации (`enqueuePaths`).
3. `startFullReindex` обходит корни (`listEnabledRoots`: при `entireSource` — `['.']`, иначе включённые пути), разбивает текст (`chunk-text.ts`), считает эмбеддинги (или FTS) и пишет в `SqliteKnowledgeIndexRepo`.
4. Поиск (`KnowledgeAdapter.search`) выбирает бэкенд по `settings.backend`: `searchKnowledgeVector` с эмбеддингами или `searchKnowledgeFts`. Возвращает `KnowledgeHit[]` (`id`, `title?`, `text`, `uri?`, `score?`).
5. Чтение чанка — `readChunk`.

## Порты памяти (packages/harnesys/src/ports/memory.ts)

| Порт | Методы |
|------|--------|
| `PinPort` | `list`, `upsert`, `remove`, `projectForWindow(budgetTokens)` |
| `SemanticMemoryPort` | `list`, `upsert`, `update`, `remove`, `projectForWindow?`, `projectForQuery?` |
| `EpisodicPort` | `index?`, `search` |
| `KnowledgePort` | `search`, `read?`, `reindex?` |

Типы: `MemoryScopeId` (`orgId`, `agentName`, `threadId?`). `PinSource` = `agent` \| `human`. `PinRecord` (`key`, `text`, `updatedAt`, `source`). `MemoryRecordSource` = `agent` \| `human` \| `compaction`. `MemoryRecord` (`id`, `scope`, `text`, `key?`, `createdAt`, `updatedAt`, `source`, `threadId?`, `accessCount?`, `lastAccessedAt?`). `KnowledgeHit` (`id`, `title?`, `text`, `uri?`, `score?`). `SemanticScope` = `session` \| `long`.

## Пак памяти (packages/harnesys/src/packs/memory/)

| Файл | Назначение |
|------|------------|
| `knowledge.ts` | пак `knowledge-memory` (`knowledge_search`, `knowledge_read`, `DEFAULT_KNOWLEDGE_TOP_K`) |
| `semantic.ts` | пак `semantic-memory` (`memory_write`, `memory_list`, `memory_update`, `memory_delete`) |
| `pin.ts` | пак `pin-memory` (`pin_set`, `pin_list`, `pin_remove`) |
| `relevance.ts` | оценка важности факта с полураспадом |
| `promotion.ts` | блоки продвижения в инструкции |
| `create-knowledge-tools.ts` | инструменты知识搜索/чтение |
| `create-semantic-tools.ts` | инструменты семантической памяти |
| `create-pin-tools.ts` | инструменты пинов |
| `memory-scope.ts` | разрешение(scope) памяти |
| `index.ts` | экспорт `memoryCapabilities` (knowledge, pin, semantic) |

`knowledge_memory_capability`: имя `knowledge-memory`, версия `1.0.0`, инструменты `knowledge_search` / `knowledge_read`, `specSchema.store` = `'knowledge'`, `topK` по умолчанию `DEFAULT_KNOWLEDGE_TOP_K`.

## Контракты (packages/contracts/src/memory.ts, memory-policy.ts)

`memory.ts`: `PinSource` (`agent`\|`human`), `PinRecord`, `SemanticScope` (`session`\|`long`), `MemoryRecordSource` (`agent`\|`human`\|`compaction`), `MemoryRecord`, `UpsertPinBody` (текст max 20000), `ListSemanticQuery`, `UpsertSemanticBody` (текст max 20000, key max 200), `UpdateSemanticBody`, `MemorySettingsBody`.

`memory-policy.ts`: `MemoryPolicy` (`read`, `consolidate`, `reflect`, `enforce`, `promote`, `minSteps`, `maxNudges`, `reflectInterval`, `decayHalfLifeDays`, `promoteThreshold`, `projectLimit`, `projectBudgetTokens`, `pinBudgetTokens`, `relevanceTopK`, `relevanceMinChars`, `factClipChars`, `consolidateModelId?`). `DEFAULT_MEMORY_POLICY`: `read: true`, `consolidate: true`, `reflect: false`, `enforce: false`, `promote: false`, `minSteps: 3`, `maxNudges: 1`, `reflectInterval: 24`, `decayHalfLifeDays: 30`, `promoteThreshold: 8`, `projectLimit: 20`, `projectBudgetTokens: 800`, `pinBudgetTokens: 1500`, `relevanceTopK: 8`, `relevanceMinChars: 24`, `factClipChars: 200`. `parseMemoryPolicy` — валидация с дефолтами.

## Связанные разделы

- [19-источники-и-материализация.md](./19-источники-и-материализация.md)
- [36-провайдеры-моделей-llm.md](./36-провайдеры-моделей-llm.md) (эмбеддинги через LLM-провайдеры)
- [11-база-данных-schema.md](./11-база-данных-schema.md) (таблицы knowledgeChunks, knowledgeFiles, knowledgeIndexState, knowledgeRoots, knowledgeSettings)
