# Быстрый старт: первый аддон

Задача: аддон `acme.greeter` — один инструмент для агента, один HTTP-маршрут и периодический джоб. Пятнадцать минут по шагам.

## 1. Скелет пакета

Системные аддоны живут в `add-ons/` монорепо — они устанавливаются по определению (источник `builtin`, доверие от источника). Каталог должен совпадать с id:

```
add-ons/acme.greeter/
  addon.json                 # манифест
  package.json
  tsconfig.json              # extends корневой
  src/index.ts               # точка входа
  dist/index.js              # бандл (результат сборки)
  migrations/0001_init.sql   # опционально
  l10n/en.json               # опционально, для %key%-плейсхолдеров
```

```json
// package.json — по образцу встроенных аддонов
{
  "name": "acme.greeter",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "module": "src/index.ts",
  "scripts": {
    "build": "bun build --target=bun src/index.ts --outfile dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": { "@harnesys/sdk": "file:../../packages/sdk" },
  "devDependencies": { "@types/bun": "latest", "typescript": "^5.9.3" }
}
```

Когда `@harnesys/sdk` уедет в npm, dependence станет обычным пакетом; для внешних (не монорепных) аддонов это единственный разрешённый импорт.

## 2. Манифест

```json
{
  "id": "acme.greeter",
  "version": "1.0.0",
  "platform": 1,
  "title": "Greeter",
  "description": "Says hello: an agent tool, an HTTP route, a heartbeat job.",
  "runtime": { "entry": "dist/index.js", "profile": "trusted" },
  "activation": "lazy",
  "permissions": [],
  "connections": [],
  "contributions": [
    {
      "id": "pack",
      "family": "tool-pack",
      "descriptor": {
        "name": "greeter",
        "title": "Greeter",
        "description": "Say hello to someone",
        "tools": [
          {
            "name": "greet",
            "description": "Greet a person by name",
            "inputSchema": {
              "type": "object",
              "properties": { "name": { "type": "string", "minLength": 1 } },
              "required": ["name"]
            },
            "effect": "read"
          }
        ]
      }
    },
    {
      "id": "greeting",
      "family": "route",
      "descriptor": { "id": "greeting", "method": "GET", "path": "/greeting", "role": "member" }
    },
    {
      "id": "heartbeat",
      "family": "job",
      "descriptor": {
        "id": "heartbeat",
        "title": "Heartbeat",
        "schedule": { "everySec": 300 },
        "catchUp": "none",
        "defaultEnabled": true
      }
    }
  ]
}
```

Обязательные поля: `id`, `version` (semver), `platform` (1), `title`, `description`, `runtime`, `activation`, `permissions`, `connections`, `contributions`. `profile: 'trusted'` корректен для builtin-пакета; `lazy` не требует прав; джобы/триггеры/воркеры требуют одноимённые разрешения — у нас их пока нет, только `job` не требует (расписанием владеет хост).

## 3. Код

```ts
// src/index.ts
import type { AddonContext } from '@harnesys/sdk';
import { defineAddon, startAddonProcess } from '@harnesys/sdk';

const ADDON_ID = 'acme.greeter';
const ADDON_VERSION = '1.0.0';

export const addon = defineAddon({
  tools: {
    greet: (input, ctx: AddonContext) => {
      const name = String(input.name ?? 'stranger');
      ctx.log.info('greeting', { name });
      return { text: `Hello, ${name}!` };
    },
  },
  routes: {
    greeting: (_call, ctx: AddonContext) => ({ status: 200, body: { text: 'Hello, world!' } }),
  },
  jobs: {
    heartbeat: async (_params, ctx: AddonContext) => {
      await ctx.db.exec('create table if not exists beats (at text)');
      await ctx.db.run('insert into beats (at) values (?)', [new Date().toISOString()]);
    },
  },
});

if (import.meta.main) {
  await startAddonProcess({ definition: addon, addon: { id: ADDON_ID, version: ADDON_VERSION } });
}
```

Ключи `defineAddon` — идентификаторы вкладов из манифеста (для `tools` — имя тула из дескриптора, для `triggers` — `kind`). Вклад без обработчика роняет экземпляр на рукопожатии (`incompatible_handlers`); обработчик без вклада — мёртвый код, хост его не вызовет.

`import.meta.main` обязателен: в in-process режиме хост импортирует бандл и сам крутит рантайм — guard не даёт поднять второй stdio-цикл. Экспорт `addon` — именованный, это контракт загрузчика.

## 4. Сборка и проверки

```sh
cd add-ons/acme.greeter
bun install
bun run build          # bun build --target=bun src/index.ts --outfile dist/index.js
bun run typecheck
```

Runtime-зависимости — только то, что убрано в бандл; `node_modules` в установочный пакет не кладётся (digest-обход на нём спотыкается, staging его не ждёт).

## 5. Локальный тест без хоста

```ts
// src/greeter.spec.ts
import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';
import { createFakeHost } from '@harnesys/sdk/testing';
import rawManifest from '../addon.json' with { type: 'json' };
import { addon } from './index';

describe('greeter', () => {
  test('greet tool returns a greeting', async () => {
    const host = createFakeHost({ definition: addon, manifest: parseAddonManifest(rawManifest) });
    const result = await host.callTool('greeter', 'greet', { name: 'Ada' });
    expect(result).toEqual({ output: { text: 'Hello, Ada!' } });
    expect(host.logs.some((l) => l.message === 'greeting')).toBe(true);
    host.close();
  });
});
```

Полная механика fake-хоста (гранты, fake-БД, фейковый HTTP, `advanceTime`) — в [Тестировании](testing.md).

## 6. Установка и включение

**В дев-стенде монорепо** (`bun run dev`, API `:47473`, данные `~/.harnesys-dev`) новый каталог в `add-ons/` подхватывается builtin-сканом: нажмите **Reload** на странице Settings → Add-ons (или `POST /api/addons/packages/rescan` с хост-админ правами) либо перезапустите стенд.

**Вне монорепо** — положите собранный пакет в `~/.harnesys/add-ons/acme.greeter/1.0.0/` и нажмите Reload, либо установите через UI **Install package** (план → подтверждение).

Дальше организация: на карточке аддона включить тумблер. Включение прогоняет совместимость, миграции, диалог согласия (если заявлены обязательные права — у нас нет), `enable` с грантами:

```sh
curl -X POST http://127.0.0.1:47473/api/orgs/$ORG_ID/addons/acme.greeter/enable \
  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"grants": []}'
```

## 7. Проверка результата

- **Страница аддона** (`Settings → Add-ons → Greeter`): версия, чип `system`, health `running|stopped`, секции (default-набор webui: status/capabilities/permissions/connections/config/automations/jobs).
- **Маршрут**: `GET /api/orgs/$ORG_ID/addons/acme.greeter/r/greeting` → `{"text":"Hello, world!"}`. Путь в URL — из дескриптора `path`, не из id вклада.
- **Джоб**: секция Jobs → **Run now** (`POST .../jobs/heartbeat/run`), состояние в `addon_job_state`.
- **Инструмент**: назначьте пак `greeter` агенту и попросите его поздороваться; имя инструмента для LLM будет `acme_greeter_greet`.
- **Журнал**: секция Diagnostics → logs (`GET .../logs`): строка `greeting {name}`.
- Если включён, но `stopped` — смотрите логи и **Restart**; 5 падений за 10 минут — карантин с кнопкой сброса.

## Что дальше

- [Анатомия аддона](anatomy.md) — разбор реального `harnesys.webhook` от манифеста до миграций.
- [Contributions](contributions.md) — все 13 семейств вкладов.
- [AddonContext](context.md) — работа с данными, HTTP, аккаунтами, агентами.
