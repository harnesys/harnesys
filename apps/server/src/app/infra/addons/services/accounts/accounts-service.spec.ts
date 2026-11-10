import { describe, expect, test } from 'bun:test';
import type { EffectiveGrants } from '../../../../domain/addons/permissions.ts';
import type { OrgAddonRow } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import { OrgAddonRepositoryPort } from '../../../../domain/addons/ports/org-addon-repository.port.ts';
import { MetricsPort } from '../../../../domain/metrics/metrics.port.ts';
import { HostDispatcher } from '../../dispatcher/host-dispatcher.ts';
import { InMemoryHostServiceRegistry } from '../../dispatcher/host-service-registry.adapter.ts';
import { InstanceGenerationPort } from '../../dispatcher/instance-generation.port.ts';
import { PermissionDefinitionRegistry } from '../../dispatcher/permission-definitions.ts';
import { TokenBucketRateLimiter } from '../../dispatcher/rate-limit.ts';
import { ADDON, callCtx, FakeAccounts, FakeAudit, FakeBindings, ZeroClock } from '../spec-fakes.ts';
import { AccountsHostService } from './accounts-service.ts';

describe('accounts service', () => {
  const bindings = new FakeBindings({ 'org1:acme.test:github': ['acc-1', 'acc-2'] });

  test('lists bound accounts without secrets', async () => {
    const svc = new AccountsHostService(new FakeAccounts(), bindings, new FakeAudit());
    const result = (await svc.methods[0]?.handle(callCtx(), { connection: 'github' })) as {
      accounts: Array<{ accountId: string; status: string }>;
    };
    expect(result.accounts).toHaveLength(2);
    expect(result.accounts[0]).toMatchObject({ accountId: 'acc-1', status: 'connected' });
    expect(JSON.stringify(result)).not.toContain('credentials');
  });

  test('access returns credentials and audits the issuance', async () => {
    const audit = new FakeAudit();
    const svc = new AccountsHostService(new FakeAccounts(), bindings, audit);
    await expect(
      svc.methods[2]?.handle(callCtx(), { connection: 'github', accountId: 'acc-1' }),
    ).resolves.toEqual({
      credentials: { token: 'canary-token' },
      expiresAt: '2024-10-27T03:33:20.000Z',
    });
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0]?.action).toBe('addon.accounts_access');
  });

  test('access rejects an unbound account', async () => {
    const svc = new AccountsHostService(new FakeAccounts(), bindings, new FakeAudit());
    await expect(
      svc.methods[2]?.handle(callCtx(), { connection: 'github', accountId: 'acc-9' }),
    ).rejects.toMatchObject({ reason: 'not_found' });
  });

  test('access without accountId and several bindings → invalid_params', async () => {
    const svc = new AccountsHostService(new FakeAccounts(), bindings, new FakeAudit());
    await expect(svc.methods[2]?.handle(callCtx(), { connection: 'github' })).rejects.toMatchObject(
      {
        reason: 'invalid_params',
      },
    );
  });

  test('report validates the error code', async () => {
    const accounts = new FakeAccounts();
    const svc = new AccountsHostService(accounts, bindings, new FakeAudit());
    await svc.methods[1]?.handle(callCtx(), {
      connection: 'github',
      accountId: 'acc-1',
      code: 'revoked',
    });
    expect(accounts.reports).toEqual([{ orgId: 'org1', accountId: 'acc-1', code: 'revoked' }]);
    await expect(
      svc.methods[1]?.handle(callCtx(), {
        connection: 'github',
        accountId: 'acc-1',
        code: 'made-up',
      }),
    ).rejects.toMatchObject({ reason: 'invalid_params' });
  });
});

describe('dispatcher enforces the high accounts.credentials grant', () => {
  function dispatcher(grants: EffectiveGrants): HostDispatcher {
    const registry = new InMemoryHostServiceRegistry(new PermissionDefinitionRegistry());
    registry.register(
      new AccountsHostService(
        new FakeAccounts(),
        new FakeBindings({ 'org1:acme.test:github': ['acc-1'] }),
        new FakeAudit(),
      ),
    );
    return new HostDispatcher(
      registry,
      new FakeRepo(grants),
      new ZeroClock(),
      new NoopMetrics(),
      new FakeAudit(),
      new TokenBucketRateLimiter(new ZeroClock()),
      new AlwaysCurrentGeneration(),
    );
  }

  test('accounts.access is denied without the high grant', async () => {
    await expect(
      dispatcher([]).dispatch(specTarget(), 'accounts.access', { connection: 'github' }),
    ).rejects.toMatchObject({ reason: 'permission_denied' });
  });

  test('accounts.access passes with the grant', async () => {
    await expect(
      dispatcher([{ id: 'accounts.credentials' }]).dispatch(specTarget(), 'accounts.access', {
        connection: 'github',
      }),
    ).resolves.toMatchObject({ credentials: { token: 'canary-token' } });
  });
});

class NoopMetrics extends MetricsPort {
  override increment(): void {}
  override observe(): void {}
}

class AlwaysCurrentGeneration extends InstanceGenerationPort {
  override current(): number | null {
    return null;
  }
}

class FakeRepo extends OrgAddonRepositoryPort {
  private readonly row: OrgAddonRow;

  constructor(grants: EffectiveGrants) {
    super();
    this.row = {
      orgId: 'org1',
      addonId: ADDON,
      version: '1.0.0',
      enabled: true,
      grantsJson: JSON.stringify(grants),
      grantsDigest: 'digest',
      configJson: '{}',
      health: 'running',
      lastError: null,
      createdAt: '',
      updatedAt: '',
    };
  }
  override find(): OrgAddonRow | null {
    return this.row;
  }
  override list(): OrgAddonRow[] {
    return [this.row];
  }
  override listAll(): OrgAddonRow[] {
    return [this.row];
  }
  override upsert(): void {}
  override setEnabled(): void {}
  override updateGrants(): void {}
  override updateConfig(): void {}
  override updateHealth(): void {}
  override remove(): void {}
}

function specTarget(): {
  orgId: string;
  addonId: string;
  instanceId: string;
  generation: number;
  correlationId: string;
} {
  return {
    orgId: 'org1',
    addonId: ADDON,
    instanceId: 'inst1',
    generation: 1,
    correlationId: 'corr-1',
  };
}
