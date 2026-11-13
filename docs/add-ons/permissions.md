# Права и согласие

У аддона нет ambient authority: всё, кроме базового набора, отдаётся только правом, выданным организацией конкретной декларации версии. Эффективный доступ:

```
эффективные = базовые ∪ (декларация манифеста ∩ гранты организации ∩ политика хоста)
```

Проверка — на **каждом** вызове сервиса хоста (`HostDispatcher`): гранты перечитываются, поэтому отзыв действует немедленно.

## Каталог прав

Базовые — выдаются всегда, в манифесте не заявляются, в диалоге согласия не показываются:

| Id | Даёт |
|---|---|
| `config.read` | `ctx.config.get` |
| `log` | `ctx.log.*` |
| `db` | `ctx.db.*` (собственная БД своей организации) |
| `secrets.own` | `ctx.secrets.get/set/delete` в своём пространстве `addon:<org>:<addonId>:` |
| `events.emit.own` | `ctx.events.emit` в свой префикс `<addonId>.*` |
| `org.read` | `ctx.org.settings()` (таймзона организации) |

Gated — декларируются в манифесте, выдаются грантом:

| Id | Risk | Scope | Открывает |
|---|---|---|---|
| `http.fetch` | medium | `{ hosts: string[] }` (маски `*.example.com`, `*`) | `ctx.http.fetch` (egress-allowlist, https, блок приватных адресов) |
| `accounts.use` | medium | `{ connections: string[] }` | `ctx.accounts.list`, `ctx.accounts.report`, инъекция auth |
| `accounts.credentials` | high | `{ connections? }` | `ctx.accounts.access` — сырые учётные данные, аудируется |
| `runs.dispatch` | medium | — | `ctx.runs.dispatch`, `ctx.runs.cancel` |
| `runs.read` | low | — | `ctx.runs.list` |
| `threads.create` | medium | — | `ctx.threads.create` |
| `threads.compact` | high | — | `ctx.threads.compact` |
| `usage.read` | low | — | `ctx.usage.summary` |
| `skills.read` | low | — | `ctx.skills.list` |
| `events.subscribe` | low | `{ patterns: string[] }` | вклады `hook` на события ядра и других аддонов |
| `files.read` | medium | — | `ctx.files.stat/read` (workspace организации) |
| `files.write` | high | — | `ctx.files.write` (workspace организации) |
| `bridge.inbound` | medium | — | `ctx.bridge.inbound` |
| `routes.public` | high | — | маршруты `exposure: 'public'` |
| `trigger` | medium | — | вклад `trigger`, `ctx.triggers.fire`, `trigger.start/stop` |
| `worker` | medium | — | вклад `worker`, `ctx.workers.report/lease/release` |
| `source` | medium | — | `source.*` handlers |
| `approvals.request` | medium | — | `ctx.approvals.request` (создание HITL-согласований) |
| `lifecycle.resident` | medium | — | `activation: 'resident'` |

Источник истины — `PERMISSION_DEFINITIONS` хоста (`infra/addons/dispatcher/permission-definitions.ts`) и `KNOWN_PERMISSION_IDS` SDK; неизвестный id в манифесте — нарушение `unknown_permission`.

Scope сужает право: вызов вне scope → `permission_denied` (HTTP на хост, которого нет в `hosts`, хук на событие вне `patterns`, connection вне `connections`). Покрытие проверяет функция `covers` определения.

Три права (`trigger`, `worker`, `source`) — **contribution-derived**: они не имеют смысла без соответствующего вклада, и `trigger.start/stop`, `workers.*`, `source.*`-вызовы gated именно ими (`job.run` и `worker.start/stop` права не требуют).

## Декларация и выдача

```json
"permissions": [
  { "id": "http.fetch", "scope": { "hosts": ["api.github.com"] }, "reason": "Calls GitHub REST API for the bound installation" },
  { "id": "accounts.use", "scope": { "connections": ["github"] }, "reason": "List bound installations" },
  { "id": "routes.public", "reason": "Receive GitHub webhooks", "optional": true }
]
```

- `reason` обязателен и показывается администратору в диалоге согласия вместе с risk и scope.
- Обязательное право отклонить нельзя — без него аддон не включается. `optional: true` можно не выдавать: аддон получит урезанный `initialize.permissions` и обязан деградировать без этой функции.

Грант привязан к `grants_digest` — хэшу канонизированной декларации прав версии. Версия, чья декларация полностью покрыта имеющимся грантом, наследует его без переспроса; иначе — `needs_consent`.

## Consent-поток

1. **Enable**: `POST /api/orgs/:orgId/addons/:id/enable { grants }`. Без обязательных грантов → `409 needs_consent` + SSE `addon.consent_required`; UI открывает диалог ([consent-dialog](ui.md) в webui) со списком прав, риском, scope, reason.
2. **Update**: `grantDiff(старая, новая)`; новые обязательные права → `needs_consent` + SSE `addon.consent_required`, организация остаётся на закреплённой версии до согласия; обновление без расширения прав применяется без переспроса.
3. **Отзыв**: `PUT .../grants` — экземпляр получает `permissions.changed`, диспетчер перестаёт пропускать вызовы немедленно; отзыв **обязательного** права останавливает процесс с `permission_revoked`.
4. Изменения прав/грантов/политики пишутся в аудит.

## Политика хоста

Администратор хоста может запрещать права глобально — файл `~/.harnesys/addons-policy.json` (`GET/PUT /api/addons/policy`):

```ts
interface AddonHostPolicy {
  forbiddenPermissions: string[];       // гранты таких прав выстригаются
  forbiddenHosts: string[];             // egress deny-list поверх http.fetch scope
  allowedSources: string[];             // источники установки сверх builtin ('local-dir' sentinel)
  allowUnsandboxedExternal: boolean;    // external trusted без OS-песочницы (аудит-запись)
}
```

Политики — слой пересечения, а не выдача: запрещено политикой ведёт себя как никогда не выданное; «обязательное, но запрещённое» не блокирует enable: аддон включится, но права не будет ни в `initialize.permissions`, ни в диспетчере, и вызовы вернут `permission_denied`.

## Практика для автора

- Декларируйте только небазовые права и ровно тот scope, что используется — грех «на вырост»: consent-диалог показывает всё, что просит версия, а обновление с расширением прав переспрашивает.
- Проверяйте права в рантайме gracefully: `initialize.permissions` (в контексте — через поведение сервисов: `permission_denied`).
- Никогда не тяните сырые credentials, если хватает инъекции auth в `ctx.http.fetch` — `accounts.credentials` high-risk и виден в аудите.

---

Дальше: [Accounts и connections](accounts-connections.md) · [REST API](rest-api.md)
