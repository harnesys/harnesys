# 16. Агенты и AgentDefinition

## Обзор

Агент — детерминированное описание поведения выполнения: модель, набор инструментов, навыки, бюджет, политика памяти, план в виде графа узлов. Ядро агента находится в `packages/harnesys` и не зависит от сервера `apps/server`. Сервер создаёт рантайм через `createRuntime` и вызывает `run`/`start`.

## AgentDefinition (`packages/harnesys/src/domain/agent-definition.ts`)

```ts
export interface AgentDefinition {
  id: string;
  name?: string;
  version?: string;
  level?: AgentLevel;                 // 'top' | 'delegate' (из @harnesys/contracts)
  prompts: Record<string, { instructions: string }>;
  model?: AgentModelRef;
  models?: Record<string, AgentModelRef>;
  fallback?: AgentModelRef[];
  generation?: AgentGenerationSettings;
  skills?: string[];
  disallowedTools?: string[];
  mcpServers?: string[];
  toolOutput?: ToolOutputSettings;
  observability?: AgentObservability;
  compaction?: PortRef;
  memoryPolicy?: MemoryPolicy;
  paths?: AgentPaths;
  state?: { initial: Record<string, Expr | unknown>; reducers?: Record<string, 'replace' | 'merge'> };
  graph: AgentGraph;
  budget?: AgentBudget;
  packs?: AgentPacks;
  permissions?: PermissionMap;
  capabilities?: Record<string, PackConfig | null>;
  hooks?: AgentHook[];
  enabledPlugins?: Record<string, boolean>;
}
```

### Вспомогательные типы

- `AgentGraph = { nodes: Record<string, Node>; edges: Edge[] }` (`agent-definition.ts:75-78`).
- `Edge = { from: string; to: string; when?: Expr }` (`agent-definition.ts:134-138`).
- `AgentModelRef = { provider: string; model: string; effort?: string; generation?: AgentGenerationSettings }` (`agent-definition.ts:48-53`).
- `AgentGenerationSettings` — `temperature?`, `topP?`, `frequencyPenalty?`, `presencePenalty?`, `seed?`, `maxTokens?`, `contextWindowTokens?`, `stripReasoning?`, `reasoningKeepRounds?`, `streamIdleTimeoutMs?`, `providerRetryAttempts?`, `context?: AgentContextSettings` (`agent-definition.ts:28-47`).
- `AgentContextSettings` — `usageAnchor?`, `lengthCutContinuations?` (default 2), `spawnResultHeadChars?` (default 12000), `spawnResultTailChars?` (default 4000) (`agent-definition.ts:18-27`).
- `PortRef = { name: string; version?: string; spec?: Record<string, unknown> } | null` (`agent-definition.ts:54-58`).
- `AgentPaths = { allow: string[]; cwd?: string }` (`agent-definition.ts:59-62`).
- `ToolOutputSettings = { maxChars?, headChars?, tailChars?, redactSecrets? }` (`agent-definition.ts:63-68`).
- `AgentObservability = { rawRequests?: 'meta' | 'full' | 'off' }` (`agent-definition.ts:70-72`).
- `MemoryPolicy` — из `@harnesys/contracts` (поле `enforce`, `level`, `minSteps`, `maxNudges`).
- `AgentBudget = { maxSteps?, maxTokens?, deadlineMs?, policy?: 'ask' | 'error', warnAtSteps?, closeOnExhaustion?, extendDefaultPct?, spawnBudget?: 'pool' | 'inherit' }` (`agent-definition.ts:82-91`).
- `AgentPacks`, `PackConfig` — из `./pack.ts`.
- `PermissionMap` — из `./ports/permissions.ts`.
- `AgentHook` — из `@harnesys/contracts`.

### Типы узлов (Node)

`Node` — union типов узлов (`agent-definition.ts:172-256`):

| Узел | Поля | Назначение |
|------|------|------------|
| `core:start` | — | Приём входа |
| `core:end` | `output?: Expr` | Завершение run |
| `llm:generate` | `model?`, `prompt`, `messages?`, `tools?`, `output?` | Генерация LLM |
| `tool:call` (fixed) | `type: 'tool:call'`, `name`, `args`, `concurrency? never` | Один вызов инструмента |
| `tool:call` (batch) | `calls: Expr`, `concurrency: Expr \| 'parallel' \| 'sequential'`, `barrier? { policy: 'all' }`, `approve? { tools, reason, resumeSchema }` | Пакет вызовов инструментов |
| `control:assign` | `patch: Record<string, Expr \| unknown>` | Патч состояния |
| `control:route` | `prompt?`, `routes: GraphRoute[]`, `model?`, `minConfidence?` | LLM-маршрутизация |
| `control:spawn` | `calls: Expr`, `concurrency`, `barrier?`, `maxConcurrency?`, `timeoutMs?`, `onTimeout?` | Порождение дочерних агентов |
| `control:map` | `items: Expr`, `enter: string`, `body: string[]`, `concurrency`, `barrier?`, `timeoutMs?`, `onTimeout?`, `instruction?`, `maxTokensPerItem?` | Маппинг по списку |
| `control:yield` | `value?: Expr` | Только внутри map body |
| `control:goto` | `target: Expr` | Прямой переход |
| `control:interrupt` | `reason: InterruptReason`, `resumeSchema: JsonSchema` | Прерывание с запросом ввода |
| `control:wait` | `delayMs?`, `untilMs?`, `timeoutMs?`, `onTimeout?`, `reason?`, `resumeSchema?` | Ожидание таймера |
| `control:handoff` | `agentId: string \| Expr`, `input: Expr \| Record<string, Expr \| unknown>` | Смена агента |
| `custom:${string}` | `config?: JsonSchema \| unknown` | Кастомные узлы плагинов |

`InterruptReason = 'human_review' | 'policy' | 'uncertain_effect' | 'definition_migrated' | 'work' | 'wait'`.

### defineAgent

`defineAgent(def: AgentDefinition): AgentDefinition` (`agent-definition.ts:257-264`):
1. Валидация через `validateStructural(def)`.
2. Если ошибки с `severity === 'error'` — бросает `ValidationError`.
3. Возвращает глубокую копию через `JSON.parse(JSON.stringify(def))`.

## Компиляция плана (`packages/harnesys/src/application/compile.ts`)

`compile(def: AgentDefinition): { plan: Plan; diagnostics: Diagnostic[] }`:
- `diagnostics = validateStructural(def)`.
- `edgesByFrom`: рёбра группируются по полю `from` в `Map<string, AgentEdges>`.
- `plan = { nodes: def.graph.nodes, edgesByFrom, order: Object.keys(def.graph.nodes) }` — `order` — ключи узлов в порядке определения в графе.

`compileOrThrow(def: AgentDefinition): Plan` (`compile.ts:30-37`):
- Фильтрует диагностику по `severity === 'error'`.
- При ошибках бросает `codedRunError('agent_invalid', errors.map(d => \`${d.code}: ${d.message}\`).join('; '))`.
- Иначе возвращает `plan`.

`Plan` интерфейс (`compile.ts:4-8`):
```ts
export interface Plan {
  nodes: AgentNodes;
  edgesByFrom: Map<string, AgentEdges>;
  order: string[];
}
```

## Порты рантайма агента (`packages/harnesys/src/ports/create-runtime.ts`)

- `AgentRosterEntry = { id, name, parentId?, plugin? }` (`create-runtime.ts:23`).
- `AgentsResolve = { resolve: (id, parent?) => AgentDefinition \| undefined; list?: (parent?) => AgentRosterEntry[] }` (`create-runtime.ts:29`).
- `CreateRuntimeOptions` — конфигурация создания рантайма: модели, инструменты, mcp, навыки, агенты, права, пути, хуки, паки, lifecycle, events, feed, claimer, instanceId, targets и др. (`create-runtime.ts:33`).
- `RuntimeHandle` — `run`, `start`, `resume` (удалена, выбрасывает `codedRunError('resume_removed', ...)`), `compile`, `check`, `session`, `skills.list`, `packs.list`, `tools.list/registry`, `mcp.list`, `reloadSkills`, `reloadMcp`, `close` (`create-runtime.ts:60`).

## Схемы БД для агентов

Таблица `agents` (`org-sql.ts:223-243`):
```sql
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  instructions TEXT NOT NULL,
  model TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  budget_usd_daily REAL,
  level TEXT NOT NULL DEFAULT 'top',
  parent_id TEXT,
  placement TEXT NOT NULL DEFAULT '{"prefer":"any"}',
  execution_profile_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS agents_org_id_name_unique ON agents(org_id, name);
```

## Диаграмма: AgentDefinition → RuntimeHandle → startGraph

```mermaid
graph TD
    ADF[defineAgent(def: AgentDefinition)]
    COM[compile(def) -> Plan {nodes, edgesByFrom, order}]
    CRT[createRuntime(options) -> RuntimeHandle]
    RH[RuntimeHandle.run/start/session]
    GR[startGraph(GraphOpts) -> AsyncIterable<Event>]
    SEG[runSegment: lease + journal flush + segment lifecycle]
    ADF --> COM
    COM --> CRT
    CRT --> RH
    RH --> GR
    GR --> SEG
    SEG --> Lifecycle[RunLifecycleStore: claim, transition, renewLease]
    SEG --> Events[RunEventStore: append, tail]
```

## Связанные разделы

- [18-модель-исполнения-graph.md](./18-модель-исполнения-graph.md) — выполнение графа агента.
- [17-compaction-потоков.md](./17-compaction-потоков.md) — компакция контекста агента.
- [15-выполнение-run-engine.md](./15-выполнение-run-engine.md) — рантайм выполнения run.
- [54-пакеты-harnesys-ядро.md](./54-пакеты-harnesys-ядро.md) — пакет ядра harnesys.
- [55-пакеты-harnesys-packs.md](./55-пакеты-harnesys-packs.md) — пакеты инструментов.
- [33-presets.md](./33-presets.md) — пресеты агентов.
- [34-mode-presets.md](./34-mode-presets.md) — режимы работы.
