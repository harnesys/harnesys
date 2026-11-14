# Тестирование аддона

`@harnesys/sdk/testing` запускает **тот же** рантайм SDK (`createAddonRuntime`) поверх fake-хоста — in-memory реализации сервисов по тем же Zod-схемам и тем же правилам покрытия прав. Ни сервера, ни процессов, ни сети.

```ts
// src/greeter.spec.ts — bun test
import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';
import { createFakeHost, createFakeDb } from '@harnesys/sdk/testing';
import rawManifest from '../addon.json' with { type: 'json' };
import { addon } from './index';

describe('greeter', () => {
  test('greet tool writes a log line and greets', async () => {
    const host = createFakeHost({
      definition: addon,
      manifest: parseAddonManifest(rawManifest),
      config: { greeting: 'Hi' },
      secrets: { api_note: 'test-note' },
      accounts: [{ connection: 'github', accountId: 'acc-1', label: 'acme/api', status: 'active' }],
      http: async (req) => ({ status: 200, headers: {}, body: JSON.stringify({ ok: true }) }),
    });

    const result = await host.callTool('greeter', 'greet', { name: 'Ada' });
    expect(result).toEqual({ output: { text: 'Hello, Ada!' } });
    expect(host.logs.some((l) => l.message === 'greeting')).toBe(true);

    host.close();
  });
});
```

## createFakeHost(options)

| Опция | Что делает |
|---|---|
| `definition` | результат `defineAddon` (реальный рантайм поверх фейка) |
| `manifest` | манифест: сверяется с declared handlers, ссылки `connection` валидируются |
| `grants?` | выдача прав; по умолчанию = декларация манифеста; baseline + contribution-derived (`trigger`, `worker`) добавляются автоматически; **недостающий грант → `permission_denied`** (то же, что живой хост) |
| `config?`, `secrets?` | значения сервисов |
| `accounts?` | привязанные аккаунты (`FakeAccount[]`) |
| `http?` | обработчик исходящих запросов (без обработчика → `unavailable`) |
| `files?` | карта файлов workspace (`Record<string, string>`) |
| `now?()` | кастомные часы (детерминизм) |

## Методы вызова (host → addon)

```ts
host.callTool(pack, tool, input?) → Promise<{ output }>
host.callRoute(routeId, request)  → Promise<{ status, body? }>
host.runJob(jobId)
host.startTrigger(instanceId, kind, config?, target?) / host.stopTrigger(instanceId)
host.startWorker(workerId)
host.emit(event, hookId)                      // hook.deliver
host.notify('config.changed', { keys: [...] })// уведомления
host.deliver(method, params)                  // любой host→addon метод; сам штампует _meta (deadline +5 с)
```

## Синки для assert'ов (addon → host)

`host.logs`, `host.emitted`, `host.dispatchedRuns`, `host.cancelledRuns`, `host.createdThreads`, `host.accountReports`, `host.workerReports`, `host.inboundMessages`, `host.fileWrites`, `host.files`, `host.progress` — записывающие массивы; плюс `host.now()`, `host.advanceTime(ms)` (прокрутка времени: тики джобов, дедлайны), `host.service(method, params)` — прямой вызов сервиса с проверкой прав, `host.close()`.

## Что фейк честно эмулирует

- **БД**: `createFakeDb()` — in-memory `bun:sqlite` с тем же авторизатором, что хостовский `sql-guard.ts` (`infra/addons/storage/sql-guard.ts` mirror в `testing/fake-db.ts`): `ATTACH/DETACH/load_extension` запрещены, write-прагма запрещена, разрешены `PRAGMA user_version/foreign_keys`; ошибки — `SqlAuthorizerError`, квотные правила те же. SQL, который отвергнет хост, падает и в тесте.
- **Egress**: только `https:`, хост обязан попадать в scope гранта `http.fetch`.
- **Accounts**: connection обязана быть объявлена в манифесте; ошибки `account_failed` с `accountCode: 'not_connected' | 'not_bound'`; `access` требует `accounts.credentials`.
- **triggers.fire**: дедуп по `instanceId:runKey` → `suppressed`; старт не запущенного экземпляра → `not_found`.
- **events.emit**: обязателен префикс `<addonId>.`.
- **Схемы и права**: каждый метод проходит params/result-схемы карты протокола и проверку грантов — контракт в обе стороны как в проде.
- **Не реализованы** в фейке `workers.lease/release`, `bindings.channels`, `secrets.set/delete`: их вызов отвечает `unsupported` — это поведение проверяйте на живом стенде.
- `_meta` фейк штампует сам (`correlationId: fake-*`).

## Фикстуры

Фикстуры `validManifest`/`demoDefinition` живут в `packages/sdk/src/testing/fixtures.ts` и **не** реэкспортируются из `@harnesys/sdk/testing` — спеки внутри SDK импортируют их по относительному пути; своему аддону сделайте такой же локальный фикстуру-модуль.

```ts
import { validManifest } from './fixtures';
const manifest = validManifest();
manifest.permissions = [{ id: 'db', reason: 'store calls' }];
```

`validManifest()` — без аргументов: валидный манифест `harnesys.demo` (http.fetch-scope `api.example.com`, connection `example`, tool-pack + hook), мутируется под тест; `demoDefinition()` — определение с группами хендлеров tools/routes/triggers/jobs/hooks/sources/transport.typing, удобно для тестов самих обвязок.

## Что фейк не покрывает (проверяйте на живом стенде)

- Супервизор: рестарты, карантин, пинги, RSS; спавн процессов и песочницу;
- реальный egress-политик хоста и network-слой;
- namespaces секретов в реальном vault, per-org учёт квот, миграции файловых БД (при необходимости гоняйте на реальной файловой SQLite);
- транспорты и транспортные сессии (это поведение хоста).

Политика репозитория: тесты — чистая логика рядом с кодом (`*.spec.ts`), без сети и файлов, только `bun test`. До ручного acceptance-теста фичи новых спеков не пишем; протокольные golden-фикстуры (`protocol/__fixtures__`) и спеки манифеста — исключение: они дешевы и ловят контракты, иначе проверяемые только boot'ом.

## Ручная проверка на живом стенде

```sh
bun run dev            # API :47473, UI :5173, home ~/.harnesys-dev
```

Затем сценарий: enable с грантами → маршрут из curl → джоб Run now → триггер fire → логи/metrics (`GET .../logs`, `GET .../metrics`). Примеры curl-последовательностей — в [REST API](rest-api.md#curl-прогрев).

---

Дальше: [Упаковка и жизненный цикл](packaging-lifecycle.md)
