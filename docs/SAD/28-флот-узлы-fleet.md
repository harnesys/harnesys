# 28. Флот узлов (fleet)

## Обзор

Флот — парка удалённых узлов (nodes), выполняющих задачи от имени организации. Узел регистрируется по приглашению (enroll), опционально проходит promote (повышение до relais/worker), отправляет heartbeat, имеет токен и может забирать run на выполнение через команду `RUN_PLACE`.

## Домен (`app/domain/fleet/`)

| Файл | Назначение |
|------|------------|
| `fleet.error.ts` | ошибки флота |
| `event-claim.port.ts` | претензия на событие |
| `expired-claim-reaping.spec.ts`, `expired-claim-reaping.ts` | сбор истёкших претензий |
| `fleet-content-proxy.port.ts` | прокси контента флота |
| `fleet-events.port.ts` | события флота (`FleetEventsPort`, `subscribe`/`emit`) |
| `fleet-hub.port.ts` | хаб флота (`FleetHubPort`, присутствие, пиры, прокси, команды) |
| `invite-repository.port.ts` | репозиторий приглашений (`InviteRecord`: `id`, `nodeName`, `expiresAt`, `usedAt?`, `createdAt`) |
| `node-command-queue.port.ts` | очередь команд узла |
| `node-config-sync.spec.ts`, `node-config-sync.ts` | синхронизация конфигурации узла |
| `node-identity-store.port.ts` | хранилище идентичности узла |
| `node-repository.port.ts` | репозиторий узлов (`NodeRecord` с `role: 'relay' | 'worker'`, `status: NodeStatus`, `tokenHash`, `lastSeenAt`, `diskFreeBytes`, `dockerAvailable`) |
| `node-snapshot-ack.port.ts` | подтверждение снимка узла |
| `org-audit.port.ts` | аудит организации |
| `org-config-revision.port.ts` | ревизия конфигурации организации |
| `org-execution-replica.port.ts` | реплика выполнения организации |
| `org-execution-snapshot.apply.spec.ts`, `org-execution-snapshot.apply.ts` | применение снимка выполнения организации |
| `pending-placement.port.ts`, `pending-placement.spec.ts`, `pending-placement.ts` | ожидающее размещение (`PendingPlacement`, `PlacementTriggerKind`, `effectivePriority`, `decidePendingReconcile`) |
| `pending-run-event.ack.spec.ts`, `pending-run-event.ack.ts`, `pending-run-event.port.ts` | подтверждение события выполнения |
| `placement.spec.ts`, `placement.ts` | размещение (`decidePlacement`, `PlacementResult`, `RunIsolation`) |
| `promote-session.port.ts` | сессия повышения (`PromoteSession`: `token`, `orgId`, `targetNodeId`, `newRelayUrl`, `sourceNodeId`, `sourceNodeName`, `sourceToken`, `expiresAt`; `PromoteSessionStore`: `create`/`get`/`consume`) |
| `source-write-lease.port.ts` | аренда записи источника |
| `work-claim.constants.ts` | константы претензии на работу |
| `worker-command.spec.ts`, `worker-command.ts` | команда работника (`WorkerCommand`: `RUN_PLACE`, `WORK_CANCEL`, `WORK_ASK_RESUME`, `APPROVAL_RESUME`, `NODE_DRAIN`, `NODE_RESUME`, `NODE_REMOVED`, `ORG_DELETED`, `SOURCE_MATERIALIZE`, `SOURCE_ATTACH`, `SOURCE_REFRESH`, `SOURCE_WORKTREE_CREATE`, `SOURCE_WORKTREE_REMOVE`, `HTTP_PROXY`) |
| `worker-org-operation-receipt.port.ts`, `worker-org-operation-receipt.spec.ts` | квитанция операции организации работника |

Константы (`packages/contracts/src/fleet.ts`): `INVITE_CODE_ALPHABET` = `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, `INVITE_CODE_LENGTH` = 8, `INVITE_TTL_MIN_DEFAULT` = 15 мин, `INVITE_TTL_MIN_MAX` = 1440 мин, `PRESENCE_OFFLINE_AFTER_MS` = 90_000 мс.

## Use-cases (`application/fleet/`)

`fleet.use-case.module.ts` регистрирует: `IssueInviteUseCase`, `ListInvitesUseCase`, `RevokeInviteUseCase`, `EnrollOnRelayUseCase`, `PairWithRelayUseCase`, `HeartbeatUseCase`, `ListFleetNodesUseCase`, `GetActiveHostUseCase`, `ConnectInfoUseCase`, `RetargetUseCase`, `PromoteRelayUseCase`, `ResolveFleetSecretsUseCase`, `IssueCloudSourceSyncGrantUseCase`, `ReleaseCloudSourceSyncGrantUseCase`, `ClaimWorkUseCase`, `IngestRunEventUseCase`, `IssueRemoteRunUseCase`, `IssueWaitingRunUseCase`, `PlacePendingRunUseCase`, `ReschedulePlacementQueueUseCase`, `ListPlacementQueueUseCase`, `PlacementQueueWatcher`, `OrgSnapshotPushWatcher`, `ExpiredClaimReaper`, `ReapExpiredRunClaimsUseCase`, `BuildOrgExecutionSnapshotUseCase`, `FetchRunAttachmentUseCase`, `DisconnectFleetNodeUseCase`, `RemoveFleetNodeUseCase`, `RotateNodeTokenUseCase`.

## Контроллеры (`app/api/rest/`)

`fleet.controller.ts`, `fleet-nodes.controller.ts`, `fleet-cloud.controller.ts`, `placement-queue.controller.ts`.

## Адаптеры (`infra/fleet-hub/`)

| Файл | Назначение |
|------|------------|
| `fleet-hub.adapter.ts`, `fleet-hub.module.ts` | хаб флота (`FleetHubAdapter`, sweep offline каждые 30_000 мс, пиры, прокси, broadcast) |
| `fleet-events.adapter.ts`, `fleet-events.adapter.spec.ts` | события флота |
| `fleet-content-proxy.adapter.ts` | прокси контента |
| `fleet-secret-resolver.ts` | резолвер секретов флота |
| `fleet-worker.module.ts`, `fleet-worker.source-frames.ts` | модуль и кадры работника |
| `fleet-worker.ws.ts` | WebSocket работника (`registerFleetWorkerWs` на `/api/fleet/worker`) |
| `placed-run-record.ts` | запись размещённого run |
| `promote-session.adapter.ts` | сессия promote |
| `proxy-requests.ts` | отслеживание HTTP-прокси запросов |
| `reject-placed-run.ts` | отказ размещённого run |
| `relay-issue-tracker.port.ts` | порт трекера relais |
| `snapshot-registry.ts` | реестр снимков |
| `work-executor.claimer.ts`, `work-executor.compose.ts`, `work-executor.fixtures.ts`, `work-executor.forwarder.ts`, `work-executor.process.ts`, `work-executor.resume.ts`, `work-executor.ts`, `work-executor.util.ts` | исполнитель работ (`executePlacedRun`, `resolvePlacedSecrets`, стек размещённого run) |
| `worker-cloud-sync-watch.spec.ts`, `worker-cloud-sync-watch.ts`, `worker-cloud-sync.ts` | обратная синхронизация работника |
| `worker-dialer.adapter.ts` + `*.cloud-materialize.ts`, `*.commands.ts`, `*.guards.ts`, `*.materialize.ts`, `*.place-run.ts`, `*.session.ts`, `*.sync.ts`, `*.util.ts`, `*.worktree.ts` | коммутатор работника (WebSocket dialer, heartbeat, reconnect, команды) |
| `worker-work-executor.ts` | исполнитель работ работника |

## Организационный уровень (`infra/org-sqlite/`)

Адаптеры флота: `event-claim.adapter.ts`, `node-command-queue.adapter.ts`, `node-repository.adapter.ts`, `node-snapshot-ack.adapter.ts`, `org-audit.adapter.ts`, `org-config-revision.adapter.ts`, `org-execution-replica.adapter.ts`, `pending-placement.adapter.ts`, `pending-run-event.adapter.ts`, `worker-org-operation-receipt.adapter.ts`, `invite-repository.adapter.ts`, `issue-execution.adapter.ts`, `manager-tail.adapter.ts`, `hook-run.store.ts`, `repository-worktree.adapter.ts`, `source-write-lease.adapter.ts`, `run-attribution.ts`.

## Контракты (`packages/contracts/src/fleet.ts`)

`FleetNode`, `FleetNodesResponse`, `NodeStatus` (`online` | `offline` | `draining`), `OrgNodeIdentity`, `ConnectInfo`, `EnrollBody`, `EnrollResponse`, `IssuedInvite`, `ActiveInvite`, `PairBody`, `PairResponse`, `PromoteStartBody`, `PromoteStartResponse`, `PromoteAcceptBody`, `PromoteAcceptResponse`, `PromoteCompleteBody`, `PromoteCompleteResponse`, `PromoteIdentitySliceResponse`, `HeartbeatBody`, `HeartbeatResponse`, `NodeConfigSync` (`ready`|`syncing`|`stale`|`incompatible`|`unknown`), `ProxyRequest`, `RetargetBody`, `RotateNodeTokenResponse`, `INVITE_CODE_ALPHABET`, `INVITE_CODE_LENGTH`, `INVITE_TTL_MIN_DEFAULT`, `INVITE_TTL_MIN_MAX`, `PRESENCE_OFFLINE_AFTER_MS`.

## Поток работы узла

```mermaid
sequenceDiagram
    participant Admin as Администратор
    participant API as REST API
    participant Hub as FleetHubAdapter
    participant Node as Узел (worker-dialer WS)
    Admin->>API: issue-invite (ttl 1..1440 мин, код 8 символов)
    API->>Hub: InviteRepository.insert
    Admin->>Node: enroll по коду (EnrollBody)
    Node->>Hub: WS CONNECT (orgId, nodeId, token)
    Hub->>Hub: attachPeer, notePing (online), CONNECTED со снимком
    loop heartbeat
        Node->>Hub: heartbeat / ping
        Hub->>Hub: notePing; sweepOffline каждые 30 с → offline если нет присутствия > 90 с
    end
    API->>Hub: place-pending-run (PendingPlacement, триггер chat|issue|schedule|webhook|connector)
    Node->>Hub: claim-work (RUN_PLACE)
    Hub->>Node: WorkerCommand RUN_PLACE (TaskEnvelope)
    Node->>Node: executePlacedRun (work-executor, стек run, навыки, модели)
    Node->>Hub: RUN_EVENT (ingest run event)
    Hub->>API: run event сохранён
```

Пошагово:
1. `issue-invite.use-case.ts` — создание приглашения (организация должна иметь роль `relay`, `ttlMin` 1..1440, default 15, rate-limit, код из `INVITE_CODE_ALPHABET` длиной `INVITE_CODE_LENGTH`). `relay-url-hint.ts` подставляет адрес релея.
2. `enroll-on-relay.use-case.ts` / `pair-with-relay.use-case.ts` — регистрация узла по коду (`EnrollBody` → `EnrollResponse` с `nodeId`, `token`, `ticketKey`, `orgId`). Токен хешируется `hash-node-token.ts`.
3. `heartbeat.use-case.ts` — узел отправляет `HeartbeatBody`, `FleetHubAdapter.notePing` ставит статус `online` (или `draining`), обновляет `lastSeenAt`, диск и Docker-доступность.
4. `place-pending-run.use-case.ts` — организация создаёт `PendingPlacement` с триггером (`PlacementTriggerKind`: `chat`, `issue`, `schedule`, `webhook`, `connector`), приоритетом и сроком жизни.
5. `claim-work.use-case.ts` — узел забирает run; `decidePlacement` (`placement.ts`) ранжирует узлы по `activeClaims`, затем `nodeId`, исключая `offline`/`draining`/`source-not-ready`/`docker_missing`/`not-in-profile`.
6. `executePlacedRun` (`work-executor.ts`) — создаёт стек размещённого run, разрешает секреты через `fleet-secret-resolver.ts` (релей), подготавливает рабочую цель, запускает сессию runtime, forwarder событий.
7. Узел шлёт `RUN_EVENT` через `fleet-worker.ws.ts` (`/api/fleet/worker`), `ingest-run-event.use-case.ts` принимает события и присылает `RUN_EVENT_ACK`.
8. `retarget.use-case.ts` — перенацеливание узла на другую организацию (`RetargetBody`). `remove-fleet-node.use-case.ts` — удаление узла. `rotate-node-token.use-case.ts` — ротация токена.

`NodeStatus` определяется `FleetHubAdapter.resolveStatus`: релей всегда `online`; `online`/`draining` становятся `offline` при отсутствии присутствия дольше `PRESENCE_OFFLINE_AFTER_MS` (90_000 мс). `sweepOffline` запускается `setInterval` каждые `SWEEP_INTERVAL_MS = 30_000` мс.

## Связанные разделы

- [15-выполнение-run-engine.md](./15-выполнение-run-engine.md) (выполнение run)
- [29-планировщик-schedules.md](./29-планировщик-schedules.md) (размещение по расписанию)
- [31-секреты-и-хранилище-vault.md](./31-секреты-и-хранилище-vault.md) (секреты флота через резолвер)
- [45-cli-инструмент.md](./45-cli-инструмент.md) (`host-enroll.ts`, `host-promote.ts`, `host-retarget.ts`)
- [11-база-данных-schema.md](./11-база-данных-schema.md) (таблицы nodeCommands, pendingPlacements, pendingRunEvents, workerOrgOperationReceipts, orgConfigRevisions, orgExecutionReplica, nodeSnapshotAcks)
