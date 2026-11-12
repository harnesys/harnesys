Собрал всё по файлам, без догадок. Картина честная и она сложнее, чем «легаси → аддоны»: в репо три поколения, и миграция идёт через промежуточную систему accounts.

## Ландшафт (3 поколения)

1. **§14.1 легаси** — источник функционала, заморожено: `application/connectors/*` (telegram-бот), `application/integration/*` + `infra/integration/{google,github}` (google/github), `infra/source/drivers/cloud` (Drive-синк), UI `features/manage-connectors`.
2. **§16.1 (тоже заморожено)** — промежуточный in-process framework `harnesys/integration` + `IntegrationHost` + `packages/integration-telegram` (MTProto feed). По `ADDONS_PLAN.md` §16.1 его менять нельзя.
3. **Целевая система аддонов** — `packages/sdk`, `infra/addons`, webui `features/manage-addons`, пакеты в `add-ons/`, + **apps/accounts** (`infra/apps/providers/{google,telegram,github}`) как слой подключений/креденшелов.

## Что уже сделано

**Платформа аддонов** (`infra/addons`: catalog, dispatcher, supervisor, transport, sandbox, services, wiring, families): манифест+валидация, consent при установке, trigger/transport/source/job семейства, bindings, secrets, таблицы, workers, SSE-события. WebUI: `install-addon-dialog`, `section-registry` (config/connections/jobs/tables/automations/markdown), `addon-trigger-config-dialog`.

**Слой подключений (apps/providers)** — весь скопирован:
- `google` — PKCE OAuth, refresh, revoke, YouTube-партиции (`providers/google/index.ts:110-247`)
- `telegram` — bot (BotFather token + getMe) и user (MTProto: phone → code → 2FA → session) (`providers/telegram/mtproto-kind.ts`)
- `github` — GitHub App (PEM, webhook secret, HMAC-verify webhook, installation effects, install redirect) (`providers/github/index.ts`)

**9 аддон-пакетов в `add-ons/`** (все собраны, реальных стабов нет — grep чистый):

| Пакет | Статус | Чего нет против легаси |
|---|---|---|
| telegram-bot | ядро готово (poller, auto-bind чат→тред, HITL, echo-гейт, streaming-драфты в core, 12 агент-тулз, топики, медиа) | команды `/link /stop /compact /stats /skills`, identity link, pair-code (заменён auto-bind), REST управления чатами (attach/rename/topics/forget), политика зеркала как UI, `streaming: false` в дескрипторе |
| telegram-feed | готов (MTProto, watermark, фильтр, правила→triggers, backfill как конфиг, `GET /sources /posts`) | readers CRUD и join (каналы — textarea в конфиге), refresh |
| google-gmail | готов (search/read/thread/send/attachments) | push/watch-триггер |
| google-drive | готов как source-backend (list/stat/download/export/upload/mkdir/remove) | нет тулз/вью; Picker из легаси не портирован |
| google-calendar, sheets | готово | — |
| google-docs | минимально (read + append) | create/rename/delete |
| google-search-console | минимально (2 read-тулзы) | — |
| google-youtube | готов (read/write/upload ≤1GB/thumbnail/analytics) | — |

## Что осталось (главные дыры)

1. **GitHub — аддона нет вообще.** Креденшелы есть в apps, но не портированы: тулз-пак (repos, code search, issues, PR+merge, CI), git-credential bridge для git-источников (`application/integration/git-credential.use-case.ts`), webhook→триггер (в легаси события только складывались в `integration_events` и читались тулзой `recentEvents`).
2. **Drive Picker и two-way sync-back**: легаси Picker (`google-folder-picker.ts`) и sync-back watcher (`cloud-sync-back-*`) в новую систему не подтверждены — drive-аддон только backend, как ядро-пайплайн делает upload-back — надо проверить отдельно.
3. **Telegram-bot добивка**: 5 команд, identity link (портирован код, но bridge его не вызывает), pair-code vs auto-bind (дизайн-решение), REST чатов, зеркало-политика.
4. **Дубль telegram-feed**: живой UI сейчас из замороженной §16.1 системы (`INTEGRATION_UI_REGISTRY` → `/orgs/:orgId/integrations/telegram`), а `harnesys.telegram-feed` — отдельная реализация. Две параллельные; какую оставить — решение за тобой.
5. **Хвосты §14.1 UI**: google/github страницы живут только в легаси `manage-connectors`, своего роута `/integrations/:id` нет (настройки телеграм-ридера рендерятся внутри легаси `ConnectorDetailPage`). Правило «connect-сёрфейс на странице интеграции» для google пока выполняется через `AccountPicker` в connections-section, не отдельной страницей.

Следующий логичный шаг — GitHub-аддон (тулзы + git-credential bridge) и решение по дублю feed. С чего начать?
