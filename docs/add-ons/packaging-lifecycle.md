# Упаковка и жизненный цикл

Путь пакета: источник → каталог хоста → закрепление в организациях → экземпляры → обновление/откат/удаление. Всюду действует fail-closed: битый манифест, дрейф digest, неизвестный platform — отказ, не деградация.

## Формат пакета

```
addon.json                 # манифест (ключи = тип AddonManifest)
dist/index.js              # самодостаточный бандл — runtime.entry
migrations/NNNN_name.sql   # если заявлено data.migrations
l10n/<locale>.json         # %key%-плейсхолдеры
content/...                # файлы вклада content (скиллы с SKILL.md, промпты)
assets/...                 # иконка
```

Хост **не запускает скрипты установки** (никаких `postinstall`) и не ставит зависимостей: бандл собирает автор (`bun build --target=bun src/index.ts --outfile dist/index.js`), установка — копирование проверенных файлов. Digest и staging читают только runtime payload — манифест, бандл, заявленные миграции и `l10n/content/assets` (`packageFiles` в `addon-digest.ts`): `node_modules` и dev-файлы плану не мешают, symlink'и (workspace-линки) обход просто пропускает.

Формат поставки сейчас — каталог; `.hxa` (zip) предусмотрен планом, инструментарий `hxa build/pack` — [перспектива](roadmap.md).

## Источники и доверие

| `trust` | Источник | Исполнение | `experimental.*` | Подпись |
|---|---|---|---|---|
| `builtin` | каталог `add-ons/` монорепо | installed by definition; `trusted` может идти in-process | можно | не нужна |
| `local` | домашний каталог `~/.harnesys/add-ons/`, ручной placement, путь-установка | по launch-политике | можно | не нужна |
| `external` | url/реестр | только `restricted` | запрещено | обязательна; **источник выключен** до верификатора |

Доверие назначает источник, не манифест. `runtime.profile` выбирает механику: `trusted` — процесс с очищенным окружением (граница = отказоустойчивость) или in-process; `restricted` — OS-песочница (`sandbox-exec` с seatbelt-профилем на macOS, `bwrap` на Linux): запись — только каталог данных и tmp (файловая система смонтирована read-only), сеть и IPC закрыты (`deny network*` / `--unshare-net`), exec разрешён хостовому интерпретатору и каталогу пакета, env — белый список. Если у ОС нет механизма, external-пакет не стартует, пока политикой не включён `allowUnsandboxedExternal` (предупреждение в UI + аудит `addon.sandbox.unsandboxed_external`).

## Каталог хоста

```
~/.harnesys/add-ons/
  <id>/<version>/           # несколько версий одного id лежат рядом (нужно для закрепления по организациям)
  addons.lock.json          # entries: { id, version, digest, source, trust, installedAt }
  .staging/<planId>/        # временное хранилище планов
~/.harnesys/addons-policy.json
```

`digest` — sha256 по сортированным путям и содержимому файлов пакета: идентичность точных байт версии. Lock атомарен (tmp+rename), повтор confirm идемпотентен по `digest/source/trust`.

**Установка пакетом**: `POST /api/addons/packages/plan { source }` (загрузка в staging → digest → валидация манифеста → план с манифестом, правами, trust, warnings; код не исполняется) → `POST /api/addons/packages/plan/:planId/confirm` (перемещение + lock). Bare-name источник берётся из монорепо `add-ons/` (trust `builtin`), путь-источник — из локального staging (нужен `local-dir` в `allowedSources` политики), url/реестр отсекаются на plan.

**Раскладка руками / builtin-скан**: положите `<id>/<version>/` в домашний каталог (или каталог монорепо `add-ons/<source>/`) и нажмите **Reload** — `POST /api/addons/packages/rescan` сканирует домашний каталог и регистрирует валидные манифесты, отсутствующие в lock; монорепо-builtin в lock не нужен — он в каталоге by definition, а его скан-кэш инвалидируется тем же rescan. Результаты builtin-скана кэшируются на бут.

**Удаление версии пакета**: `DELETE /api/addons/packages/:id/:version` — `409 in_use`, пока хоть одна организация держит закрепление; `POST /api/addons/packages/prune` чистит неиспользуемые.

## Жизненный цикл в организации

| Действие | Эндпоинт | Что происходит |
|---|---|---|
| Enable | `POST orgs/:orgId/addons/:id/enable { grants }` | совместимость → consent (нужны обязательные гранты) → закрепление версии → миграции данных → `ContributionRegistry.activate` (all-or-nothing) → публикация событий |
| Disable | `POST .../disable` | останов экземпляра, `deactivate` регистраций в обратном порядке; закрепление и данные остаются |
| Update | `POST .../update { version, grants? }` | compat → grant diff (новые обязательные → consent) → штатная остановка → миграции (с бэкапом) → атомарный `swap` регистраций → смена закрепления → рестарт; при любом сбое — автоматический откат pin и восстановление копии данных |
| Rollback | `POST .../rollback { version }` | закрепление установленной прежней версии (защита схемы от понижения может отклонить) |
| Uninstall | `DELETE orgs/:orgId/addons/:id?data=keep\|purge` | disable + снятие привязок; `purge` стирает data.db/files/logs/секреты/состояния |
| Restart / карантин | `POST .../restart`, `POST .../quarantine/reset` | диагностика |

## Экземпляр: запуск и надзор

- **Single-flight lazy**: `ensureRunning(orgId, addonId, reason)`; причины жить — вызов, включённый экземпляр триггера, автостарт-воркер, транспортная привязка, resident. Нет причин — idle-стоп (5 мин).
- **Надзор**: ping 15 с / timeout 5 с / 3 промаха → рестарт; RSS > 512 MiB → рестарт; падение → backoff 1→60 с (+0…25% jitter); circuit breaker >5 крашей за 10 мин (карантин на 6-м падении) → `quarantined` (причина + хвост журнала в UI, выход ручным reset); падение в момент вызова → `unavailable` retryable, неидемпотентные вызовы хост сам не повторяет.
- **Поколения**: старт инкрементирует `generation`; сообщения и ответы устаревшего поколения отбрасываются.
- **Штатная остановка**: `shutdown { reason, deadlineMs 5000 }` → drain → stdin close → SIGTERM → +2 с SIGKILL группы; ни таймеров, ни регистраций, ни сирот.
- **Recovery после старта** (§8.7): replay `trigger.start` включённых экземпляров, `worker.start` автостартов, пересчёт джобов — обработчики обязаны быть идемпотентны.
- Reconciler (тик 30 с) — единственный, кто создаёт/убивает процессы помимо событий: стопит «выключен, но живёт», чистит fires (7 дней), шлёт `addon.update_available` при новой установленной версии.

Конфиг/права/привязки **не** перезапускают экземпляр (уведомления `config.changed`/`permissions.changed`, привязки резолвятся на вызове); смена версии и профиля — перезапускают.

## In-process режим

Для builtin/local с `trusted`: тот же `HostDispatcher`, тот же набор методов, JSON-копирование параметров и результатов для паритета с процессом; изоляции сбоя нет. Отключается флагом политики (`inProcessEnabled`) без изменения контракта. Бандл при этом импортируется хостом, поэтому `if (import.meta.main)` обязателен.

## Совместимость

- `platform` манифеста обязан поддерживаться хостом (в `supportedPlatforms`; сейчас только `1`, helper `supportedPlatformMajors` закладывает текущий + предыдущий мажор), `features` — жёсткое требование (`family:source-kind@1`), версии дескрипторов `v` ≤ поддерживаемых семейством.
- Несовместимый пакет виден в каталоге с `outcome: 'incompatible'` и причинами; включить нельзя.
- Вклад неизвестного семейства: обязательный → `incompatible`, `optional: true` → пропуск с warning (`skipped[]` в compatibility view).
- Деприкации приходят в `initialize.deprecations[]`, пишутся в журнал экземпляра и показываются баннером.

## Идемпотентность автора — чеклист

1. `trigger.start`/`worker.start` повторятся после каждого рестрта процесса — upsert, не insert.
2. `runKey` в `ctx.triggers.fire` детерминирован для повторов (событие имеет id — используйте его); хост дедуплицирует по паре `(instanceId, runKey)`.
3. Обработчик `config.changed` перезагружает значения (не перечитывайте конфиг на каждом вызове с кэшем в module-scope между вызовами — контекст-кэш может устареть).
4. `lifecycle.upgrade` идемпотентен: миграции SQL уже применены к моменту вызова.

---

Дальше: [REST API](rest-api.md)
