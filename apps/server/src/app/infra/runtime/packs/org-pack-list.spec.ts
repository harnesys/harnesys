import { describe, expect, test } from 'bun:test';
import { listOrgPackCatalog } from '../../../application/capabilities/org-pack-catalog.ts';
import { isHostWired, orgPackNames } from './org-pack-list.ts';
import { wireOrgPackNames } from './wire-org-packs.ts';

describe('org pack single source', () => {
  test('catalog matches single source', () => {
    expect(
      listOrgPackCatalog()
        .map((p) => p.name)
        .sort(),
    ).toEqual([...orgPackNames()].sort());
  });
  test('host wiring flags match runtime packs', () => {
    expect(
      orgPackNames()
        .filter((name) => isHostWired(name))
        .sort(),
    ).toEqual([
      'agents',
      'core',
      'episodic-memory',
      'files',
      'github',
      'google',
      'image',
      'issues',
      'knowledge-memory',
      'lsp',
      'manager',
      'mcp',
      'pin-memory',
      'plan',
      'scheduler',
      'semantic-memory',
      'shell',
      'skills',
      'threads',
      'web',
      'webhook',
    ]);
    expect(wireOrgPackNames({}).sort()).toEqual([
      'agents',
      'core',
      'files',
      'image',
      'shell',
      'web',
    ]);
  });
  test('unwired packs report false', () => {
    expect(isHostWired('plan')).toBe(true);
    expect(isHostWired('manager')).toBe(true);
    expect(isHostWired('pin-memory')).toBe(true);
    expect(isHostWired('semantic-memory')).toBe(true);
    expect(isHostWired('episodic-memory')).toBe(true);
  });
});
