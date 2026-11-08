# 20. Источники Git

## Назначение

Git-источник подключает удалённые и локальные Git-репозитории как материализуемые источники данных для агентов и рантайма. Домен: `apps/server/src/app/domain/source/`. Драйвер: `apps/server/src/app/infra/source/drivers/git/`. Все git-операции выполняются через бинарный `git` (`Bun.spawn`) с `GIT_TERMINAL_PROMPT=0`, чтобы не интерактивно запрашивать учётные данные. Секреты в URL git подавляются (`sanitizeGitText`).

## Записи и контракты

**Контракты** `packages/contracts/src/source.ts`:
- `SourceDistribution`: `host-bound` с `hostId` (UUID) либо `cloud-drive` с `backend: 'google'`, `remoteFolderId`, `integrationId` (UUID).
- `SourceVcs`: `engine: 'git'`, `remoteUrl?` (строка), `credRef?`, `defaultBranch?`, `integrationId?` (UUID).
- `SourceAvailability`: `hostIds: string[]` (UUID).
- `Source`: `id`, `orgId`, `name`, `description?`, `distribution`, `uiVisibility`, `managed`, `vcs?` (null), `availability`, `createdAt`, `updatedAt`.
- `MaterializationState`: `absent` | `materializing` | `ready` | `failed`.
- `MaterializationOrigin`: `managed` | `attached`.
- `MaterializationRevisionDecision`: `applied` | `ignored` | `idempotent` (`source-materialization.port.ts:43`).
- `AttachGitBody`: XOR — либо `url`, либо пара `integrationId` + `repo`. `repo` обязан совпадать с `owner/name` (`/^[\w.-]+\/[\w.-]+$/`). При `integrationId` поле `credRef` запрещено. Опционально `branch`, `credRef`, `hostId`, `name`, `uiVisibility`.
- `InitGitBody` (`hostId`), `SwitchGitBranchBody` (`hostId`, `worktreeId`, `branch`), `DeleteGitBranchBody` (`hostId`, `branch` max 200), `GitHostQuery` (`hostId`), `GitHostWorktreeQuery` (`hostId`, `worktreeId`).
- `PrepareGitSourceBody` (`hostId`), `RefreshGitSourceBody` (`hostId`, `worktreeId?`).
- `PrepareGitSourceResponse`: `sourceId`, `hostId`, `operationId` (UUID), `state`, `worktreeId?`.
- `RepositoryWorktreeState`: `creating` | `ready` | `failed` | `removing`.
- `RepositoryWorktree`: `id`, `orgId`, `sourceId`, `hostId`, `branch`, `baseCommit?`, `state`, `activeRunId?`, `operationId` (UUID), `issueId?`, `dirty?`, `unpushed?`, `lastErrorCode?`, `createdAt`, `updatedAt`.

**`SourceRecord`** (`source-registry.port.ts:8`): добавляет `lspJson: string | null` к полям `Source`.

## Порты (`app/domain/source/`)

| Порт | Назначение |
|------|------------|
| `source-driver.port.ts` | `SourceDriverPort` (`readonly kind: 'git'`): `ensureMaterialized`, `configureCredentialHelper`, `resolveContentRoot`, `refresh`, `switchBranch`, `createBranch`, `listLocalBranches?`, `createStandaloneWorktree`, `removeStandaloneWorktree`, `deleteLocalBranch`, `listCheckedOutBranches`, `observeWorktree` |
| `git-vcs.port.ts` | `GitVcsPort`: `probe`, `getStatus`, `getFileStatus`, `getDiff`, `listBranches`, `checkout`, `createBranch`, `validateBranchName`, `stage`, `commit`, `push`, `pull`, `init`, `setRemote` |
| `repository-worktree.port.ts` | `RepositoryWorktreePort`: `findById`, `findByOperationId`, `findActiveByBranch`, `listCreating`, `listForSource`, `listForHost`, `listForIssue`, `upsert`, `setState`, `setActiveRunId`, `clearActiveRun`, `remove` |
| `source-materialization.port.ts` | материализация: `find`, `listForSource`, `upsert`, `removeForSource`, `findProjection`, `listProjectionsForSource`, `upsertProjection` (решение `applied` | `ignored` | `idempotent` через `decideMaterializationRevision`) |
| `source-registry.port.ts` | реестр: `list`, `findById`, `findBySourceId`, `findManagedWorkspace`, `insert`, `updateVisibility/Name/Distribution/Vcs/Availability/LspJson`, `remove` |
| `source-location.port.ts` | `SourceLocationPort.resolve({orgId, sourceId, hostId, worktreeId?})` → `{sourceId, hostId, absoluteRoot}` |
| `source-operation-grant.port.ts` | `SourceOperationGrantPort`: `create` / `consume` гранта операции (`operationId`, `orgId`, `nodeId`, `sourceId`, `credRef`, `expiresAt`, `consumedAt?`) |
| `source-watch-gate.port.ts` | `SourceWatchGatePort.acquire(orgId)` → release-функция |
| `git-repository-layout.ts` | `GitRepositoryLayout` (`bareRepoPath`, `worktreesRoot`); `gitWorktreePath` валидирует id worktree (запрет `..`, `/`, `\`, `\0`, пусто) |

`SourceDriverPort` обеспечивает `EnsureMaterializedResult` (`activeBranch`, `contentRoot`, `layout`) и `SwitchBranchResult` (`activeBranch`, `contentRoot`).

## Драйвер Git (`infra/source/drivers/git/`)

- `git.driver.ts` — `@Injectable() class GitDriver extends SourceDriverPort`, `kind = 'git'`, делегирует все операции `git-engine.ts` и `git-standalone-worktree.ts`.
- `git-engine.ts` — высокоуровневые операции:
  - `ensureMaterialized`: если bare-репозитория нет — `git clone --bare <url>`; если есть но битого (`HEAD` + `objects` отсутствуют) — пересоздаёт; гарантирует worktree через `ensureWorktree` (`git worktree add <branch>` или `git worktree add -b <branch> origin/<branch>`); определяет ветку по умолчанию (`symbolic-ref HEAD`, иначе `main`/`master`/`branches[0]`); возвращает `activeBranch`, `contentRoot`.
  - `refreshWorktree`: `git fetch origin --prune` + `git merge --ff-only refs/remotes/origin/<branch>`; ошибка на расхождениях (требует ручного разрешения).
  - `switchWorktreeBranch`: запрет переключения при грязном worktree (`git status --porcelain` не пуст).
  - `createWorktreeBranch`: `git check-ref-format --branch`, проверка занятости, `git branch` или `git worktree add -b`.
  - `applyCredentialHelper`: для `https://` remote настраивает `credential.<host>.helper` через `curl` на credential URL; логин/пароль из URL вычищаются.
  - `runGit`: `Bun.spawn(['git', ...args])`, сбор stdout/stderr/exit, ошибка `GitOperationException`.
- `git-standalone-worktree.ts` — автономный (standalone) worktree для изолированной работы:
  - `createStandaloneWorktree`: `git worktree add` или `git worktree add -b`, защита от повторногоチェкаута одной ветки, возврат `contentRoot`, `branch`, `baseCommit` (`rev-parse HEAD`).
  - `removeStandaloneWorktree`: отказ при uncommitted changes или unpushed commits (`rev-list --left-right --count @{upstream}...HEAD`); `git worktree remove` + `git worktree prune`.
  - `deleteLocalBranch`: `git branch -D`, запрет удаления активной и чекаученной ветки.
  - `listCheckedOutBranches`: парсинг `git worktree list --porcelain`.
  - `observeWorktreeGit`: `dirty`, `unpushed`, `branch`, `head`.
- `vcs/git-cli.adapter.ts` — адаптер `GitVcsPort` (вызовы `git`).
- `vcs/git-exec.ts` — выполнение команд git.
- `vcs/git-diff.ts` — вычисление различий.
- `vcs/git-status.ts` — статус репозитория.
- `vcs/git-helpers.ts` — вспомогательные функции.

## Use-cases (`application/source/`)

`attach-git.use-case.ts`, `init-git.use-case.ts`, `set-git-remote.use-case.ts`, `switch-git-branch.use-case.ts`, `delete-git-branch.use-case.ts`, `prepare-git-source.use-case.ts`, `refresh-git-source.use-case.ts`, `refresh-all-source-vcs.use-case.ts`, `refresh-source-vcs.use-case.ts`, `checkout-git.use-case.ts`, `commit-git.use-case.ts`, `create-git-branch.use-case.ts`, `pull-git.use-case.ts`, `push-git.use-case.ts`, `stage-git.use-case.ts`, `get-git-diff.use-case.ts`, `get-git-file-status.use-case.ts`, `get-git-status.use-case.ts`, `get-org-git-summary.use-case.ts`, `create-repository-worktree.use-case.ts`, `delete-repository-worktree.use-case.ts`, `list-repository-worktrees.use-case.ts`, `list-git-branches.use-case.ts`, `get-source-location.use-case.ts`, `set-source-availability.use-case.ts`, `set-source-visibility.use-case.ts`, `rename-source.use-case.ts`, `detach-source.use-case.ts`, `list-sources.use-case.ts`, `get-source.use-case.ts`.

Вспомогательные: `git-worktree-resolver.ts`, `resolve-git-worktree.ts`, `git-summary.util.ts`, `map-git-vcs-error.ts`, `git-credential-url.ts`, `to-public-source.ts`, `to-public-worktree.ts`.

## Адаптеры (`infra/source/`)

`source-registry.adapter.ts`, `source-materialization.adapter.ts`, `git-watch-events.adapter.ts`, `source-watch-events.adapter.ts`, `materialization-events.adapter.ts`, `source-location.adapter.ts`, `source-watch.module.ts`, `source.module.ts`.

## Поток данных подготовки Git-источника

```mermaid
graph TD
    C[Клиент: prepare-git-source / attach-git] --> UC[prepare-git-source.use-case.ts / attach-git.use-case.ts]
    UC --> SRP[source-registry.port.ts: insert / findById]
    UC --> SDP[source-driver.port.ts: ensureMaterialized]
    SDP --> GE[git-engine.ts: clone bare -> ensureWorktree -> detectDefaultBranch]
    GE --> GCA[git-cli.adapter / Bun.spawn git]
    GE --> WT[repository-worktree.port.ts: upsert worktree state creating|ready|failed]
    UC --> SMP[source-materialization.port.ts: upsertProjection, решение applied|ignored|idempotent]
    WT --> C
```

## Связанные разделы

- [19-источники-и-материализация.md](./19-источники-и-материализация.md)
- [21-источники-cloud.md](./21-источники-cloud.md)
- [27-файловый-доступ-и-политики.md](./27-файловый-доступ-и-политики.md) (path jail для worktree)
