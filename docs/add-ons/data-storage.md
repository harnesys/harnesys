# Хранение данных: БД, миграции, файлы, секреты, конфиг

Аддон не трогает базу ядра. Каждый аддон получает **свою SQLite на организацию**, файлы, секреты и значения конфига — всё изолировано, всё через хост-сервисы.

## Файловая раскладка

```
orgDataDir(orgId)/addons/<addonId>/
  data.db        # SQLite этой организации для этого аддона (WAL, foreign keys ON)
  files/         # HARNESYS_DATA_DIR — рабочие файлы экземпляра
  logs/          # журнал экземпляра (ротация 10 MiB × 3)
  backups/       # предреформационные копии миграций (хранятся 3)
```

Файл `data.db` лежит вне каталога, доступного процессу аддона; пути к `org.db` у аддона нет — доступ только через `ctx.db.*` (см. [AddonContext](context.md#ctxdb--собственная-sqlite-на-организацию)).

## SQL-правила

Хост guard-ит каждый оператор (`infra/addons/storage/sql-guard.ts`):

- Запрещены `ATTACH`, `DETACH`, `load_extension` — аддон не может ни прицепить чужую базу, ни загрузить код.
- `PRAGMA` — только из белого списка чтения: `user_version`, `foreign_keys`; записывающие `PRAGMA` запрещены; режим журнала и параметры соединения задаёт хост.
- Только подготовленные операторы с параметрами (`string | number | boolean | null`); конкатенация пользовательских строк в SQL — баг автора, не дыра платформы.
- Ограничения: время оператора 5 с, результат ≤ 8 MiB, `db.batch` ≤ 100 операторов (атомарный `tx.immediate`).
- Интерактивных транзакций через RPC нет — транзакция не может переживать сетевой вызов; атомарные последовательности делайте через `ctx.db.batch`.

Кавычки при разборе операторов учитываются, многоточечные `;`-скрипты разбираются корректно.

## Квота

Механизм квоты в `AddonDb` есть: после каждой записи считается `page_count × page_size`. Но поле `data.quotaMb` из манифеста хост при открытии БД сейчас не передаёт (`wiring/addon-db-access.adapter.ts`), так что потолок фактически не применяется (256 MiB из плана не реализованы):

- до квоты — всё работает;
- после — `quota_exceeded` на всё, кроме **уменьшающих объём** операторов (`DELETE`, `DROP`, `VACUUM`): аддон не заблокирован намертво, он может почиститься.

Не закладывайте «удаление по расписанию» только в job: при переполнении джоб-то вызывается, но пишите cleanup-логику устойчивой к `quota_exceeded` на put-пути.

## Миграции

`data.migrations` в манифесте указывает каталог с файлами `NNNN_name.sql` (regex `^\d{4}_[a-zA-Z0-9_-]+\.sql$`, четыре цифры + имя):

```sql
-- migrations/0001_init.sql
create table if not exists webhooks (instance_id text primary key, config text not null, …);
```

```sql
-- migrations/0002_instance_label.sql
alter table webhooks add column label text not null default '';
```

Порядок применения на enable/update версии:

1. читается `PRAGMA user_version` (N), берутся файлы с номером > N;
2. перед переменой — бэкап `VACUUM INTO backups/<stamp>.db` (три последних держатся);
3. каждая миграция — в транзакции, там же обновляется `user_version`;
4. сбой — восстановление копии, ошибка `migration_failed`, откат закрепления версии (данные не повреждаются);
5. **понижать схему нельзя**: если `user_version` больше последней миграции включаемой версии — отказ (`schema_newer`): старый код не будет работать на новой схеме;
6. после SQL-миграций при смене версии аддон получает `lifecycle.upgrade { fromVersion }` — туда JS-конверсии состояния.

Миграции только вперёд; возврат данных — копия при неудаче или ручной откат администратора на прежнюю закреплённую версию.

## Экспорт и удаление данных

- `GET /api/orgs/:orgId/addons/:id/data/export` (администратор организации) — JSON-даммп таблиц `data.db` с лимитом строк на таблицу, не архив `data.db` + `files/`.
- `DELETE /api/orgs/:orgId/addons/:id?data=keep|purge`: `addon_bindings`, экземпляры триггеров и состояние джобов снимаются при любом режиме; `keep` оставляет данные и строку организации (конфиг сохраняется), `purge` дополнительно стирает секреты и весь каталог аддона (`data.db`, `files/`, `logs/`, `backups/`).
- `POST .../packages/prune` молча пропускает закрепляемые версии; принудительное удаление закреплённой версии (`DELETE /api/addons/packages/:id/:version`) — `409 in_use`.

## Конфиг

Значения конфига — пер-организация, принадлежат хосту, аддон их **только читает**:

```ts
const values = await ctx.config.get();                 // все
const { commands, poll_sec } = await ctx.config.get(['commands', 'poll_sec']);
```

- Поля объявляются вкладом `config` ([FieldSpec](ui.md#fieldspec)); хост рисует форму на странице аддона, хранит несекретные значения в `org_addons.config_json`.
- Хост подмешивает объявленные `default` к сохранённым значениям — дефолты не надо реплицировать в код.
- Изменение из UI доходит до запущенных экземпляров уведомлением `notifications['config.changed'] { keys }` — перезагрузите прочитанное; перезапуска процесса нет.
- Поля `type: 'secret'` **не появляются** в `config.get` — они в хранилище секретов ([ниже](#секреты)).
- Писать конфиг из аддона нельзя; если нужны редактируемые пользователем данные — это ваша БД (`ctx.db`) и ваши маршруты (`route`), не конфиг.
- `specFields` пака (`tool-pack`) — настройки на уровне назначения инструмента агенту; тоже конфиг, другая область видимости.

## Секреты

```ts
const token = await ctx.secrets.get('botToken');       // string | null
await ctx.secrets.set('botToken', '123:ABC');          // значение ≤ 8 KiB
await ctx.secrets.delete('botToken');
```

- Пространство имён `addon:<orgId>:<addonId>:<key>` в vault-хранилище (`SecretStorePort`); ключ — `[A-Za-z0-9_.-]{1,128}`; право базовое (`secrets.own`); чужие пространства физически недоступны.
- Пути записи: форма конфига (`type: 'secret'`, через `PUT .../config { secrets }`, `null` удаляет) и `ctx.secrets.set` в рантайме (например, обмен временных токенов провайдера).
- UI значения секретов не отдаёт ни в одном read-model: проверять наличие — `secret !== null`, не логируйте значения.
- Секреты **провайдеров** (OAuth-токены аккаунтов Apps) живут не здесь — см. [Accounts и connections](accounts-connections.md).

## События, которые публикует аддон

```ts
await ctx.events.emit('build.finished', { repo: 'acme/api', number: 42 });
// на шине организации: harnesys.acme.build.finished
```

Payload ≤ 64 KiB; имя всегда под префиксом вашего `addonId` (другое пространство занять нельзя). Видно в SSE-стриме организации (`/api/orgs/:orgId/addons/events`, фильтр `addon.*`) и подписывается хуками других аддонов при их праве `events.subscribe` и покрывающем шаблоне (`harnesys.acme.*`).

## Host-события для подписки

Конечный каталог (`HostEventCatalog`), доступный вкладом `hook` с `on.event`: `thread.created`, `run.started`, `run.finished`, `run.failed`, `run.parked`, `run.cleared`, `app.created`/`app.updated`/`app.deleted`, `account.connected`/`account.updated`/`account.status_changed`/`account.removed`, `addon.state_changed`, `config.changed`, `permissions.changed`; доставка at-most-once (очередь 256 на аддон, старые вытесняются), детали — [contributions.hook](contributions.md#hook--события-ядра-и-провайдера), [Автоматизации](automation.md#hook-реакция-на-события-at-most-once).

---

Дальше: [Accounts и connections](accounts-connections.md)
