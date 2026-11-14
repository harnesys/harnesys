import { describe, expect, test } from 'bun:test';
import { PROTOCOL_METHODS, protocolMap } from '@harnesys/sdk';
import {
  hostMatchesPattern,
  PERMISSION_DEFINITIONS,
  PermissionDefinitionRegistry,
} from './permission-definitions.ts';

const registry = new PermissionDefinitionRegistry();

describe('permission definitions registry', () => {
  test('every permission referenced by the protocol map is defined', () => {
    const referenced = new Set(
      PROTOCOL_METHODS.map(
        (method) => protocolMap[method as keyof typeof protocolMap]?.permission,
      ).filter((permission): permission is string => typeof permission === 'string'),
    );
    for (const id of referenced) {
      expect(registry.get(id), `missing definition for '${id}'`).toBeDefined();
    }
  });

  test('baseline permissions are marked baseline and low risk', () => {
    for (const id of ['config.read', 'log', 'db', 'secrets.own', 'events.emit.own']) {
      const definition = registry.get(id);
      expect(definition, id).toBeDefined();
      expect(definition?.baseline).toBe(true);
      expect(definition?.risk).toBe('low');
    }
  });

  test('risk levels match the §7.2 table', () => {
    expect(registry.get('http.fetch')?.risk).toBe('medium');
    expect(registry.get('accounts.use')?.risk).toBe('medium');
    expect(registry.get('accounts.credentials')?.risk).toBe('high');
    expect(registry.get('routes.public')?.risk).toBe('high');
    expect(registry.get('runs.dispatch')?.risk).toBe('medium');
    expect(registry.get('threads.create')?.risk).toBe('medium');
    expect(registry.get('events.subscribe')?.risk).toBe('low');
    expect(registry.get('bridge.inbound')?.risk).toBe('medium');
    expect(registry.get('lifecycle.resident')?.risk).toBe('medium');
    expect(registry.get('trigger')?.risk).toBe('medium');
    expect(registry.get('worker')?.risk).toBe('medium');
  });

  test('definitions are unique by id', () => {
    const ids = PERMISSION_DEFINITIONS.map((definition) => definition.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('describe returns consent text', () => {
    expect(registry.get('db')?.describe()).toContain('database');
    expect(registry.get('http.fetch')?.describe({ hosts: ['api.github.com'] })).toContain(
      'api.github.com',
    );
  });
});

describe('http.fetch covers matrix', () => {
  const covers = registry.get('http.fetch')?.covers ?? (() => false);

  test('unscoped grant covers any needed hosts', () => {
    expect(covers(undefined, { hosts: ['example.com'] })).toBe(true);
  });

  test('scoped grant does not cover unspecified needed hosts', () => {
    expect(covers({ hosts: ['example.com'] }, undefined)).toBe(false);
  });

  test('exact host match', () => {
    expect(covers({ hosts: ['api.github.com'] }, { hosts: ['api.github.com'] })).toBe(true);
    expect(covers({ hosts: ['api.github.com'] }, { hosts: ['evil.com'] })).toBe(false);
  });

  test('suffix pattern *.github.com covers subdomains and the bare domain', () => {
    expect(covers({ hosts: ['*.github.com'] }, { hosts: ['api.github.com'] })).toBe(true);
    expect(covers({ hosts: ['*.github.com'] }, { hosts: ['github.com'] })).toBe(true);
    expect(covers({ hosts: ['*.github.com'] }, { hosts: ['github.com.evil.io'] })).toBe(false);
  });

  test('every needed host must be covered', () => {
    expect(covers({ hosts: ['a.com', 'b.com'] }, { hosts: ['a.com', 'b.com'] })).toBe(true);
    expect(covers({ hosts: ['a.com'] }, { hosts: ['a.com', 'b.com'] })).toBe(false);
  });
});

describe('accounts covers matrix', () => {
  const covers = registry.get('accounts.use')?.covers ?? (() => false);

  test('unscoped grant covers any connection', () => {
    expect(covers(undefined, { connections: ['github'] })).toBe(true);
  });

  test('scoped grant covers only listed connections', () => {
    expect(covers({ connections: ['github', 'slack'] }, { connections: ['github'] })).toBe(true);
    expect(covers({ connections: ['github'] }, { connections: ['slack'] })).toBe(false);
    expect(covers({ connections: ['github'] }, undefined)).toBe(false);
  });
});

describe('events.subscribe covers matrix', () => {
  const covers = registry.get('events.subscribe')?.covers ?? (() => false);

  test('pattern list inclusion', () => {
    expect(covers({ patterns: ['thread.*'] }, { patterns: ['thread.*'] })).toBe(true);
    expect(covers({ patterns: ['thread.*'] }, { patterns: ['run.*'] })).toBe(false);
  });
});

describe('hostMatchesPattern', () => {
  test('exact, suffix, and wildcard semantics', () => {
    expect(hostMatchesPattern('api.github.com', 'api.github.com')).toBe(true);
    expect(hostMatchesPattern('api.github.com', '*.github.com')).toBe(true);
    expect(hostMatchesPattern('github.com', '*.github.com')).toBe(true);
    expect(hostMatchesPattern('api.github.com', 'example.com')).toBe(false);
    expect(hostMatchesPattern('anything.dev', '*')).toBe(true);
    expect(hostMatchesPattern('api.github.com', '*.com')).toBe(true);
  });

  test('match is case insensitive', () => {
    expect(hostMatchesPattern('API.GitHub.com', 'api.github.com')).toBe(true);
  });
});
