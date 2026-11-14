import { describe, expect, test } from 'bun:test';
import { silentLogger } from '../../application/approvals/approval-fakes.ts';
import type {
  AccountKindModule,
  AppKindModule,
  ProviderModule,
} from '../../domain/apps/provider-module.ts';
import { ProviderRegistryAdapter } from './provider-registry.adapter.ts';
import { validateRegistry } from './provider-validation.ts';
import { acmeProvider } from './providers/__fixtures__/acme/index.ts';
import { providerModules } from './providers/index.ts';

const KIND_PATTERN = /^[a-z][a-z0-9-]*$/;

function conform(module: ProviderModule): void {
  const providerId = module.descriptor.id;
  for (const kind of module.appKinds) {
    expect(kind.descriptor.kind).toMatch(KIND_PATTERN);
    expect(kind.descriptor.kind.startsWith(`${providerId}-`)).toBe(true);
    expectAppKind(kind);
  }
  for (const kind of module.accountKinds) {
    expect(kind.descriptor.kind).toMatch(KIND_PATTERN);
    expect(kind.descriptor.kind.startsWith(`${providerId}-`)).toBe(true);
    expectAccountKind(kind);
  }
  expectKindsUniqueAndConformReferencedApps(module);
}

function expectAppKind(kind: AppKindModule): void {
  expect(new Set(kind.secrets).size).toBe(kind.secrets.length);
  expectFields(kind.descriptor.fields, kind.secrets);
  for (const endpoint of kind.descriptor.endpoints) {
    if (endpoint === 'webhookUrl') {
      expect(kind.webhook).toBeDefined();
    }
  }
  expect(kind.descriptor.endpoints.includes('webhookUrl') && kind.webhook !== undefined).toBe(
    kind.descriptor.endpoints.includes('webhookUrl') && kind.webhook !== undefined,
  );
  if (kind.descriptor.endpoints.includes('webhookUrl')) {
    expect(kind.webhook).toBeDefined();
  } else {
    expect(kind.webhook).toBeUndefined();
  }
}

function expectAccountKind(kind: AccountKindModule): void {
  expect(new Set(kind.secrets).size).toBe(kind.secrets.length);
  expectFields(kind.descriptor.inputs, kind.secrets);
  for (const required of kind.descriptor.requiresApp) {
    expect(typeof required).toBe('string');
  }
  const optionKeys = new Set(kind.descriptor.scopes.options.map((option) => option.key));
  for (const scope of kind.descriptor.scopes.defaults) {
    expect(optionKeys.has(scope)).toBe(true);
  }
  for (const key of kind.descriptor.access.keys) {
    if (kind.descriptor.access.source === 'stored') {
      expect(kind.secrets.includes(key)).toBe(true);
    } else {
      expect(kind.access).toBeDefined();
    }
  }
  if (kind.descriptor.endpoints.includes('webhookUrl')) {
    expect(kind.webhook).toBeDefined();
  } else {
    expect(kind.webhook).toBeUndefined();
  }
}

function expectFields(
  fields: readonly {
    key: string;
    type: string;
    generated?: boolean;
    pattern?: { regex: string };
  }[],
  secrets: readonly string[],
): void {
  expect(new Set(fields.map((field) => field.key)).size).toBe(fields.length);
  for (const field of fields) {
    if (field.pattern) {
      const regex = field.pattern.regex;
      expect(() => new RegExp(regex)).not.toThrow();
    }
    if (field.generated) {
      expect(field.type).toBe('secret');
      expect(secrets.includes(field.key)).toBe(true);
    }
    if (field.type === 'secret') {
      expect(secrets.includes(field.key)).toBe(true);
    }
  }
}

function expectKindsUniqueAndConformReferencedApps(module: ProviderModule): void {
  const kinds = new Set<string>();
  for (const kind of [...module.accountKinds, ...module.appKinds]) {
    expect(kinds.has(kind.descriptor.kind)).toBe(false);
    kinds.add(kind.descriptor.kind);
    const referenced = 'requiresApp' in kind.descriptor ? kind.descriptor.requiresApp : [];
    for (const appKind of referenced) {
      expect(module.appKinds.some((candidate) => candidate.descriptor.kind === appKind)).toBe(true);
    }
  }
}

describe('provider registry conformance', () => {
  const registry = validateRegistry(providerModules);

  test('built-in providers pass the internal validators', () => {
    expect([...registry.appKinds.keys()]).toEqual(
      providerModules.flatMap((module) => module.appKinds.map((kind) => kind.descriptor.kind)),
    );
    for (const module of providerModules) {
      conform(module);
    }
  });

  test('ensures kind kinds and prefixes across providers are unique', () => {
    const all = providerModules.flatMap((module) => [
      ...module.appKinds.map((kind) => kind.descriptor.kind),
      ...module.accountKinds.map((kind) => kind.descriptor.kind),
    ]);
    expect(new Set(all).size).toBe(all.length);
  });

  test('catalog capabilities match handler presence for known providers', () => {
    const catalog = new ProviderRegistryAdapter(silentLogger()).catalog();
    for (const catalogProvider of catalog.providers) {
      const module = providerModules.find(
        (candidate) => candidate.descriptor.id === catalogProvider.id,
      );
      expect(module).toBeDefined();
      if (!module) {
        continue;
      }
      for (const descriptor of catalogProvider.appKinds) {
        const kind = module.appKinds.find(
          (candidate) => candidate.descriptor.kind === descriptor.kind,
        );
        expect(kind).toBeDefined();
        expect(descriptor.capabilities.setup).toBe(kind?.setup !== undefined);
        expect(descriptor.capabilities.verify).toBe(kind?.verify !== undefined);
        expect(descriptor.capabilities.webhook).toBe(kind?.webhook !== undefined);
      }
      for (const descriptor of catalogProvider.accountKinds) {
        const kind = module.accountKinds.find(
          (candidate) => candidate.descriptor.kind === descriptor.kind,
        );
        expect(kind).toBeDefined();
        expect(descriptor.capabilities.revoke).toBe(kind?.revoke !== undefined);
        expect(descriptor.capabilities.webhook).toBe(kind?.webhook !== undefined);
      }
    }
  });

  test('acme fixture passes the same conformance checks as a registered provider', () => {
    const acme = validateRegistry([acmeProvider()]);
    const module = acme.modules.at(0);
    if (!module) {
      expect.unreachable();
    }
    expect(module.descriptor.id).toBe('acme');
    expect(module.appKinds.map((kind) => kind.descriptor.kind)).toEqual(['acme-app']);
    expect(module.accountKinds.map((kind) => kind.descriptor.kind)).toEqual([
      'acme-oauth',
      'acme-device',
      'acme-key',
    ]);
    conform(module);
  });
});
