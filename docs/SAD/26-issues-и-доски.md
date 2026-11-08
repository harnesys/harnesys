# 26. Задачи и доски (issues, boards)

## Назначение

Домен `app/domain/issue/` реализует систему задач (issues) с досками (kanban), правилами автоматизации, зависимостями и механизмом "пожара" (fire). Ядро — синхронная логика (движок правил, résolution пожара, проверка циклов зависимостей), хранилище — адаптеры в `infra/issues/`.

## Домен (`app/domain/issue/`)

| Файл | Назначение |
|------|------------|
| `issue.ts` | `IssueRecord` (`id`, `orgId`, `boardId`, `title`, `description`, `statusKey`, `priority` 1..4, `type` (`task`|`bug`|`research`|`feature`|`improvement`|`review`), `assigneeAgentId`, `labels`, `parentIssueId`, `dueDate`, `closedAt`, `fireTrail`, `sourceId`, `branch`, `worktreeOnStatus`, `createdAt`, `updatedAt`); `IssueFireTrailEntry`, `ISSUE_FIRE_TRAIL_LIMIT = 10`, `appendFireTrail` (обрезка до 10 записей) |
| `issue.error.ts` | ошибки задач |
| `board.ts` | `IssueBoardRecord` (`id`, `orgId`, `name`, `description`, `color`, `icon`, `status` (`active`|`archived`), `archivedAt`, `statuses`, `rules`); `BoardRuleRecord` (`id`, `trigger`, `conditions`, `actions`, `position`, `enabled`, `createdByUserId`) |
| `board.error.ts` | ошибки досок |
| `board-validation.ts` (тест) | валидация доски |
| `decide-worktree-field-patch.ts` (тест) | решение патча поля worktree |
| `dependency-cycle.ts` | `hasOpenBlockers` (зависимость `blocks`, цель не закрыта), `createsBlocksCycle` (обход графа `blocks`) |
| `issue-attachment.ts` | вложение задачи |
| `issue-execution.ts` (тест) | выполнение задачи |
| `issue-fire.port.ts` | `IssueFirePort.fire(request)` → `IssueFireResult` (`fired` с `runId` | `thread-busy` | `failed`) |
| `issue-repository.port.ts` | репозиторий задач |
| `issue-worktree-binding.ts` (тест) | привязка задачи к worktree |
| `label.ts` | метка задачи |
| `resolve-fire.ts` (тест) | `resolveFire(input)` → `ResolvedFire` (`agentId`, `executionProfileId`, `ruleId`, `reason` (`rule`|`override`), `ownerUserId`, `finalStatusKey`, `notifications`, `skippedRules`, `stop`) |
| `rule-engine.ts` (тест) | движок правил `runRules`, `pickAssignment` |
| Порты: `issue-attachment-repository.port.ts`, `issue-attachment-storage.port.ts`, `issue-comment-repository.port.ts`, `issue-dependency-repository.port.ts`, `issue-events.port.ts`, `issue-execution.port.ts`, `label-repository.port.ts`, `board-repository.port.ts` |

## Контракты

**`packages/contracts/src/issues.ts`**: `Issue`, `IssuePublic`, `IssueListItem`, `IssueType` (`task`|`bug`|`research`|`feature`|`improvement`|`review`), `IssuePriority` (1..4), `IssueStatus`, `IssueAttachmentKind` (`file`|`source`), `IssueAttachmentPublic`, `IssueCommentPublic`, `IssueCommentAuthorType` (`human`|`agent`), `IssueDependencyType` (`blocks`|`relates`|`duplicate`), `IssueDependencyPublic`, `IssueLabelPublic`, `IssueBoardPublic`, `IssueBoardStatus` (`active`|`archived`), `IssueExecutionPublic`, `IssueExecutionState`, `IssueFireReason` (`rule`|`override`), `IssueFireOutcome` (`fired`|`thread-busy`|`failed`), `IssueFireTrailEntry`, `IssueWorktreeRef`, тела запросов/ответов.

**`packages/contracts/src/boards.ts`**: `StatusCategory` (`backlog`|`started`|`finished`|`cancelled`), `BoardStatus` (`key`, `label`, `category`, `order`, `color`, `isEntry`), `RuleTriggerType` (`status_entered`|`issue_created`), `RuleConditionType` (`has_label`), `RuleActionType` (`assign_agent`|`set_status`|`notify_owner`), `RuleTrigger`, `RuleCondition`, `RuleAction`, `BoardRule` (`trigger`, `conditions`, `actions min 1`, `position`, `enabled`), `BoardRuleInput`, `BoardDefinition`, `BoardTemplateKey` (`dev`|`simple`|`crm`|`blank`).

## Use-cases

`application/issues/issue.use-case.module.ts`: создание, обновление, удаление задач, управление досками, правилами, метками, зависимостями, выполнением, пожаром. Отдельно: `fire-issue.use-case.ts`, `dispatch-issue-execution.ts`, `nudge-issue.use-case.ts`, `create-issue-worktree.use-case.ts`, `issue-worktree-binding.ts`, `issue-rule-support.ts`, `issue-guards.ts`, `board-guards.ts`, `board-events.ts`.

## Контроллеры

`issues.controller.ts`, `boards.controller.ts`, `labels.controller.ts`.

## Адаптеры (`infra/issues/`)

`issue-repository.adapter.ts`, `board-repository.adapter.ts` (+ statuses, layout, spec), `issue-attachment-repository.adapter.ts`, `issue-attachment-storage.adapter.ts`, `issue-comment-repository.adapter.ts`, `issue-dependency-repository.adapter.ts`, `issue-events.adapter.ts`, `label-repository.adapter.ts`, `issue.module.ts`, `board-order.ts`, `board-rule-mapper.ts`, `board-status-mapper.ts`.

## Движок правил (`rule-engine.ts`)

Правило = триггер + условие + действие. Триггеры: `issue_created`, `status_entered` (с `statusKey`). Условия: `has_label` (с `labelId`). Действия: `assign_agent` (`agentId`, `executionProfileId?`), `set_status` (`statusKey`), `notify_owner` (`text max 2000`). Константа `MAX_CASCADE_TRANSITIONS = 5`.

`runRules(input)`:
1. События приводятся к массиву (`issue_created` / `status_entered`).
2. Правила сортируются по `position`; включённые (`enabled`) — активные, выключенные — пропускаются (`skippedRules`, причина `disabled`).
3. Для каждого события применяются активные правила: проверка триггера (`triggerMatches`), условий (`evaluateConditions`: `dead-ref` если ссылка на несуществующую метку, иначе `matched` если все метки есть, иначе `no-match`), действий.
4. Действие `set_status` добавляет событие `status_entered` в очередь — каскад переходов, ограничен `MAX_CASCADE_TRANSITIONS = 5`; останов по `cascade-cap` или `status-repeat` (статус уже посещён).

`pickAssignment(input)`: выбирает назначение агента для события `status_entered` по первым совпадающим правилам (последнее назначение выигрывает); проверяет `agentExists`; `ownerUserId` — `createdByUserId` первого назначения.

## Разрешение пожара (`resolve-fire.ts`)

`resolveFire` вызывает `runRules` и формирует `ResolvedFire`:
- `reason: 'override'` если задан `explicitAssignee`, иначе `'rule'`
- `agentId = null` если `hasOpenBlockers` (открытые bloqueрующие зависимости `blocks`), иначе `explicit ?? lastAssign.agentId`
- `executionProfileId`, `ruleId` — `null` при `override`, иначе из последнего назначения
- `ownerUserId` — `createdByUserId` первого назначения
- `finalStatusKey`, `notifications`, `skippedRules`, `stop` из исхода движка

## Зависимости

`dependency-cycle.ts`:
- `hasOpenBlockers(dependencies, issueId, isClosed)` — `true` если есть зависимость `blocks` на незакрытую задачу.
- `createsBlocksCycle(dependencies, issueId, dependsOnIssueId)` — `true` если добавление ребра создаёт цикл по `blocks`.

## Пожар задачи

`issue-fire.port.ts` / `resolve-fire.ts` — механизм возгорания задачи (например, при превышении SLA или критическом статусе) с трассой событий (`IssueFireTrailEntry`, лимит 10 записей через `appendFireTrail`).

```mermaid
sequenceDiagram
    participant E as Событие (issue_created / status_entered)
    participant RE as rule-engine.ts (runRules)
    participant RF as resolve-fire.ts (resolveFire)
    participant IR as issue-repository.port.ts
    participant UC as fire-issue.use-case.ts
    E->>RE: правила доски + событие
    RE->>RE: порядок по position, фильтр enabled
    loop для каждого события
        RE->>RE: triggerMatches -> evaluateConditions (has_label)
        RE->>RE: действия (assign_agent / set_status / notify_owner)
        set_status -> очередь status_entered (каскад, лимит 5)
    end
    RE-->>RF: EngineOutcome (assigns, notifications, finalStatusKey, stop)
    RF->>RF: явный assignee => override; hasOpenBlockers => agentId=null
    RF-->>UC: ResolvedFire
    UC->>IR: записать fireTrail (appendFireTrail, лимит 10)
    UC->>UC: запуск run (IssueFirePort.fire) при outcome fired
```

## Связанные разделы

- [07-слой-api-rest.md](./07-слой-api-rest.md)
- [08-слой-application-use-cases.md](./08-слой-application-use-cases.md)
- [11-база-данных-schema.md](./11-база-данных-schema.md) (таблицы issues, issueBoards, boardStatuses, boardRules, issueComments, issueLabels, issueDependencies, issueAttachments, issueExecutions)
- [14-потоки-threads.md](./14-потоки-threads.md) (пожар создаёт run в потоке)
- [20-источники-git.md](./20-источники-git.md) (sourceId, branch, worktree)
- [28-флот-узлы-fleet.md](./28-флот-узлы-fleet.md) (размещение run при пожаре)
