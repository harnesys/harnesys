# @harnesys/brix

A stripped-down Nest-style framework for Bun on top of Hono: decorators, module-based dependency injection, guards, config, health probes, and an error contract.

## What's inside

- **DI container** (`di/`) — resolves dependencies from `design:paramtypes` metadata at boot. Tokens are classes: ports (`abstract class`), `@Injectable()` use-cases, adapters, controllers, guards. `@Inject()` supports strings/symbols, factories, and circular-import fallbacks.
- **Modules** — `forRoot(config)` composition, `providers: [{ provide: Port, useClass: Adapter }]`.
- **HTTP** (`http/`) — Hono integration, `@Body`/`@Query`/`@OrgId` parameter handling.
- **Guards** (`guards/`) — global `APP_GUARD`-style request guards.
- **Config** (`config/`) — `@Configuration()` access to typed app config.
- **Errors** (`errors/`) — shared `ErrorResponse` contract: `{ statusCode, errorCode, message, path, timestamp, traceId?, details? }`.
- **Health** (`health/`) — `GET /health/live`, `GET /health/ready`, `GET /metrics`.

## Caveat

DI tokens must be value-imported (never `import type`): a type-only import erases the class from `design:paramtypes`, and the container fails at boot with `Cannot resolve dependency at index N of X`. Neither `tsc` nor lint catches this — only server boot does.

## Development

```bash
bun test packages/brix    # container, lifecycle, config, guards, http specs
bun run typecheck
```
