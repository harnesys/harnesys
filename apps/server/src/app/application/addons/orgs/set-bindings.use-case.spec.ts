import { describe, expect, test } from 'bun:test';
import { AddonException } from '../../../domain/addons/errors.ts';
import type { AccountView } from '../../../domain/apps/records.ts';
import {
  FakeAccounts,
  FakeAudit,
  InMemoryBindings,
  InMemoryCatalog,
  InMemoryOrgAddons,
  NullLogger,
  testManifest,
} from '../addons.fakes.ts';
import { SetBindingsUseCase } from './set-bindings.use-case.ts';

const ACTOR = { kind: 'user' as const, id: 'admin' };

function account(id: string, kind: string, scopes: string[]): AccountView {
  return {
    id,
    appId: null,
    kind,
    externalAccountId: id,
    partition: '',
    label: id,
    status: 'connected',
    lastError: null,
    scopes,
    expiresAt: null,
    config: {},
    secretFields: [],
    endpoints: {},
    verifiedAt: null,
    createdAt: 't0',
    updatedAt: 't0',
  };
}

function build(cardinality: 'one' | 'many' = 'many') {
  const { pkg } = testManifest({
    connections: [
      {
        id: 'main',
        label: { default: 'Main' },
        accountKinds: ['chat'],
        scopes: ['s1'],
        cardinality,
      },
    ],
  });
  const catalog = new InMemoryCatalog();
  catalog.packages.set(`acme.tool@1.0.0`, pkg);
  const orgAddons = new InMemoryOrgAddons();
  orgAddons.upsert({
    orgId: 'org1',
    addonId: 'acme.tool',
    version: '1.0.0',
    enabled: true,
    grantsJson: '[]',
    grantsDigest: 'd',
    configJson: '{}',
    health: 'stopped',
    lastError: null,
    createdAt: 't0',
    updatedAt: 't0',
  });
  const bindings = new InMemoryBindings();
  const accounts = new FakeAccounts();
  accounts.accounts.set('a1', account('a1', 'chat', ['s1', 's2']));
  accounts.accounts.set('a2', account('a2', 'chat', ['s1']));
  accounts.accounts.set('a3', account('a3', 'chat', []));
  accounts.accounts.set('a4', account('a4', 'mail', ['s1']));
  const useCase = new SetBindingsUseCase(
    catalog,
    orgAddons,
    bindings,
    accounts,
    new FakeAudit(),
    new NullLogger(),
  );
  return { useCase, bindings };
}

async function run(useCase: SetBindingsUseCase, accountIds: string[], connectionId = 'main') {
  return await useCase.execute({
    orgId: 'org1',
    addonId: 'acme.tool',
    connectionId,
    accountIds,
    actor: ACTOR,
  });
}

describe('SetBindingsUseCase', () => {
  test('binds accounts matching kind and scopes', async () => {
    const { useCase, bindings } = build();
    await run(useCase, ['a1', 'a2']);
    expect(bindings.accountsFor('org1', 'acme.tool', 'main').map((row) => row.accountId)).toEqual([
      'a1',
      'a2',
    ]);
  });

  test('rejects account from another organization', async () => {
    const { useCase } = build();
    await expect(run(useCase, ['ghost'])).rejects.toThrow('does not belong');
  });

  test('rejects wrong account kind', async () => {
    const { useCase } = build();
    await expect(run(useCase, ['a4'])).rejects.toThrow(AddonException);
  });

  test('rejects missing scopes', async () => {
    const { useCase } = build();
    await expect(run(useCase, ['a3'])).rejects.toThrow('lacks scopes');
  });

  test('rejects multiple accounts for one-cardinality connection', async () => {
    const { useCase } = build('one');
    await expect(run(useCase, ['a1', 'a2'])).rejects.toThrow('binds one account');
  });

  test('rejects unknown connection id', async () => {
    const { useCase } = build();
    await expect(run(useCase, ['a1'], 'nope')).rejects.toThrow('not declared');
  });
});
