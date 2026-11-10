import { describe, expect, test } from 'bun:test';
import type { AddonManifest, Contribution, JsonObject } from '@harnesys/sdk';
import { z } from 'zod';
import { ContributionRegistry } from './contribution-registry.ts';
import type { FamilyModule } from './family-module.ts';
import type { Disposable, OwnerKey } from './owner.ts';
import type { ContributionChange } from './ports/contribution-registry.port.ts';

interface TestModuleOptions {
  family: string;
  failOn?: string;
  throwInSchema?: boolean;
}

function descriptorSchema(strict: boolean | undefined): z.ZodType<JsonObject> {
  return strict
    ? z.object({ name: z.string().min(1), strict: z.literal('x') })
    : z.object({ name: z.string().min(1) });
}

function fakeFamily(options: TestModuleOptions, log: string[]): FamilyModule {
  const module: FamilyModule = {
    family: options.family,
    versions: [1],
    schema: () => descriptorSchema(options.throwInSchema),
    handlers: [],
    permissions: [],
    register(owner: OwnerKey, descriptor: JsonObject): Disposable {
      const name = typeof descriptor.name === 'string' ? descriptor.name : '';
      if (options.failOn === name) {
        throw new Error(`register failed: ${name}`);
      }
      log.push(`register:${options.family}:${owner.version}:${name}`);
      return {
        dispose: () => {
          log.push(`dispose:${options.family}:${owner.version}:${name}`);
        },
      };
    },
  };
  return module;
}

function manifest(
  addonId: string,
  version: string,
  contributions: readonly Contribution[],
): AddonManifest {
  return {
    id: addonId,
    version,
    platform: 1,
    title: 'Test',
    description: 'Test',
    runtime: { entry: './dist/index.js', profile: 'restricted' },
    activation: 'lazy',
    permissions: [],
    connections: [],
    contributions: [...contributions],
  };
}

const owner = (orgId: string, version: string): OwnerKey => ({
  orgId,
  addonId: 'acme.test',
  version,
});

function snapshot(registry: ContributionRegistry, orgId: string): string {
  const families = ['tool-pack', 'trigger', 'job'];
  return families
    .map((family) =>
      JSON.stringify(
        registry
          .contributions(orgId, family)
          .map((record) => [record.owner.version, record.contributionId, record.descriptor]),
      ),
    )
    .join('|');
}

describe('ContributionRegistry.activate', () => {
  test('registers contributions of every family', () => {
    const log: string[] = [];
    const registry = new ContributionRegistry([
      fakeFamily({ family: 'tool-pack' }, log),
      fakeFamily({ family: 'trigger' }, log),
    ]);
    const key = owner('org-1', '1.0.0');
    registry.activate(
      key,
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'pack-a' } },
        { id: 'trg', family: 'trigger', descriptor: { name: 'trigger-a' } },
      ]),
    );
    expect(log).toEqual(['register:tool-pack:1.0.0:pack-a', 'register:trigger:1.0.0:trigger-a']);
    expect(
      registry.contributions('org-1', 'tool-pack').map((record) => record.contributionId),
    ).toEqual(['pack']);
    expect(
      registry.contributions('org-1', 'trigger').map((record) => record.contributionId),
    ).toEqual(['trg']);
  });

  test('first register error rolls back previous registrations', () => {
    const log: string[] = [];
    const registry = new ContributionRegistry([
      fakeFamily({ family: 'tool-pack' }, log),
      fakeFamily({ family: 'trigger', failOn: 'trigger-a' }, log),
    ]);
    expect(() =>
      registry.activate(
        owner('org-1', '1.0.0'),
        manifest('acme.test', '1.0.0', [
          { id: 'pack', family: 'tool-pack', descriptor: { name: 'pack-a' } },
          { id: 'trg', family: 'trigger', descriptor: { name: 'trigger-a' } },
        ]),
      ),
    ).toThrow('register failed');
    expect(log).toEqual(['register:tool-pack:1.0.0:pack-a', 'dispose:tool-pack:1.0.0:pack-a']);
    expect(registry.contributions('org-1', 'tool-pack')).toEqual([]);
  });

  test('unknown required family fails, optional is skipped', () => {
    const registry = new ContributionRegistry([]);
    expect(() =>
      registry.activate(
        owner('org-1', '1.0.0'),
        manifest('acme.test', '1.0.0', [{ id: 'pack', family: 'tool-pack', descriptor: {} }]),
      ),
    ).toThrow();
    registry.activate(
      owner('org-1', '1.1.0'),
      manifest('acme.test', '1.1.0', [
        { id: 'pack', family: 'tool-pack', optional: true, descriptor: {} },
      ]),
    );
    expect(registry.contributions('org-1', 'tool-pack')).toEqual([]);
  });

  test('invalid descriptor fails', () => {
    const log: string[] = [];
    const registry = new ContributionRegistry([
      fakeFamily({ family: 'tool-pack', throwInSchema: true }, log),
    ]);
    expect(() =>
      registry.activate(
        owner('org-1', '1.0.0'),
        manifest('acme.test', '1.0.0', [
          { id: 'pack', family: 'tool-pack', descriptor: { name: '' } },
        ]),
      ),
    ).toThrow();
    expect(log).toEqual([]);
  });

  test('double activation is rejected', () => {
    const registry = new ContributionRegistry([fakeFamily({ family: 'tool-pack' }, [])]);
    const key = owner('org-1', '1.0.0');
    const active = manifest('acme.test', '1.0.0', [
      { id: 'pack', family: 'tool-pack', descriptor: { name: 'a' } },
    ]);
    registry.activate(key, active);
    expect(() => registry.activate(key, active)).toThrow();
  });
});

describe('ContributionRegistry.deactivate', () => {
  test('disposes in reverse order and is idempotent', () => {
    const log: string[] = [];
    const registry = new ContributionRegistry([
      fakeFamily({ family: 'tool-pack' }, log),
      fakeFamily({ family: 'trigger' }, log),
      fakeFamily({ family: 'job' }, log),
    ]);
    const key = owner('org-1', '1.0.0');
    registry.activate(
      key,
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'p' } },
        { id: 'trg', family: 'trigger', descriptor: { name: 't' } },
        { id: 'job', family: 'job', descriptor: { name: 'j' } },
      ]),
    );
    registry.deactivate(key);
    expect(log.slice(-3)).toEqual([
      'dispose:job:1.0.0:j',
      'dispose:trigger:1.0.0:t',
      'dispose:tool-pack:1.0.0:p',
    ]);
    registry.deactivate(key);
    expect(log.filter((entry) => entry.startsWith('dispose')).length).toBe(3);
  });

  test('leak test: snapshot after deactivate equals snapshot before activate', () => {
    const log: string[] = [];
    const registry = new ContributionRegistry([
      fakeFamily({ family: 'tool-pack' }, log),
      fakeFamily({ family: 'trigger' }, log),
    ]);
    const before = snapshot(registry, 'org-1');
    const key = owner('org-1', '1.0.0');
    registry.activate(
      key,
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'p' } },
        { id: 'trg', family: 'trigger', descriptor: { name: 't' } },
      ]),
    );
    expect(snapshot(registry, 'org-1')).not.toBe(before);
    registry.deactivate(key);
    expect(snapshot(registry, 'org-1')).toBe(before);
  });
});

describe('ContributionRegistry.swap', () => {
  test('new version registered fully before old is disposed', () => {
    const log: string[] = [];
    const registry = new ContributionRegistry([fakeFamily({ family: 'tool-pack' }, log)]);
    registry.activate(
      owner('org-1', '1.0.0'),
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'old' } },
      ]),
    );
    registry.swap(
      owner('org-1', '1.0.0'),
      owner('org-1', '1.1.0'),
      manifest('acme.test', '1.1.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'new' } },
      ]),
    );
    expect(log).toEqual([
      'register:tool-pack:1.0.0:old',
      'register:tool-pack:1.1.0:new',
      'dispose:tool-pack:1.0.0:old',
    ]);
    const records = registry.contributions('org-1', 'tool-pack');
    const record = records[0];
    expect(records.length).toBe(1);
    expect(record?.descriptor).toEqual({ name: 'new' });
  });

  test('swap failure keeps the old registration and disposes the partial new one', () => {
    const log: string[] = [];
    const registry = new ContributionRegistry([
      fakeFamily({ family: 'tool-pack' }, log),
      fakeFamily({ family: 'trigger', failOn: 'new-trg' }, log),
    ]);
    registry.activate(
      owner('org-1', '1.0.0'),
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'old' } },
      ]),
    );
    expect(() =>
      registry.swap(
        owner('org-1', '1.0.0'),
        owner('org-1', '1.1.0'),
        manifest('acme.test', '1.1.0', [
          { id: 'pack', family: 'tool-pack', descriptor: { name: 'new' } },
          { id: 'trg', family: 'trigger', descriptor: { name: 'new-trg' } },
        ]),
      ),
    ).toThrow('register failed');
    const records = registry.contributions('org-1', 'tool-pack');
    const record = records[0];
    expect(records.length).toBe(1);
    expect(record?.descriptor).toEqual({ name: 'old' });
    expect(registry.contributions('org-1', 'trigger')).toEqual([]);
  });

  test('swap with the same OwnerKey is rejected', () => {
    const registry = new ContributionRegistry([]);
    expect(() =>
      registry.swap(
        owner('org-1', '1.0.0'),
        owner('org-1', '1.0.0'),
        manifest('acme.test', '1.0.0', []),
      ),
    ).toThrow();
  });
});

describe('ContributionRegistry.onChange', () => {
  test('fires for activate, deactivate and swap', () => {
    const changes: ContributionChange[] = [];
    const registry = new ContributionRegistry([fakeFamily({ family: 'tool-pack' }, [])]);
    registry.onChange('org-1', 'tool-pack', (change) => changes.push(change));
    registry.activate(
      owner('org-1', '1.0.0'),
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'a' } },
      ]),
    );
    registry.deactivate(owner('org-1', '1.0.0'));
    registry.activate(
      owner('org-1', '1.0.0'),
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'a' } },
      ]),
    );
    registry.swap(
      owner('org-1', '1.0.0'),
      owner('org-1', '2.0.0'),
      manifest('acme.test', '2.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'b' } },
      ]),
    );
    expect(changes.map((change) => change.kind)).toEqual([
      'activated',
      'deactivated',
      'activated',
      'activated',
      'deactivated',
      'swapped',
    ]);
  });

  test('unsubscribe stops firing and other orgs are not notified', () => {
    const changes: ContributionChange[] = [];
    const registry = new ContributionRegistry([fakeFamily({ family: 'tool-pack' }, [])]);
    const unsubscribe = registry.onChange('org-1', 'tool-pack', (change) => changes.push(change));
    unsubscribe();
    registry.activate(
      owner('org-1', '1.0.0'),
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'a' } },
      ]),
    );
    registry.activate(
      owner('org-2', '1.0.0'),
      manifest('acme.test', '1.0.0', [
        { id: 'pack', family: 'tool-pack', descriptor: { name: 'a' } },
      ]),
    );
    expect(changes).toEqual([]);
  });
});
