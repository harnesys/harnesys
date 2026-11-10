# Testing

`@harnesys/sdk/testing` runs the real SDK runtime against a fake host — no Harnesys
installation needed.

```ts
import { describe, expect, test } from 'bun:test';
import { createFakeHost, createFakeDb, validManifest } from '@harnesys/sdk/testing';
import { addon } from '../src/index';

describe('greeter', () => {
  test('greet tool writes and returns', async () => {
    const db = createFakeDb();
    const host = createFakeHost({
      definition: addon,
      manifest: validManifest({
        permissions: [{ id: 'db', reason: 'store calls' }],
      }),
      config: { greeting: 'Hi' },
      grants: [{ id: 'db' }, { id: 'log' }],
    });

    const result = await host.callTool('pack', 'greet', { name: 'Ada' });
    expect(result).toEqual({ text: 'Hello, Ada!' });
    expect(host.logs.some((l) => l.message === 'greeting')).toBe(true);
    host.close();
  });
});
```

## FakeHost API

- Construction options: `definition`, `manifest`, `config?`, `secrets?`, `accounts?`,
  `http?` (fake HTTP handler), `grants?` (permission enforcement — missing grants throw
  `permission_denied`), `now?` (clock).
- Calls: `callTool(pack, tool, input)`, `callRoute(routeId, request)`,
  `runJob(jobId)`, `startTrigger/stopTrigger`, `startWorker`, `emit(event, hookId)`,
  `notify`, `deliver`.
- Sinks to assert on: `logs`, `emitted`, `dispatchedRuns`, `createdThreads`,
  `accountReports`, `workerReports`, `inboundMessages`, `progress`.
- `service` — direct host-service client (simulate context calls),
  `advanceTime(ms)` — drive timers/jobs, `close()`.

## Fake DB

`createFakeDb()` is an in-memory SQLite with the same SQL authorizer as the host
(`guardSql`, `SqlAuthorizerError`) — quota and statement rules are enforced, so tests
catch SQL that the host would reject.

## Fixtures

`validManifest()` returns a valid baseline manifest to mutate per test;
`demoDefinition()` is a ready-made definition covering every handler group.

## What is not covered by the fake host

- Supervisor behavior (restart, quarantine, pings), transport spawning, real
  egress policy, secret-store namespaces, per-org quota accounting, migrations
  (run them against a real file DB if needed).
- Keep tests pure per repo policy: no network, no files, `bun test` only.
