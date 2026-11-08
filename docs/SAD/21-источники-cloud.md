# 21. Источники облака (Google Drive)

## Назначение

Облачные источники подключают облачные хранилища (в текущей реализации — Google Drive) как материализуемые источники данных. Домен: `apps/server/src/app/domain/source/`. Драйверы и зеркало: `apps/server/src/app/infra/source/drivers/cloud/`. Облачный источник всегда привязан к интеграции Google (`integrationId` в `SourceDistribution.cloud-drive`), через которую получается access-токен.

## Записи и контракты

**Контракты** `packages/contracts/src/source.ts`:
- `SourceDistribution` (`cloud-drive`): `backend: 'google'`, `remoteFolderId` (строка min 1, по умолчанию `'root'` при attach), `integrationId` (UUID).
- `AttachCloudDriveBody`: `name?`, `backend: 'google'` (default), `remoteFolderId?`, `integrationId` (обязателен), `hostId?`, `uiVisibility?`.
- `RefreshCloudDriveBody` (`hostId`).
- `MaterializationState`: `absent` | `materializing` | `ready` | `failed`.
- `MaterializationStateFrame`, `MaterializationProjection` (`sourceId`, `hostId`, `state`, `revision`, `lastConfirmedAt`, `lastErrorCode?`, `lastConflictPaths?`, `refreshRequired?`).
- `SourceHostStatus`: `hostId`, `nodeStatus` (`online` | `offline` | `draining`), `materialization`, `lastConfirmedAt?`, `errorCode?`, `stale`, `defaultWorktreeId?`, `lastConflictPaths`, `refreshRequired`, `availabilityReason?` (`origin` | `allowed` | `excluded` | `needs-remote`).
- `SourceHostNodeStatus`: `online` | `offline` | `draining`.

## Порты (`app/domain/source/`)

| Порт | Назначение |
|------|------------|
| `cloud-remote-backend.port.ts` | `CloudRemoteBackendPort` (`readonly vendor: CloudVendor`, `CloudVendor = 'google' | 'dropbox' | 'onedrive'`): `listChildren`, `download`, `upload`, `createFolder`, `delete`, `getMetadata`; `CloudDocumentExporter.exportDocument(fileId, mimeType)`; хелпер `supportsDocumentExport` |
| `cloud-sync-back-watch.port.ts` | `CloudSyncBackWatchPort`: `syncOrg(orgId)`, `stopOrg(orgId)` — наблюдение за изменениями облака |
| `source-driver.port.ts` | общий порт драйвера источника (`kind: 'git'`) |
| `source-location.port.ts` | resolución корня зеркала источника на хосте |
| `source-materialization.port.ts` | состояние и проекция материализации источника |

## Движок зеркала облака (`infra/source/drivers/cloud/`)

- `cloud-mirror-engine.ts` — зеркало между облачным хранилищем и локальным каталогом:
  - корень зеркала `<materializeRoot>/mirror`, метаданные в `.harnesys-mirror/` (`mode: 0o600`).
  - `MirrorMetaFile`: `remoteId`, `kind` (`file` | `folder`), `remoteModifiedAt?`, `mimeType?`, `localHash?` (sha256 содержимого).
  - `hydratePath`: скачивание файла (`backend.download`) или экспорт документа (`backend.exportDocument`, если поддерживает), запись мета, проверка симлинков (`assertSafeCloudPath` запрещает `/`, `\`, `\0`, `.`, `..`, `.harnesys-mirror`, `.git`).
  - `contentHash` (sha256 hex), `conflictLocalName` (`<name> (conflict, <stamp>)`).
- `cloud-mirror-scan.ts` — `scanCloudMirrorChanges(mirror)`: обход локального каталога (пропуск `.harnesys-mirror` и `.git`), сравнение хеша файлов с метаданными; формирует изменения `create` | `change` | `delete`; удалённые мета без локального файла → `delete`.
- `cloud-mirror-sync.ts` — обратная синхронизация изменений:
  - `syncBackFile`: отслеживаемый файл — проверка ревизии удалённого файла (`remote.modifiedAt` vs `meta.remoteModifiedAt`); при несовпадении — `preserveBothVersions` (локальный и удалённый сохраняются под разными именами); при совпадении — `updateRemoteFile` (`PATCH upload`, `fileId`); неизвестный файл — `uploadLocalFile` (создание).
  - `syncBackFolder`: создание папки в облаке, если мета отсутствует.
  - `syncDeletePath`: удаление удалённого файла/папки с проверкой ревизии и непустых папок (`CLOUD_FOLDER_NOT_EMPTY`, `CLOUD_REVISION_CHANGED`).
- `cloud-mirror-reconcile.ts` — примирение состояний зеркала.

## Обратная синхронизация (cloud sync back)

- `cloud-sync-back.ts` — `syncBackCloudFile` / `syncBackCloudPath` / `flushCloudMirror`: разрешение корня через `sourceLocation.resolve`, чтение файлов, пропуск экспортированных Google-документов (`mimeType` начинается с `application/vnd.google-apps.`), построение `GoogleDriveBackend` с провайдером токена.
- `cloud-sync-back-queue.ts` — очередь изменений (`PendingCloudChange`), обработка с коалесценцией путей (`coalescePaths`).
- `cloud-sync-back-state.ts` — `recordCloudSyncResult` / `recordCloudSyncFailure`: запись в `source-materialization` и событие через `materializationEvents`.
- `cloud-sync-back-tokens.ts` — `CloudSyncCredentialLease`, `leasedTokenReader`: временное хранение учётных данных в секретах организации на время синхронизации (`googleCredKey(integrationId)`), удаление после завершения.
- `cloud-sync-back-watcher.ts` — `@Injectable() CloudSyncBackWatcher extends CloudSyncBackWatchPort`:
  - `onModuleInit`: `syncOrg` для каждой организации.
  - `syncOrg`: список источников `cloud-drive`, `resolveAccessToken` через `IntegrationTokenPort.getAccessToken(orgId, integrationId)`.
  - `watchCloudSource`: наблюдатель `filesWatcher.watch(sourceId, mirrorRoot)` — каждая локальная операция попадает в очередь (`create`/`change`/`delete`); при старте или `reconcile` — полное сканирование `scanCloudMirrorChanges`.
  - `processQueuedChange`: захват `SourceWriteLeasePort` (TTL 60_000 мс), временная учетная запись, `syncBackCloudPath`, release аренды и секрета.
  - `stopOrg` / `onModuleDestroy`: остановка наблюдателей по организации.
- `cloud-sync-back.module.ts` — регистрация модуля.
- `cloud-sync-back-watcher.spec.ts`, `cloud-mirror-engine.spec.ts` — тесты.

## Бэкенд Google Drive

- `google-drive.backend.ts` — `class GoogleDriveBackend extends CloudRemoteBackendPort implements CloudDocumentExporter`, `vendor = 'google'`:
  - `DRIVE_API = 'https://www.googleapis.com/drive/v3'`, `UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'`.
  - `listChildren(folderId)`: запрос `files` с `q = '<folderId> in parents and trashed = false'`, постранично (`nextPageToken`, `pageSize 1000`).
  - `download(fileId)`: `alt=media`.
  - `upload`: создание (`multipart/related`) или обновление (`PATCH`, `fileId`, `uploadType=media`).
  - `createFolder`: `mimeType = 'application/vnd.google-apps.folder'`.
  - `delete`: `DELETE`, игнор 404.
  - `getMetadata`, `driveJson` (Bearer токен).
  - `GOOGLE_APPS_EXPORTS`: Document → DOCX (`docx`), Spreadsheet → XLSX (`xlsx`), Presentation/Drawing → PDF.

## Use-cases (`application/source/`)

`attach-cloud-drive.use-case.ts`, `prepare-cloud-source.use-case.ts`, `refresh-cloud-drive.use-case.ts`, `materialize-cloud-source.ts`, `mark-cloud-siblings-refresh.ts`, `browse-host-dirs.use-case.ts`, `create-host-dir.use-case.ts`, `ensure-workspace.use-case.ts`.

## Поток данных зеркала облака

```mermaid
graph TD
    C[Клиент: attach-cloud-drive / refresh-cloud-drive] --> UC[attach-cloud-drive.use-case / refresh-cloud-drive.use-case]
    UC --> SRP[source-registry: источник cloud-drive + integrationId]
    UC --> ITP[integration-token.port: getAccessToken(orgId, integrationId)]
    UC --> CME[cloud-mirror-engine: hydratePath download/export]
    CME --> SMP[source-materialization.port: upsertProjection applied|ignored|idempotent]
    CSW[cloud-sync-back-watcher: filesWatcher на miroir] --> CSQ[cloud-sync-back-queue]
    CSQ --> CSB[cloud-sync-back: syncBackCloudPath write-lease 60с]
    CSB --> GDB[google-drive.backend: Drive API upload/update/delete]
    CSB --> SMP
    UC --> C
```

## Связанные разделы

- [19-источники-и-материализация.md](./19-источники-и-материализация.md)
- [25-интеграция-google.md](./25-интеграция-google.md) (отдельная интеграция Google API, не путать с источником Google Drive)
- [22-интеграции-общая-модель.md](./22-интеграции-общая-модель.md) (собственная SQLite интеграции)
- [27-файловый-доступ-и-политики.md](./27-файловый-доступ-и-политики.md)
