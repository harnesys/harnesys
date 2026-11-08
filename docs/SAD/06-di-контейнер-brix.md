# 06. DI контейнер brix (packages/brix)

## Обзор

`packages/brix` — рукописный контейнер внедрения зависимостей (подобие NestJS) для Bun. Использует `reflect-metadata` и метаданные `design:paramtypes` для разрешения зависимостей в конструкторах. Точка входа сервера: `Brix.create(AppModule.forRoot())` (`apps/server/src/main.ts`). В `@harnesys/brix` 0.1.0 входят DI, конфигурация, логирование, HTTP-адаптер (Hono), валидация Zod, OpenAPI, метрики, здоровье, стражи.

## Ключевые файлы DI

| Файл | Назначение |
|------|------------|
| `src/di/container.ts` | класс `Container`: регистрация провайдеров, singletons, разрешение токенов, обнаружение циклов, `resolveToken`, `resolveConstructorArgs`, `scopeToConsumer`, `resolveMultiProviders` |
| `src/di/module.ts` | декоратор `@Module()`, `@Global()`, интерфейсы `ModuleOptions`, `DynamicModule` |
| `src/di/injectable.ts` | `@Injectable()`, `isInjectable`, тип `UnknownClass` |
| `src/di/inject.ts` | `@Inject()` для строк/символов/фабрик, ключ `injectTokensKey` |
| `src/di/lifecycle.ts` | `runModuleInit`, `runModuleDestroy`, хуки `onModuleInit`/`onModuleDestroy` (утиная типизация) |
| `src/di/module-graph.ts` | `ModuleNode`, `buildModuleGraph`, `claim` (владелец токена), `resolveVisibility`, `canSee`, `assertExports`, `providerToken` |
| `src/di/reflector.ts` | отражение метаданных |
| `src/brix.ts` | `Brix.create(module, options)` → `BrixApp`: регистрация `ConfigModule`, `LoggingModule`, `APP_FILTER`, `MetricsRegistry`, `buildHonoWithProviders`, сервер `Bun.serve` |

## Регистрация провайдеров

Типы провайдеров (`Provider`):
- `UnknownClass` — класс (регистрируется как сам себя, токен = класс)
- `ClassProvider` — `{ provide, useClass }`
- `FactoryProvider` — `{ provide, useFactory, inject? }`
- `ValueProvider` — `{ provide, useValue }`

Модуль регистрирует `providers`, `controllers`, `imports`, `exports`, `global`.

## Разрешение зависимостей

`Container.resolve<T>(token)`:
1. Проверка видимости токена из модуля-запросителя через `ModuleGraph.canSee(requester, token)`.
2. Если токен уже в `singletons` — возвращает экземпляр.
3. Поиск определения в `definitions`; если нет — ошибка `no provider registered`.
4. Проверка цикла (`path.includes(token)`); при цикле — ошибка `Circular dependency detected`.
5. Создание экземпляра через `create` → `instantiate` → `new creatable(...args)`.
6. Аргументы конструктора разрешаются из `Reflect.getMetadata('design:paramtypes', target)` и переопределений `@Inject` (`injectTokensKey`). `count = max(len(paramtypes), len(overrides))`; для каждого индекса `i`: `token = overrides?.[i] ?? paramtypes?.[i]`. Если `token === Object` — ошибка `metadata erased the token to Object (type-only import)`.
7. Результат кешируется в `singletons`.

`ModuleGraph`:
- `ModuleNode = { ref, imports, controllers, providers, exports, global }`.
- `buildModuleGraph(roots)` — рекурсивный обход импортов.
- `claim(token, node)`: токен принадлежит ровно одному модулю; dual-ownership → ошибка. `multi`-токены (`APP_GUARD`, `HEALTH_CHECK`) освобождаются.
- `resolveVisibility`: итеративно растёт `visible[node]` из `exported[source]` до стабильности.
- `canSee(from, token)`: виден если нет владельца, владелец == `from`, или токен в `visible[from]`.

## Consumer-область

Провайдеры могут реализовывать `ConsumerScoped { forConsumer(consumerName): unknown }`. `scopeToConsumer(instance, consumerName)` вызывается для каждого аргумента конструктора: если consumer-scoped → `instance.forConsumer(name)`, иначе тот же инстанс. `Logger.child(context)` → `PinoChildLogger` с `inner.child({context})`; `forConsumer(name)` delegates to `child(name)`.

## Множественные провайдеры (multi)

`resolveMultiProviders` собирает все провайдеры с одинаковым токеном `provide` и возвращает массив экземпляров. Для `useFactory` создаются уникальные multi-токены `${token}#${index}`. Используются для `APP_GUARD` и `HEALTH_CHECK`.

## Жизненный цикл

- `ModuleInitHook.onModuleInit()`, `ModuleDestroyHook.onModuleDestroy()` (утиная типизация).
- `BrixApp.init()`: `container.resolveAll()` (все singleton'ы инстанцируются) → `runModuleInit` → лог бутстрапа (`InstanceLoader`, `RouterExplorer`).
- `BrixApp.serve()`: `Bun.serve({ port, hostname, fetch: hono.fetch, idleTimeout, websocket? })`, порт из `binding.server.port` (по умолчанию 47474), обработчики сигналов `SIGTERM`/`SIGINT`.
- `BrixApp.close()`: `shuttingDown = true`, остановка Bun-сервера с тайм-аутом, потом `runModuleDestroy` в обратном порядке, ошибки собираются в `AggregateError`.

## Важное правило: токены и импорты

Токен — любой класс, участвующий в инъекции (порт `abstract class`, адаптер `extends Port`, `@Injectable()` use-case, контроллер, Guard). **Токен никогда не импортируется через `import type`**, иначе `tsc` сотрёт класс из метаданных, контейнер увидит `Object`, и при загрузке сервера возникнет ошибка:

```
Cannot resolve dependency at index N of X: metadata erased the token to Object (type-only import). Use @Inject(Token) for DI tokens
```

Если файл экспортирует и класс-токен, и типы, импорты делятся:
```ts
import { LocalExecutorPort } from '...port.ts';          // значение (токен)
import type { CompactThreadResult } from '...port.ts';   // только тип
```

`@Inject()` используется для строк/символов, фабрик и как запасной вариант для циклических импортов.

## Проверка работоспособности

Зелёные типы / линтер / тесты не доказывают корректность DI. Единственное подтверждение — успешная загрузка сервера. После добавления или редактирования контроллера, use-case, порта, адаптера или модуля необходимо загрузить сервер и дождаться успешного перезапуска live-стенда.

## Диаграмма: DI контейнер → HTTP

```mermaid
flowchart TD
    subgraph brix["packages/brix"]
        reg[Container.register] --> resolve[resolveToken / resolveFrom]
        resolve -->|design:paramtypes + @Inject overrides| instantiate[instantiate new Class]
        instantiate --> singleton[singleton кэш]
        mg[ModuleGraph: ownerOf, canSee, multi] --> resolve
        ls[Lifecycle: onModuleInit / onModuleDestroy] --> init[BrixApp.init: resolveAll]
    end

    subgraph config["Конфигурация"]
        cfg[ConfigModule.forRoot: CONFIG токен, ConfigService factory, global]
    end

    subgraph http["HTTP (Hono:47474)"]
        mw[Middleware: requestContext / trace / observability / CORS] --> ctl[Controller handler]
        ctl --> zp[Zod pipe validateWithSchema (@Body/@Query)]
        zp --> ef[ErrorFilter → ErrorResponse]
    end

    brix --> http
    config --> brix

    style reg fill:#e1f5fe
    style singleton fill:#e1f5fe
```

## Связанные разделы

- [05-архитектура-сервера.md](./05-архитектура-сервера.md)
- [52-пакеты-brix.md](./52-пакеты-brix.md) — пакет brix целиком (HTTP, метрики, health, OpenAPI).
- [07-слой-api-rest.md](./07-слой-api-rest.md)
- [08-слой-application-use-cases.md](./08-слой-application-use-cases.md)
- [09-слой-domain-entities-ports.md](./09-слой-domain-entities-ports.md)
