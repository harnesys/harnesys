Проверил `main...HEAD` (5 коммитов, 288 файлов). Ниже места, где поведение main потеряно или сломано — только пометки, ничего не трогал.

**Высокий приоритет**

- `apps/webui/src/shared/api/threads.ts:339` → `DELETE /threads/:id/runs/:runId/events/:seq`, а сервер этот маршрут удалил (`threads.controller.ts:196` теперь `DELETE /threads/:id/events/:threadSeq`). Клиент вообще не имеет `threadSeq` (grep по `apps/webui` — 0 совпадений), поэтому удаление/редактирование/retry сообщения и скрытие error-событий (`delete-turn.ts:11,23`) дают 404 — регрессия и для обычных чатов.
- `respond-run.use-case.ts:88,118`, `approvals/decide-approval.use-case.ts:190`, `approval-resume-sweep.ts:150` — `sessionFor(orgId, threadId)` без `agentId`; `org-runtime.ts:186` подставляет первого участника (`soleAgentIdOf`). В группе ответ на `ask`/approval уходит не тому агенту, run висит в `needs_input`. Там же `respond-run.use-case.ts:71`: `rec.agentId ?? ''` — правила «always allow» пишутся для агента `''`.
- `remove-thread-agent.use-case.ts:33-42` — сначала `threadAgents.remove`, потом проверка «у chat-треда ровно один агент» и throw: API отдаёт 400, но chat-тред остаётся с 0 участников, после чего любой send падает `thread has no agent` (`send-thread-run.use-case.ts:108`).

**Средний приоритет**

- `create-thread.use-case.ts:49-71` — thread + members пишутся до `ensureParticipants`; невалидный `participantUserIds` оставляет пустой осиротевший тред (и кидает `ThreadNotFoundException` на user id).
- `packages/contracts/src/thread.ts:78-84`, `packages/studio-shared/src/thread.ts:48-56` — из `ThreadSummary` убраны `originAgentId`/`agentName`, `agentId` ослаблен с uuid до строки (`''` при пустых members). Внешние потребители ответа падают молча, а `threadsForAgent` (`thread.ts:105`) такой тред просто скрывает.
- `delete-agent.use-case.ts:31-60` — не-групповые треды удаляются пачкой, групповой остаётся; если агент был последним участником, группа остаётся с 0 агентов (unrunnable).
- `apps/webui/src/features/send-message/model/send-message.ts:64-71` — `status: 'ignored'` (дубль `clientEventId` или группа без адресата) показывается как «No agent addressed», оптимистичный пузырь остаётся.
- `sqlite-run-events.adapter.ts:211` — `removeEvent(existing.threadSeq === undefined ? '' : '', …)`: обе ветки `''`, а `removeEvent` фильтрует по `threadId` → `removeUserEvent` всегда `false`. Сейчас вызывается только из спеков, но путь мёртв.

**Низкий / для сведения**

- `widgets/project-sidebar/ui/agents-section.tsx:46` — авто-раскрытие секции только по `agentId`/`originAgentId`, т.е. группа раскрывается лишь у primary-агента (список тредов при этом верный, через members).
- Удалён `docs/plans/2026-11-01-terminal-v2.md` — код terminal v2 на месте, потерян только план.

**Проверено и чисто:** переписанный `packages/harnesys/src/ports/session-events.ts` не потерял ни одного типа/поля события (сравнил программно), `threadSeq`-семантика транкейта/удаления сквозная (все WHERE с `threadId`), `runs.agent_id/agent_name` заполняются на всех путях создания run.
