import { describe, expect, it } from 'bun:test';
import type { AccountKindDescriptor, AppKindDescriptor } from '../../domain/apps/app-kind.port.ts';
import { AppKindProviderPort } from '../../domain/apps/app-kind.port.ts';
import { AppKindUnknownException } from '../../domain/apps/apps.error.ts';
import { AppKindRegistryAdapter } from './app-kind-registry.adapter.ts';

class FakeProvider extends AppKindProviderPort {
  constructor(
    private readonly app: AppKindDescriptor,
    private readonly accounts: AccountKindDescriptor[],
  ) {
    super();
  }

  override descriptor(): AppKindDescriptor {
    return this.app;
  }

  override accountKinds(): AccountKindDescriptor[] {
    return this.accounts;
  }
}

function appKind(kind: string): AppKindDescriptor {
  return { kind, label: `${kind} label`, description: '', fields: [] };
}

function accountKind(kind: string): AccountKindDescriptor {
  return { kind, label: `${kind} label`, description: '', fields: [] };
}

const google = new FakeProvider(appKind('google-cloud-project'), [accountKind('google-account')]);
const github = new FakeProvider(appKind('github-app'), []);
const telegram = new FakeProvider(appKind('telegram-mtproto'), [accountKind('telegram-bot')]);

const registry = new AppKindRegistryAdapter(google, github, telegram);

describe('AppKindRegistryAdapter', () => {
  it('lists app kinds in provider order', () => {
    expect(registry.list().map((descriptor) => descriptor.kind)).toEqual([
      'google-cloud-project',
      'github-app',
      'telegram-mtproto',
    ]);
  });

  it('finds and requires an app kind', () => {
    expect(registry.find('github-app')?.label).toBe('github-app label');
    expect(registry.require('telegram-mtproto').kind).toBe('telegram-mtproto');
    expect(registry.find('nope')).toBeNull();
    expect(() => registry.require('nope')).toThrow(AppKindUnknownException);
  });

  it('does not treat an account kind as an app kind', () => {
    expect(registry.find('google-account')).toBeNull();
    expect(() => registry.require('google-account')).toThrow(AppKindUnknownException);
  });

  it('resolves the provider behind a declared kind', () => {
    expect(registry.providerOf('google-cloud-project')).toBe(google);
    expect(registry.providerOf('telegram-bot')).toBe(telegram);
    expect(registry.requireProvider('github-app')).toBe(github);
    expect(registry.providerOf('nope')).toBeNull();
    expect(() => registry.requireProvider('nope')).toThrow(AppKindUnknownException);
  });

  it('aggregates account kinds from every provider', () => {
    expect(registry.accountKinds().map((descriptor) => descriptor.kind)).toEqual([
      'google-account',
      'telegram-bot',
    ]);
  });

  it('finds and requires an account kind', () => {
    expect(registry.accountDescriptor('google-account')?.label).toBe('google-account label');
    expect(registry.requireAccountDescriptor('telegram-bot').kind).toBe('telegram-bot');
    expect(registry.accountDescriptor('nope')).toBeNull();
    expect(() => registry.requireAccountDescriptor('nope')).toThrow(AppKindUnknownException);
  });
});
