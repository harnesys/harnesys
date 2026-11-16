# 65. Хуки (hooks)

## Обзор

Хук — правило, которое движок исполняет в заданной точке жизненного цикла run: сессия, промпт, вызов инструмента, вызов модели, суб-агент, компакция, узел графа. Хук получает JSON-payload, возвращает набор эффектов (`block`, `context`, `update_input`, `update_output`, `ask`, `stop`, `remind`). Источник биндингов один из двух: поле `hooks` агента (`AgentPublic.hooks`) или `hooks/hooks.json` плагина.

Контракт событий и обработчиков — `packages/contracts/src/agent-hooks.ts`. Домен ядра — `packages/harnesys/src/domain/hook.ts`, `hook-catalog.ts`, `hook-gate.ts`. Рантайм ядра — `packages/harnesys/src/application/hooks/`. Сборка биндингов — `apps/server/src/app/infra/runtime/org-plugin-view.ts`. Наблюдаемость — таблица `hook_runs` и событие `hook` в фиде треда.

## Контракты (packages/contracts/src/agent-hooks.ts)

### События

`HOOK_EVENT_NAMES` — 19 событий: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Notification`, `PermissionRequest`, `PermissionDenied`, `PreModelCall`, `PostModelCall`, `NodeStart`, `NodeEnd`.

### Обработчики (`HookHandlerSchema`, discriminated union по `type`)

| `type` | Поля | Нужное право агента |
|---|---|---|
| `command` | `command`, `args?`, `shell?` (`bash`\|`powershell`), `timeoutS?`, `async?`, `env?` | `process` |
| `http` | `url`, `headers?`, `timeoutS?` | `network` |
| `mcp_tool` | `server`, `tool`, `input?`, `timeoutS?` | `mcp` |
| `prompt` | `prompt`, `model?`, `timeoutS?` | нет |
| `agent` | `agentId?`, `prompt`, `model?`, `timeoutS?` | `agents` |

### Прочее

- `AgentHookSchema`: `id?`, `event`, `matcher?`, `handler`, `enabled?`, `timeoutS?`. `AgentHooksSchema` — массив, максимум 50.
- `HookEffectSchema`: `block` (`reason`), `context` (`text`), `update_input` (`input`), `update_output` (`output`), `ask` (`reason`), `stop` (`reason?`), `remind` (`text`).
- `HookRunStatus` — `ok`\|`blocked`\|`failed`\|`timeout`\|`skipped`\|`denied`. `HookRun` — запись прогона хука (`hookId`, `event`, `handlerType`, `status`, `durationMs`, `summary?`, `errorCode?`, `effects[]`, `runId?`, `threadId?`).

## Домен ядра

| Файл | Содержимое |
|---|---|
| `domain/hook.ts` | `HookEventName` (19 нативных + 18 распознаваемых, но неподдержанных), `NATIVE_HOOK_EVENTS = HOOK_EVENT_NAMES`, `UNSUPPORTED_HOOK_EVENTS` (18), `HookPayload`, `HookBinding` (`id`, `origin: plugin\|agent\|host`, `event`, `matcher?`, `handler`, `vars{pluginRoot, pluginData}`) |
| `domain/hook-catalog.ts` | `HOOK_EVENT_CATALOG` — на каждое событие `label`, `phase` (`session`\|`prompt`\|`tool`\|`model`\|`agent`\|`compact`), `description`, `matcherSubject?`, флаги `canBlock`/`canContext`/`canAsk`/`canStop`; `hookCatalogEntry`, `hookMatcherApplies` |
| `domain/hook-gate.ts` | `hookRequiredPermission`, `hookGateStatus`, `hookIdOf`, `resolveHookBindings` |

`canBlock` стоит у `PreToolUse`, `PermissionRequest`, `PreModelCall`; `canAsk` — только `PreToolUse`; `canStop` — `Stop`, `SubagentStop`; `canContext` — `SessionStart`, `UserPromptSubmit`, `SubagentStart`.

### Гейт прав (`hook-gate.ts`)

`hookGateStatus` сопоставляет тип обработчика с правом агента (`process`/`network`/`mcp`/`agents`). Право считается выданным только при значении `allow`; `ask` и `deny` дают отказ с причиной `requires <Label> = Allow (current: <gate>)`. Хук без права не запускается: `resolveHookBindings` переносит его в `dropped`, а не в `bindings`. У `prompt`-хендлера права нет, он всегда `granted`.

## Рантайм ядра (packages/harnesys/src/application/hooks/)

| Файл | Роль |
|---|---|
| `bus.ts` | `createHookBus`: выборка по matcher, параллельный запуск, `async`-command → `deferred`, первый `block` абортит соседей через `AbortController`, `foldOutcome` сводит эффекты (context'ы склеиваются через `\n`), `emitNotification`, `drainDeferred`, `close` |
| `emit-hook.ts` | `emitHook` строит payload из `HookEmitCtx`; при отсутствии биндингов возвращает `undefined`. Хелперы чтения эффектов: `hookBlockedReason`, `hookContextText`, `hookUpdateInputOf`, `hookUpdateOutputOf`, `hookAskReason`, `hookStopEffect`, `hookRemindEffect` |
| `matchers.ts` | `matchesBinding`: точное совпадение (только `[A-Za-z0-9_,\- |]`) либо regex; `*`/пусто — все; `matcherSubject` берёт поле события (`tool_name`, `source`, `agent_type`, `trigger`, `model.model`, `node.type`, `reason`, `notification.type`) |
| `executors.ts` | `runHookHandler` — диспетчер по `type`; таймауты, `truncateHookString`, разбор JSON-вердикта `prompt`/`agent` (`ok`/`impossible`/`reason`) |
| `command-run.ts` | запуск команды (shell/exec), stdin-payload (`toStdinPayload`), подстановка `${CLAUDE_PLUGIN_ROOT}`/`${CLAUDE_PLUGIN_DATA}`/`${CLAUDE_PROJECT_DIR}`, env `PLUGIN_ROOT`/`PLUGIN_DATA`/`CLAUDE_*`, kill по таймауту/аборту через process group, `defaultTimeoutS` (600 с; `UserPromptSubmit` — 30; `prompt` — 30; `agent` — 120) |
| `claude-output.ts` | парсинг Claude-вывода: `decision`/`reason`, `continue`/`stopReason`, `hookSpecificOutput` (`hookEventName`, `permissionDecision`, `updatedInput`, `updatedToolOutput`, `additionalContext`), `sessionTitle`, exit-код 2 → block; лимит строки `HOOK_STRING_MAX = 10000` |
| `runtime-ctx.ts` | `createHookRuntimeCtx`: реализует `promptModel` (вызов модели), `mcpToolCall` (только сервер, подключённый к агенту), `delegateAgent` |
| `delegate-agent.ts` | `delegateHookAgent`: дочерний run с `intersectPermissions`, без наследования `hooks` (`hooks: undefined`) |

## Швы вызова

| Событие | Файл:строка | Что применяется из эффектов |
|---|---|---|
| `SessionStart` | `application/graph.ts:560` | `context` → hook-notes |
| `SessionEnd` | `application/create-runtime.ts:158`, `application/run-engine.ts:214` | наблюдение |
| `UserPromptSubmit` | `application/graph.ts:873`, `:919` | `context` |
| `PreToolUse` | `application/tool-approve.ts:211` | `block`, `ask`, `update_input` |
| `PostToolUse` | `application/tool-approve.ts:249` | `update_output` |
| `PostToolUseFailure` | `application/tool-approve.ts:324` | `update_output` |
| `PostToolBatch` | `application/tool-call.ts:260` | наблюдение |
| `PermissionRequest` | `application/tool-permission.ts:186` | `block` |
| `PermissionDenied` | `application/tool-approve.ts:158` | наблюдение |
| `Stop` | `application/graph.ts:950` | `stop` |
| `SubagentStart` | `application/graph-spawn.ts:388` | `context` |
| `SubagentStop` | `application/graph-spawn.ts:393` | `stop` |
| `PreCompact` / `PostCompact` | `application/compaction/run.ts:265`, `:429` | наблюдение |
| `Notification` | `application/hooks/bus.ts:114` | наблюдение |
| `PreModelCall` | `application/llm.ts:368` | `block` |
| `PostModelCall` | `application/llm.ts:468` | наблюдение |
| `NodeStart` / `NodeEnd` | `application/graph.ts:857`, `:2156` | наблюдение |

## Сборка биндингов (apps/server)

`org-plugin-view.ts` собирает биндинги для агента: сначала плагинные (`pluginHookBindings` по включённым плагинам агента, отсортированы по имени), затем агентские (`agentHookBindings`). Для `SessionStart` без явного таймаута ставится 30 с (`lowerSessionStartTimeout`, `SESSION_START_HOOK_TIMEOUT_S`).

- `pluginHookBindings` (`app/application/plugins/plugin-grant-gate.ts:116`) берёт компоненты `hook` со статусом `native`; для `command` раскрывает `${user_config.*}` и добавляет env `HARNESYS_PLUGIN_OPTION_<KEY>`; неразрешимый `user_config` дропает биндинг.
- `agentHookBindings` (`plugin-grant-gate.ts:211`) вызывает `resolveHookBindings(hooks, {agentId, root, permissions})`.
- Секреты: `resolveHookSecrets` (`app/infra/runtime/hook-secrets.ts`) подставляет значения из vault в `handler.env` там, где значение начинается с `VAULT_SECRET_PREFIX`.

## Наблюдаемость и API

| Компонент | Файл |
|---|---|
| Запись прогонов | `app/infra/runtime/hook-report.ts` → `hook_runs` + событие `hook` в `RunEventStore` (фид треда) |
| Порт | `app/domain/agent/hook-run-store.port.ts` (`HookRunStorePort.record/list`) |
| Адаптеры | `app/infra/org-sqlite/hook-run.store.ts`, `hook-run.adapter.ts`, `schema/hook-runs.ts` |
| Use-cases | `app/application/hooks/list-hook-runs.use-case.ts`, `test-agent-hook.use-case.ts` (dry-run, таймаут ≤ 60 с) |
| Контроллер | `app/api/rest/agent-hooks.controller.ts`: `GET /orgs/:orgId/agents/:agentId/hook-runs`, `POST .../hooks/test` |
| Валидация хуков агента | `app/application/agents/agent-hooks.validation.ts` (вызывается в `create-agent.use-case.ts:69`, `update-agent.use-case.ts:50`, тесте хука, `infra/runtime/packs/org-agents-catalog.port.ts:161`) |

Валидация (`agent-hooks.validation.ts`) проверяет: известность события, лимит 50, уникальность `id`, применимость matcher к событию, диапазон `timeoutS` (1–600), непустой command, http(s)-url, наличие MCP-сервера у агента, `agentId` (не сам агент, существует), env-ключи по `^[A-Z_][A-Z0-9_]*$`.

## UI

`apps/webui/src/features/manage-agent/ui/agent-hooks-pane.tsx` — панель агента: список, редактор (`hooks/hook-handler-editor.tsx`), статус по правам (`hookGateStatus`), тест (`hook-test-panel.tsx`), история (`hook-runs-panel.tsx`), каталог событий (`hook-catalog.ts`). Шесть шаблонов (`hooks/hook-presets.ts`): «Ask before shell commands» (`PreToolUse`+`Bash`+`ask`), «Block writes outside the repo» (`PreToolUse`+`Write|Edit`, exit 2), «Add context to every prompt» (`UserPromptSubmit`+`prompt`), «Run a check before the model answers» (`PreModelCall`+`command`), «Notify a webhook on tool failure» (`PostToolUseFailure`+`http`), «Ask a reviewer agent before the run ends» (`Stop`+`agent`).

## Плагинные хуки

`packages/harnesys/src/application/plugins/formats/hooks.ts` ищет `hooks/hooks.json` (или inline-объект при path-override манифеста). Формат — Claude-подобный: событие → массив групп `{matcher?, hooks: [{type, ...}]}`. Неизвестное событие → компонент `hook` со статусом `dropped`, код `event_unsupported`. Неизвестное поле обработчика → `unsupported_frontmatter_field`. Хендлер `agent` помечается `inert` с `inertReason: needs_verifier_runtime` при discovery плагина.

Права (`computeGrants` в `load-plugin.ts`): `command`-хук требует `needsProcess`, `http` — `needsNetwork`. `applyGrantGating` (`plugin-grant-gate.ts`) переводит компонент без гранта в `blocked_by_grant`.

## Пресеты

Хуки в пресетах не хранятся. `AgentPresetBodySchema` (`packages/contracts/src/presets.ts:28`) содержит `name`, `role`, `instructions`, `color?`, `skills?`, `mcpServers?`, `budget?`, `capabilities?`, `permissions?`, `graph?`; поля `hooks` нет. `ModePresetPublicSchema` (`packages/contracts/src/mode-presets.ts:31`) содержит `instructions`, `skills`, `packs`, `disabledTools`, `exposure`, `permissions`; хуков нет. `CreateAgentFromPresetBodySchema` (`packages/contracts/src/agent.ts:89`) — `presetId`, `name?`, `modelId?`, `parentId?`. При создании агента из пресета (`app/application/agents/create-agent-from-preset.use-case.ts`) переносятся role, instructions, skills, mcpServers, budget, graph, capabilities, permissions, color. Хуки задаются отдельно на агенте или в плагине.

## Claude-совместимость

Совместимость заявлена на уровне формата манифеста (`PluginSourceFormat 'claude-compat'`, `.claude-plugin/plugin.json`), реестра маркетплейсов (`PluginRegistryKind 'claude-marketplace'`, дефолт `anthropics/claude-plugins-official`) и схемы `hooks/hooks.json`. Рантайм-паритет частичный.

### События

- Поддержано нативно (15): `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`, `Stop`, `SubagentStart`, `SubagentStop`, `PreCompact`, `PostCompact`, `Notification`, `PermissionRequest`, `PermissionDenied`.
- Дропается с `event_unsupported` (18): `Setup`, `UserPromptExpansion`, `MessageDisplay`, `TaskCreated`, `TaskCompleted`, `StopFailure`, `TeammateIdle`, `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `PreModelSwitch`, `PostModelSwitch`, `Elicitation`, `ElicitationResult`.
- Только у нас (4): `PreModelCall`, `PostModelCall`, `NodeStart`, `NodeEnd`. Claude-события `PreModelSwitch`/`PostModelSwitch` при этом дропаются.

### Поля обработчика

Парсятся: `type`, `command`, `args`, `shell`, `timeout`, `timeoutS`, `async`, `env`, `url`, `headers`, `server`, `tool`, `input`, `prompt`, `model`. Игнорируются с `unsupported_frontmatter_field`: `if`, `onFailure`, `statusMessage`, `once`, `asyncRewake`, `allowedEnvVars`, `continueOnBlock`.

### JSON-вывод

| Claude | Поведение у нас |
|---|---|
| `decision: "block"` + `reason`, `continue: false` + `stopReason`, exit 2 → stderr | поддержано |
| `hookSpecificOutput.additionalContext`, `.updatedInput` | поддержано |
| `hookSpecificOutput.permissionDecision` (`deny`/`ask`/`allow`/`defer`) | значение читается, но причина берётся из верхнеуровневого `out.reason`, а Claude кладёт её в `hookSpecificOutput.permissionDecisionReason`; `deny`/`ask` дают эффект с пустым `reason` |
| `hookSpecificOutput.decision.behavior` (`PermissionRequest`), `updatedPermissions`, `retry` | не читается; решение `PermissionRequest` из Claude-хука игнорируется |
| `systemMessage` | не мапится (поле есть в типе, эффекта нет) |
| `watchPaths`, `initialUserMessage` | warning `hook_invalid_output`, игнор |

### Область определения

| Claude | У нас |
|---|---|
| Plugin `hooks/hooks.json` | поддержано |
| `~/.claude/settings.json`, `.claude/settings.json` | не читаются; плагинный `settings.json` берёт только ключи `agent`, `subagentStatusLine` (`formats/extras.ts:35`) |
| Subagent frontmatter `hooks:` | запрещено (`formats/agents-commands.ts:28`, `:160`) → весь компонент агента получает статус `dropped` |
| Skill frontmatter `hooks:` | нет носителя в модели навыка |

### Прочие расхождения

- Плагинный `command`-хук запускается с `cwd = pluginRoot` (`command-run.ts:54`); Claude запускает хендлеры в текущей директории сессии.
- `permission_mode` в payload всегда пустая строка (`run-engine-prepare.ts:199`).
- Env `CLAUDE_ENV_FILE` и поле `transcript_path` не передаются.
- Origin `host` объявлен в типе `HookBinding`, но биндингов с ним код не создаёт.

## Связанные разделы

- [16-агенты-и-agent-definition.md](./16-агенты-и-agent-definition.md) (поле `hooks` агента)
- [32-plugins.md](./32-plugins.md) (плагинные хуки, grants, IR)
- [33-presets.md](./33-presets.md), [34-mode-presets.md](./34-mode-presets.md) (состав пресетов)
- [15-выполнение-run-engine.md](./15-выполнение-run-engine.md) (сессия, `SessionEnd`)
- [18-модель-исполнения-graph.md](./18-модель-исполнения-graph.md) (швы графа, `Stop`, `NodeStart`)
- [51-границы-документации.md](./51-границы-документации.md) (известные ограничения)
