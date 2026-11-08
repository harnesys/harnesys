# 31. Секреты и хранилище (vault)

## Обзор

Система секретов (vault) предназначена для хранения чувствительных данных организации: ключи API, токены, пароли. Шифрование основано на мастер-ключе (AES-GCM). Организационные секреты и учётные данные интеграций разделяются: учётные данные интеграции вводятся на странице самой интеграции и хранятся в её собственной SQLite БД (`orgDataDir(orgId)/integrations/<id>/data.db`, см. `docs/INTEGRATION_ADDON_MODEL.md`).

## Домен (app/domain/secret/)

| Файл | Назначение |
|------|------------|
| `secret-store.port.ts` | порт хранилища секретов (`SecretStorePort`: `get`, `set`, `delete`, `listKeys`) |
| `secret.error.ts` | ошибки секретов (`SecretLockedException`, `SecretValueTooLargeException`, `VaultValidationException`, `VaultNotFoundException`, `VaultConflictException`) |
| `vault-keys.ts` | ключи хранилища (префиксы, валидация имён, системные ключи) |
| `provider-api-key.ts` | разрешение ключа API провайдера (`resolveProviderApiKey`) |

### SecretStorePort (secret-store.port.ts:1-9)

Методы: `get(orgId, key) → Promise<string | null>`, `set(orgId, key, value) → Promise<void>`, `delete(orgId, key) → Promise<void>`, `listKeys(orgId) → Promise<string[]>`.

### Ошибки (secret.error.ts)

- `SecretLockedException extends ForbiddenException` — хранилище заблокировано (неверный мастер-ключ или ошибка дешифрования).
- `SecretValueTooLargeException extends ValidationException` — значение превышает лимит.
- `VaultValidationException extends ValidationException` — ошибка валидации хранилища.
- `VaultNotFoundException extends EntityNotFoundException` — запись не найдена.
- `VaultConflictException extends ConflictException` — конфликт хранилища.

## Use-cases (application/vault/)

не проверено кодом — каталог `application/secret/` не содержит use-case-файлов. Управление секретами реализуется через контроллер и адаптер напрямую.

## Контроллер (app/api/rest/)

`vault.controller.ts` — не проверено кодом (точный путь и набор методов не найдены в объёме этого раздела).

## Адаптер (infra/secret/)

| Файл | Назначение |
|------|------------|
| `secret-store.adapter.ts` | `SecretStoreAdapter extends SecretStorePort` — AES-GCM шифрование в org-sqlite |
| `secret-store.adapter.spec.ts` | тесты адаптера (roundtrip, missing key, wrong master key, listKeys/delete) |
| `secret.module.ts` | DI-модуль: `providers: [{ provide: SecretStorePort, useClass: SecretStoreAdapter }]` |
| `master-key.ts` | мастер-ключ (`loadMasterKey`, `loadOrCreateMasterKey`, `masterKeyPath`) |

`SecretStoreAdapter` (@Injectable) конструктор принимает `HostFsLayoutPort` и `AppConfig` (`@Configuration`). Мастер-ключ лениво загружается через `requireKey()` при первом доступе. Каждая организация использует свою SQLite БД (`orgDbPath(orgId)`).

### Мастер-ключ (master-key.ts)

- `MasterKeyOptions`: `{ masterKey?: string }`.
- `masterKeyPath(home)` — путь `home/master.key`.
- `loadMasterKey(home, options)` — ключ берётся из конфигурации (`options.masterKey`, base64, 32 байта) или из файла `home/master.key`; неверная длина → `SecretLockedException` ('Invalid master key length'); файла нет → `null`.
- `loadOrCreateMasterKey(home, options)` — если ключа нет, создаёт случайные 32 байта (`crypto.getRandomValues`), записывает в `master.key` с правами `0o600`.

Мастер-ключ настраивается через конфигурацию (`harnesys.masterKey` / `HARNESYS_MASTER_KEY`, см. [12-конфигурация.md](./12-конфигурация.md)).

### Шифрование (secret-store.adapter.ts)

Алгоритм: **AES-GCM**, ключ 32 байта, IV 12 байт, тег 16 байт (tagLength 128), additionalData = ключ секрета (Buffer.from(key)).

`set`:
1. Проверить `Buffer.byteLength(value, 'utf8')` ≤ `MAX_SECRET_VALUE_BYTES` (64 KiB), иначе `SecretValueTooLargeException`.
2. Получить мастер-ключ, импортировать через `crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt','decrypt'])`.
3. Сгенерировать случайный IV 12 байт.
4. `crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(key), tagLength: 128 }, cryptoKey, value)`.
5. Разделить результат на ciphertext (все байты кроме последних 16) и tag (последние 16).
6. Сохранить в таблицу `secrets` (`key`, `ciphertext`, `iv`, `tag`, `keyVersion: 1`, `createdAt`, `updatedAt`).

`get`:
1. Получить строку по ключу из таблицы `secrets`.
2. `crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: Buffer.from(key) }, cryptoKey, ciphertext + tag)`.
3. При ошибке дешифрования → `SecretLockedException`.

`delete`, `listKeys` — операции с таблицей `secrets` без криптографии.

## Префиксы и имена секретов (vault-keys.ts)

| Константа | Значение | Назначение |
|-----------|----------|------------|
| `VAULT_SECRET_PREFIX` | `'secret:'` | организационные секреты |
| `VAULT_VAR_PREFIX` | `'var:'` | организационные переменные |
| `LEGACY_PROVIDER_SECRET_PREFIX` | `'llm_provider:'` | legacy ключи провайдеров LLM |
| `SYSTEM_CLOUD_PREFIX` | `'cloud:'` | системные облачные ключи |

- `isValidVaultName(name)` — `/^[A-Za-z][A-Za-z0-9_-]{0,63}$/` (1–64 символа, буква в начале).
- `vaultStorageKey(kind, name)` — `secret:` + имя для kind `secret`, `var:` + имя для kind `variable`.
- `parseVaultStorageKey(key)` — разбирает на `{kind, name}` или `null`.
- `parseVaultRef(value)` — то же, с `trim()`.
- `isSystemSecretKey(key)` — начинается с `cloud:` или `llm_provider:`.
- `legacyProviderSecretKey(providerId)` — `llm_provider:` + providerId.
- `secretRef(name)` — `secret:` + имя.
- `slugVaultName(raw, fallback)` — нормализация имени (очистка спецсимволов, префикс `p-`).

## Контракты (packages/contracts/src/vault.ts)

| Схема | Тип |
|-------|-----|
| `VaultEntryKindSchema` | `z.enum(['secret','variable'])` → `VaultEntryKind` |
| `VaultEntryNameSchema` | regex `^[A-Za-z][A-Za-z0-9_-]{0,63}$` |
| `VaultEntrySchema` | `name`, `kind`, `value?`, `updatedAt?` → `VaultEntry` |
| `VaultListResponseSchema` | `items: VaultEntry[]` → `VaultListResponse` |
| `PutVaultEntryBodySchema` | `kind`, `value` (min 1) → `PutVaultEntryBody` |

## Секреты интеграций

`infra/integrations/addon-secrets.ts` — не проверено кодом (файл не найден в объёме этого раздела). Каждая интеграция хранит свои секреты в своей SQLite БД (`orgDataDir(orgId)/integrations/<id>/data.db`). Учётные данные вводятся на странице интеграции.

### resolveProviderApiKey (provider-api-key.ts)

Логика разрешения ключа API провайдера:
1. Если `apiKeyColumn` — валидная vault-ссылка (`parseVaultRef` возвращает `{kind: 'secret'}`) → `secrets.get(orgId, vaultStorageKey('secret', ref.name))`.
2. Иначе проверить legacy секрет `llm_provider:<providerId>`.
3. Иначе, если `apiKeyColumn` не является vault-ссылкой — вернуть его как есть.
4. Иначе → `undefined`.

## Шифрование: схема AES-GCM

```mermaid
flowchart TD
  SK[set(orgId, key, value)] --> Len{len(value) ≤ 64 KiB?}
  Len -->|нет| SVTL[SecretValueTooLargeException]
  Len -->|да| MK[requireKey: мастер-ключ из конфига или master.key]
  MK --> IK[crypto.subtle.importKey raw AES-GCM]
  IK --> IV[crypto.getRandomValues 12 байт IV]
  IV --> ENC[crypto.subtle.encrypt AES-GCM, aad=key]
  ENC --> Split[разделить ciphertext (N-16) + tag (16)]
  Split --> Save[INSERT/UPDATE secrets: key, ciphertext, iv, tag, keyVersion=1]
  GK[get(orgId, key)] --> Row[SELECT ciphertext, iv, tag по ключу]
  Row --> |нет строки| Null[null]
  Row -->|есть| DK[crypto.subtle.importKey]
  DK --> DEC[crypto.subtle.decrypt AES-GCM, aad=key]
  DEC -->|ошибка| SL[SecretLockedException]
  DEC -->|успех| Plain[plaintext value]
```

## Связанные разделы

- [12-конфигурация.md](./12-конфигурация.md) (masterKey в конфиге)
- [22-интеграции-общая-модель.md](./22-интеграции-общая-модель.md) (секреты интеграций)
- [28-флот-узлы-fleet.md](./28-флот-узлы-fleet.md) (секреты флота через `fleet-secret-resolver.ts`)
- [36-провайдеры-моделей-llm.md](./36-провайдеры-моделей-llm.md) (legacy ключи провайдеров LLM)
- [39-безопасность.md](./39-безопасность.md)
- [11-база-данных-schema.md](./11-база-данных-schema.md) (secrets.schema.ts)
