import { describe, expect, test } from 'bun:test';
import type { EffectiveGrants } from '../../../../domain/addons/permissions.ts';
import { PermissionDefinitionRegistry } from '../../dispatcher/permission-definitions.ts';
import { PermissionEngine } from '../../dispatcher/permission-engine.ts';
import {
  ADDON,
  callCtx,
  FakeAccounts,
  FakeBindings,
  FakeFetch,
  NullLogger,
} from '../spec-fakes.ts';
import { evaluateAddonEgress } from './addon-egress.ts';
import { HttpHostService } from './http-service.ts';

class EgressOverrideHttpService extends HttpHostService {
  addresses: Array<{ address: string }> = [{ address: '93.184.216.34' }];
  override checkEgress(url: URL, allowedHosts: readonly string[] | null): Promise<void> {
    return Promise.resolve().then(() => evaluateAddonEgress(url, allowedHosts, this.addresses));
  }
}

const grants: EffectiveGrants = [{ id: 'http.fetch', scope: { hosts: ['api.github.com'] } }];

describe('http service egress', () => {
  function service(): EgressOverrideHttpService {
    return new EgressOverrideHttpService(
      new FakeAccounts(),
      new FakeBindings({}),
      new PermissionEngine(new PermissionDefinitionRegistry()),
      new FakeFetch(),
      new NullLogger(),
    );
  }

  test('plain http is blocked', async () => {
    await expect(
      service().methods[0]?.handle(callCtx(grants), { url: 'http://api.github.com/x' }),
    ).rejects.toMatchObject({ reason: 'permission_denied' });
  });

  test('a host outside the grant scope is blocked', async () => {
    await expect(
      service().methods[0]?.handle(callCtx(grants), { url: 'https://evil.com/x' }),
    ).rejects.toMatchObject({ reason: 'permission_denied' });
  });

  test('private and metadata addresses are blocked', async () => {
    const svc = service();
    svc.addresses = [{ address: '169.254.169.254' }];
    await expect(
      svc.methods[0]?.handle(callCtx([{ id: 'http.fetch' }]), { url: 'https://api.github.com/x' }),
    ).rejects.toMatchObject({ reason: 'permission_denied' });
  });
});

describe('http service auth injection', () => {
  const authGrants: EffectiveGrants = [{ id: 'http.fetch' }, { id: 'accounts.use' }];

  function service(
    accounts: FakeAccounts,
    bindings: FakeBindings,
    fetcher: FakeFetch,
  ): EgressOverrideHttpService {
    return new EgressOverrideHttpService(
      accounts,
      bindings,
      new PermissionEngine(new PermissionDefinitionRegistry()),
      fetcher,
      new NullLogger(),
    );
  }

  test('injects the bearer header; token never appears in the result', async () => {
    const accounts = new FakeAccounts();
    const fetcher = new FakeFetch();
    const svc = service(
      accounts,
      new FakeBindings({ [`org1:${ADDON}:github`]: ['acc-1'] }),
      fetcher,
    );
    const result = await svc.methods[0]?.handle(callCtx(authGrants), {
      url: 'https://api.github.com/user',
      auth: { connection: 'github', scheme: 'bearer' },
    });
    expect(fetcher.inits[0]?.headers.authorization).toBe('Bearer canary-token');
    expect(JSON.stringify(result)).not.toContain('canary-token');
    expect(accounts.accessCalls).toEqual(['acc-1']);
    expect(accounts.reports).toHaveLength(0);
  });

  test('auto-reports on 401', async () => {
    const accounts = new FakeAccounts();
    const fetcher = new FakeFetch();
    fetcher.status = 401;
    const svc = service(
      accounts,
      new FakeBindings({ [`org1:${ADDON}:github`]: ['acc-1'] }),
      fetcher,
    );
    const result = (await svc.methods[0]?.handle(callCtx(authGrants), {
      url: 'https://api.github.com/user',
      auth: { connection: 'github', scheme: 'bearer' },
    })) as { status: number };
    expect(result.status).toBe(401);
    expect(accounts.reports).toEqual([
      { orgId: 'org1', accountId: 'acc-1', code: 'invalid_credentials' },
    ]);
  });
});
