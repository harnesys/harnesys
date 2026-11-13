import { describe, expect, test } from 'bun:test';
import type { AddonConnectionView } from '@harnesys/contracts';
import {
  optionsFromConnections,
  optionsFromRouteBody,
  routeOptionsParams,
} from './field-options.ts';

const reposSource = {
  kind: 'addonRoute' as const,
  route: 'repos',
  valueKey: 'fullName',
};

describe('field option sources', () => {
  test('route params require every dependsOn value', () => {
    const source = { ...reposSource, dependsOn: ['repo'] };
    expect(routeOptionsParams(source, { repo: 'a/b' })).toEqual({ repo: 'a/b' });
    expect(routeOptionsParams(source, { repo: '' })).toBeNull();
    expect(routeOptionsParams(source, {})).toBeNull();
  });

  test('route body maps rows by valueKey and labelKey', () => {
    const body = {
      rows: [
        { fullName: 'a/b', name: 'b' },
        { fullName: 'c/d', name: 'd' },
        { name: 'no-full-name' },
      ],
    };
    expect(optionsFromRouteBody(body, reposSource)).toEqual([
      { value: 'a/b', label: 'a/b' },
      { value: 'c/d', label: 'c/d' },
    ]);
    expect(optionsFromRouteBody(body, { ...reposSource, labelKey: 'name' })).toEqual([
      { value: 'a/b', label: 'b' },
      { value: 'c/d', label: 'd' },
    ]);
  });

  test('unexpected route bodies yield no options', () => {
    expect(optionsFromRouteBody(undefined, reposSource)).toEqual([]);
    expect(optionsFromRouteBody({ items: [] }, reposSource)).toEqual([]);
  });

  test('connections flatten account ids with the connection label', () => {
    const connections = [
      {
        connectionId: 'github',
        label: 'GitHub installation',
        accountKinds: [],
        cardinality: 'many' as const,
        optional: false,
        accountIds: ['11', '22'],
        needsSetup: false,
      },
    ] satisfies AddonConnectionView[];
    expect(optionsFromConnections(connections)).toEqual([
      { value: '11', label: 'GitHub installation · 11' },
      { value: '22', label: 'GitHub installation · 22' },
    ]);
  });
});
