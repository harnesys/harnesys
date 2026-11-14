# Accounts и connections

Учётные данные провайдеров — не дело аддона. OAuth-флоу, токены, рефреши, подключение провайдеров живут в слое **Apps/Accounts** (отдельная подсистема, свой план `docs/APPS_PLAN.md`). Аддон объявляет **потребность** (`connection`) — какие виды аккаунтов и какие scopes ему нужны; администратор организации **привязывает** существующие аккаунты; хост выдаёт доступ на лету, часто без единого взгляда на токен.

## Объявление потребности

```json
"connections": [
  {
    "id": "github",
    "label": "GitHub installation",
    "accountKinds": ["github-installation"],
    "scopes": ["repo"],
    "cardinality": "one",
    "optional": true
  }
]
```

- `accountKinds` — вид из каталога Apps (минимум один); при привязке вид аккаунта обязан входить в список (иначе `422`); нехватка обязательных scopes — `403`.
- `scopes` — ключи scopes вида; аккаунт обязан их нести, иначе UI предложит доподключить через Apps.
- `cardinality: 'one'` — максимум одна привязка (вторая — 409); `'many'` — много (аддон тогда всегда указывает `accountId`).
- `optional: true` — связь не блокирует включение; без привязки вызовы, которым нужен аккаунт, вернут `account_failed`, страница покажет «нужно подключить» (`needs_setup`).

Дескрипторы семейств (`tool-pack.connection`, `trigger.connection`, `transport.connection`, `source-kind.connection`, `hook.on.providerEvent.connection`) ссылаются на id из этого списка; ссылка на необъявленную связь — ошибка манифеста `unknown_connection`.

## Привязка

Страница аддона (секция `connections`) показывает `AccountPicker` по объявленным видам: выбрать существующий аккаунт организации или «Connect new» (уводит в connect-поток Apps). REST:

```
PUT /api/orgs/:orgId/addons/:addonId/bindings/:connectionId  { accountIds: ["…"] }
```

Пустой массив снимает все. Проверяется членство в организации, вид, scopes, cardinality; запись идёт в `addon_bindings` (таблица организации). Включение аддона **не блокируется** отсутствием обязательной привязки — ошибки всплывают на вызовах и в UI.

Съём привязки учитывается слоем Apps: `AccountHolderPort` отдаёт держателей `{ holderType: 'addon', holderId, label }`, удалить занятый аккаунт нельзя (`409 account_referenced`) до снятия. Удаление аддона с `data=purge` снимает привязки само.

## Рантайм-API

```ts
// только привязанные к вам аккаунты, без секретов
const accounts = await ctx.accounts.list('github');
// [{ accountId, label, externalAccountId, status }]

// сообщить хосту о проблеме аккаунта (код из ACCOUNT_ERROR_CODES Apps)
await ctx.accounts.report('github', 'invalid_credentials', accountId);

// сырые credentials — только когда иначе нельзя (accounts.credentials, high, аудит)
const { credentials, expiresAt, app } = await ctx.accounts.access('github', accountId);
```

Правило резолва: явный `accountId` обязан быть привязан (иначе `not_found`); ноль привязок — `account_failed` с `accountCode: 'not_found'`; несколько без `accountId` — `invalid_params`.

## Рекомендуемый путь: инъекция auth

Аддон должен вообще не видеть токены. `ctx.http.fetch` с `auth` резолвит (и обновляет при истечении) учётные данные **на хосте**, подставляет заголовок и выполняет запрос:

```ts
const res = await ctx.http.fetch({
  url: 'https://api.github.com/user/repos',
  auth: { connection: 'github', scheme: 'bearer', accountId: installationId },
});
```

| `scheme` | Куда подставляется |
|---|---|
| `bearer` | `Authorization: Bearer <token>` |
| `basic` | `Authorization: Basic <b64(user:pass)>` |
| `header` | заголовок из `header` или `credentialKey` (обязательно хотя бы одно, иначе `invalid_params`), значением того же `credentialKey` |
| `path` | в URL вместо `placeholder` (default `{token}`) — например `https://api.telegram.org/bot{token}/sendMessage`; credential обязан состоять из `A-Za-z0-9._~:-` |

При ответе 401/403 хост по умолчанию сам репортит проблему аккаунта. Право `accounts.use` + scope `{ connections }`; токен в процесс аддона не попадает ни при каком раскладе, не попадает и в журнал (canary-тест это закрепляет).

`accounts.access` — исключение для протоколов, где cred нужен внутри процесса (MTProto-сессия `harnesys.telegram-feed`). Хранить cred дольше `expiresAt` нельзя; не логируйте.

## Смена состояния аккаунтов

Запущенный экземпляр получает уведомление `accounts.changed { connection, accountId, status }`; остановленный прочитает состояние на следующем вызове (`list` / ошибки вызовов). Ошибки уровня Apps (`AccountAccessError`) приходят в протоколе как `account_failed` + `accountCode`.

Свой провайдер/вид аккаунта/флоу подключения аддоном не добавляется — если вендор требует нового вида, это заявка в Apps-слой провайдеров, а не в аддон.

---

Дальше: [Автоматизации](automation.md)
