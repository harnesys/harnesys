# REST API аддон-платформы

Контракты DTO — `packages/contracts/src/addons-platform.ts` (Zod); контроллеры — `apps/server/src/app/api/rest/addons-*.controller.ts` и `addon-*.controller.ts` (routes, public-routes). Формат ошибок — единый контракт ядра `{ statusCode, errorCode, message, path, timestamp, traceId?, details? }`; в этой документации в примерах сокращено до `{ error, details? }`.

Слои доступа:

- **Хост-админ**: `/api/addons/*` (кроме public-routes) — сессийный пользователь с capability `host.promote` (владеют owner-роли), guard `AddonHostAdminGuard`.
- **Организация**: `/api/orgs/:orgId/addons/*` — org-сессия (`OrgAccessGuard`); изменяющие действия требуют роли администратора организации (`AddonOrgAdminGuard`, capability `org.update`).
- **Публично**: `/api/addons/public/:orgId/:addonId/r/*` — без аутентификации, только маршруты `exposure: 'public'` при выданном праве `routes.public`.

## Пакеты (хост-админ)

| Метод и путь | Назначение |
|---|---|
| `GET /api/addons/packages` | установленные пакеты и версии (`{ items: AddonPackageView[] }`: id, version, digest, source, trust, title, манифест, warnings) |
| `POST /api/addons/packages/rescan` | пересканировать домашний каталог `~/.harnesys/add-ons` в lock (builtin-скан монорепо при этом инвалидируется) → `AddonRescanResult { added[] }` |
| `POST /api/addons/packages/plan` `{ source }` | staging + digest + валидация → `InstallPlan { planId, id, version, digest, source, trust, permissions, connections, warnings }`; ничего не исполняется |
| `POST /api/addons/packages/plan/:planId/confirm` | перемещение в каталог + запись в lock (идемпотентно) |
| `DELETE /api/addons/packages/:id/:version` | удаление версии; `409 in_use` |
| `POST /api/addons/packages/prune` | удаление неиспользуемых версий |
| `GET / PUT /api/addons/policy` | `AddonPolicyView { forbiddenPermissions, forbiddenHosts, allowedSources, allowUnsandboxedExternal }` |

## Активация в организации

| Метод и путь | Назначение |
|---|---|
| `GET /api/orgs/:orgId/addons` | список `{ items: OrgAddonSummary[] }` (enabled, health, compatibility, updateAvailable, warnings) |
| `GET /api/orgs/:orgId/addons/:id` | карточка `OrgAddonDetail`: манифест, вклады, capabilities, права `{ declared, granted, diff }`, connections (с `needsSetup`), `configValues` (без секретов) |
| `POST /api/orgs/:orgId/addons/:id/enable` `{ version?, grants: [{ id, scope? }] }` | включение; без обязательных грантов → `409 needs_consent` (+SSE `addon.consent_required`); карантин → `409` |
| `POST .../disable` | выключение (204) |
| `POST .../update` `{ version, grants? }` | обновление с diff-согласием и автооткатом при сбое |
| `POST .../rollback` `{ version }` | ручное закрепление прежней версии |
| `PUT .../grants` `{ grants }` | выдача/отзыв прав (недекларированные id → 422) |
| `DELETE .../:id?data=keep\|purge` | удаление из организации |
| `PUT .../config` `{ values, secrets?: { key: string \| null } }` | конфиг; `null` в secrets удаляет секрет; значения секретов не возвращаются ни в одном read-model |
| `PUT .../bindings/:connectionId` `{ accountIds }` | привязка аккаунтов (пусто = снять всё; вид/scopes/cardinality проверяются) |

## Триггеры, джобы, маршруты аддона

| Метод и путь | Назначение |
|---|---|
| `GET / POST / PATCH /api/orgs/:orgId/addons/:addonId/triggers` | экземпляры (`TriggerInstanceView { instanceId, triggerId, label, config, instructions, target, enabled }`) |
| `DELETE .../triggers/:tid` · `POST .../triggers/:tid/enable\|disable` | id содержит `/` — URL-кодируйте |
| `GET .../jobs` · `PATCH .../jobs/:jobId { enabled }` · `POST .../jobs/:jobId/run` | джобы: `AddonJobView { schedule, timezone, enabled, nextRunAt, lastRunAt, lastStatus }` |
| `ANY /api/orgs/:orgId/addons/:addonId/r/*` | маршруты вклада `route` (GET/POST/PUT/PATCH/DELETE; путь из дескриптора; роль member/admin; body-limit; requestSchema) |
| `ANY /api/addons/public/:orgId/:addonId/r/*` | публичные маршруты (rate limit 20/с burst 40) |
| `GET .../source-kinds` · `POST .../source-kinds/:id/browse` · `POST .../source-kinds/:id/attach` · `GET .../sources` · `POST .../sources/:id/refresh` · `DELETE .../sources/:id` | `source-kind`: подключение облачных папок как знание-источников |

## Диагностика и события

| Метод и путь | Назначение |
|---|---|
| `GET .../logs` | `{ items: LogLineView[] { seq, at, level, message, fields }, cursor? }` (хвост журнала; курсор continuing — в `logs/stream`) |
| `GET .../logs/stream` | SSE-поток журнала экземпляра |
| `GET .../metrics` | `MetricsView { counters: [{ name, value, labels }] }` (addons_instance_state / addons_instance_restarts_total / addons_rpc_total / addons_manifest_contributions) |
| `GET .../data/export` | JSON-дамп таблиц `data.db` (админ) |
| `POST .../restart` · `POST .../quarantine/reset` | перезапуск, выход из карантина |
| `GET /api/orgs/:orgId/addons/events` | SSE: `addon.state_changed { addonId, state, lastError }`, `addon.update_available`, `addon.consent_required { currentVersion, pendingVersion, addedPermissions }`; поверх — события аддонов `addon.*` (emit в шину) и `addon.progress` |

UI ничего не опрашивает polling'ом — состояние приходит по SSE.

## curl-прогрев

```sh
B=http://127.0.0.1:47473                      # dev-стенд (bun run dev)
TOKEN=...                                        # accessToken сессии
ORG=... ; XORG="X-Org-Id: $ORG"

# 1. Каталог пакетов / rescan (host-admin: токен владельца + X-Org-Id)
curl -s $B/api/addons/packages -H "authorization: Bearer $TOKEN" -H "$XORG" | jq '.items[].id'
curl -s -X POST $B/api/addons/packages/rescan -H "authorization: Bearer $TOKEN" -H "$XORG"

# 2. Установка пакетом: plan → confirm
PLAN=$(curl -s -X POST $B/api/addons/packages/plan -H "authorization: Bearer $TOKEN" -H "$XORG" \
  -H 'content-type: application/json' -d '{"source":"acme.greeter"}' | jq -r .planId)
curl -s -X POST $B/api/addons/packages/plan/$PLAN/confirm -H "authorization: Bearer $TOKEN" -H "$XORG"

# 3. Enable с грантами
curl -s -X POST $B/api/orgs/$ORG/addons/acme.greeter/enable \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"grants":[{"id":"http.fetch","scope":{"hosts":["api.github.com"]}}]}'

# 4. Конфиг (values + secret), карточка — secret не светится
curl -s -X PUT $B/api/orgs/$ORG/addons/acme.greeter/config \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"values":{"default_github_login":"octocat"},"secrets":{"api_note":"s3cret"}}'
curl -s $B/api/orgs/$ORG/addons/acme.greeter -H "authorization: Bearer $TOKEN" | jq .configValues

# 5. Маршруты аддона
curl -s $B/api/orgs/$ORG/addons/acme.greeter/r/greeting -H "authorization: Bearer $TOKEN"

# 6. Джоб вручную + состояние
curl -s -X POST $B/api/orgs/$ORG/addons/acme.greeter/jobs/heartbeat/run -H "authorization: Bearer $TOKEN"
curl -s $B/api/orgs/$ORG/addons/acme.greeter/jobs -H "authorization: Bearer $TOKEN" | jq

# 7. Экземпляр триггера (пример webhook-аддона)
INST=$(curl -s -X POST $B/api/orgs/$ORG/addons/harnesys.webhook/triggers \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"triggerId":"webhook.http","label":"CI","config":{"detail":"check the build"},"target":{"threadId":"'$THREAD'","agentId":"'$AGENT'"}}' | jq -r .instanceId)
# публичный endpoint: POST /api/addons/public/$ORG/harnesys.webhook/r/$INST (INST url-encode!)

# 8. Диагностика
curl -s $B/api/orgs/$ORG/addons/acme.greeter/logs -H "authorization: Bearer $TOKEN" | jq -e '.items[-1]'
curl -s $B/api/orgs/$ORG/addons/acme.greeter/metrics -H "authorization: Bearer $TOKEN" | jq .counters

# 9. Выключение, удаление со стиранием данных
curl -s -X POST $B/api/orgs/$ORG/addons/acme.greeter/disable -H "authorization: Bearer $TOKEN"
curl -s -X DELETE "$B/api/orgs/$ORG/addons/acme.greeter?data=purge" -H "authorization: Bearer $TOKEN"
```

Проверка после disable: маршруты отдают `not_found` («Addon route not found»), хук-события не доставляются, процессов 0 — регистрации сняты (`deactivate` обратным порядком).

---

Дальше: [Расширяемость и перспектива](roadmap.md)
