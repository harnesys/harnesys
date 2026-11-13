# Расширяемость и перспектива

Где система сознательно оставила слоты, что уже заложено в контрактах, но не достроено, и как этим пользоваться сегодня.

## Что можно расширять уже сейчас (и как)

### 1. Новый аддон — без правок ядра

Все 13 семейств вкладов и 17 сервисов хоста — исчерпывающие таблицы: диспетчер и реестры не знают имён аддонов, ветвление по семейству/методу отсутствует по конструкции (реестры модулей); гейт `check:provider-names` (`scripts/check-provider-names.ts`) держит имена встроенных apps/providers вне доменовых зон ядра — плановый `check-no-addon-names` (AST-правило на switch по family/method) пока не реализован. Новый аддон = новый каталог в `add-ons/` (или установка пакетом). Ядро не меняется.

### 2. Новые механизмы внутри существующих семейств

Инструмент, триггер, джоб, воркер, маршрут, hook, view-секции из закрытого набора, FieldSpec с `widget`/`optionsFrom` — просто манифест + хендлеры. Комбинации покрывают большинство интеграций: `tool-pack`+`trigger`+`route` (github-подобный), `transport`+`worker`+`tool-pack` (мессенджер), `source-kind` (диск), `content` (скиллы).

### 3. Своё поведение на чужих данных через открытые API

`ctx.approvals.request` (создавать HITL-вопросы), `ctx.usage.summary`/`ctx.skills.list` (метрики/скиллы для команд), `ctx.org.settings` (настройки организации), `ctx.bindings.channels` (чтения привязок хоста) — аддон строит продуктовые сценарии, не трогая ядро.

## Слоты, заложенные в архитектуре

| Слот | Что заложено | Чего нет |
|---|---|---|
| **Новое семейство вкладов** | контракт `FamilyModule { family, versions, schema, crossCheck?, handlers, permissions, register → Disposable }`; единственный список `infra/addons/families/index.ts`; конформанс-тесты по всем модулям; `features` в манифесте для требования к хосту | — (рецепт: модуль + схема v1 + обработчики + право + строка в списке + секция UI при необходимости; старые аддоны не меняются) |
| **Новый хост-сервис** | контракт `HostMethodSpec/HostServiceModule`, `HostDispatcher` без switch, список `infra/addons/services/index.ts`, validateBoot (уникальность методов, существование прав, обе схемы) | — (добавить метод = модуль + запись в списке + типы выведутся из карты протокола SDK) |
| **Новый тип view-секции** | закрытый набор рендерится `section-registry.tsx` фронтенда; неизвестный тип безопасно скрывается | нужно править webui + SDK (`ViewSection` + версия `v`) |
| **`mcp` / `lsp` семейства** | дескрипторы валидируются и регистрируются (`{ id, title, connection? }`) | нет потребителя в ядре — build на них нельзя; план: ядро само запускает сервер под политику профилей |
| **`transport.stream` / `transport.stream.ack`** | канал edit-based projection работает уже (`transport.send`/`transport.edit`/`transport.typing`) | метода в карте протокола и флага `capabilities.stream` в схеме дескриптора нет — это план, не резерв; нужен для канал-нативного стриминга (mtproto-черновики) |
| **Внешние источники (url/реестр)** | `AddonSourcePort`, `external-source.adapter.ts` с `trust: 'external'`, `plan` отвергает external на стейджинге (`409 unsupported`), `allowUnsandboxedExternal` как аварийный клапан | верификация подписи пакетов — пока источник выключен; запрет `trusted`-профиля для external — по плану |
| **Подпись пакетов** | digest уже есть (sha256 байт); `plan` сверяет | схема подписей издателей и публичный ключ |
| **`experimental.*`** | согласуется в рукопожатии (`initialize.experimental`), гейтится доверием (только builtin/local) | — механика готова, ждать экспериментальных полей |
| **Совместимость platform N−1** | helper `supportedPlatformMajors` (текущий + предыдущий мажор), `deprecations[]` в handshake | адаптеров и golden-фикстур двух версий нет — поддерживается только platform 1 |
| **`$/progress` → UI** | `ctx.progress` шлёт нотификацию; хост публикует `addon.progress` | живого потребителя для long-running tool-call в UI пока нет |
| **Флотовое размещение source** | `source-kind` с `supportsRootMount/supportsSearch` | materialize на узле, где крутится аддон; remote fleet placement не завязан |
| **Lease fencing для мультинодовых хостов** | `ctx.workers.lease` (durable lease с epoch в org SQLite) | второй узел читает тот же org store — этого хватает per-org; полноценный machine-lease (fleet) поверх — плановая работа |

## Что изменилось за год (исторические ограничения, уже закрытые)

Чтобы не наступить на устаревшие заметки в старых черновиках:

- ~~Нет API для HITL~~ → `ctx.approvals.request` (scheduler им эскалирует пропуски) + host-side HITL-маршрутизация в транспортных сессиях (`message.options` → `RespondRunUseCase`).
- ~~Нет стриминга ответов агента в чат из аддонов~~ → `TransportSessionService` на хосте (draft/send/edit, backpressure, replay после рестарта, терминальные `[stopped]/[error]`).
- ~~Нет файлов для аддонов~~ → `ctx.files` поверх path-guard организации.
- ~~`ctx.runs.cancel` не было~~ → есть (право `runs.dispatch`), `/stop` в чатах портируется.
- ~~`source-kind` не потребляется~~ → живой `harnesys.google-drive`, mirror/sync-back через `AddonCloudBackend`.
- ~~Нельзя отменить зависший вызов~~ → `$/cancel` + `ctx.signal` + дедлайн-race в рантайме SDK.
- ~~`secrets` только через UI-config~~ → рантайм `secrets.set/delete` (базовое, своё пространство).
- Права org-домена добавлены: `runs.read`, `threads.compact`, `usage.read`, `skills.read`, `org.read` (baseline), `approvals.request`, `source`, `files.read/write`.

## Открытые gaps, влияющие на планирование аддонов

1. **Легаси-параллель**: старые `integrations/connectors/sources` (Telegram-коннектор и т.п.) сосуществуют с новой системой по AGENTS.md-правилу; дедлайн переключения — решение владельца продукта, аддоны должны уметь жить рядом.
2. **Identity linking из аддонов**: `/link <code>` остаётся в легаси-коннекторе; API для аддонов не объявлен (обсуждался host-side reserved-command путь).
3. **Канал-нативный стриминг**: см. слот `transport.stream`.
4. **`hxa` CLI** (`init/validate/build/pack/dev`): инструменты не написаны; сегодня сборка = `bun run addon:build` (`scripts/addon-build.ts`), валидация = `loadAddonManifest`/схема манифеста, dev = Reload на стенде.
5. **Валидация инструментов по REST**: `tools.call` из коробки вызывается только агентским рантаймом; диагностического route «вызвать tool» нет (проверяйте через агента или fake host).
6. **Digest и symlink'и** — закрыто: digest и staging читают только runtime payload (`packageFiles`), `node_modules`, dev-файлы и workspace-symlink'и плану не мешают ([packaging](packaging-lifecycle.md#формат-пакета)).
7. **Событие `addon.state_changed`** — закрыто: событие в HostEventCatalog (`host-event-catalog.ts`, v1); аддонам всё равно не подписываться на служебные события хоста через `hook`.

## Куда это растёт (по плану §21 и обсуждениям)

- Маркетплейс и подпись: `external`-источник включается вместе с верификатором; `trust` и профили уже готовы принять чужой код.
- `mcp`/`lsp`: ядро запускает сервер сам, аддон описывает — следующая consumer-пара.
- HITL из аддонов шире: approval-порт для аддонов, которые *повышают* согласования (не только отвечают).
- Remote execution: `AddonTransport` абстракция (stdio/in-process) допускает socket/удалённый узел без смены семантики.
- Больше транспортов и source-kind: Telegram user-аккаунт, Slack, Discord, OneDrive — все ложатся на существующие семейства без ядровых правок.

---

Дальше: [Глоссарий](glossary.md) · [Дом](README.md)
