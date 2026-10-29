import { describe, expect, test } from 'bun:test';
import { DEFAULT_PERMISSIONS } from '../constants.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import { childPermissions, intersectPermissions } from './permissions.ts';

describe('childPermissions', () => {
  test('a grant lifts the default ask gate for the child', () => {
    const out = childPermissions({ grant: { 'fs.write': 'allow' } });
    expect(out['fs.write']).toBe('allow');
    expect(out['fs.read']).toBe(DEFAULT_PERMISSIONS['fs.read']);
    expect(out.process).toBe(DEFAULT_PERMISSIONS.process);
  });

  test('a grant never overrides an explicit parent deny', () => {
    const out = childPermissions({
      grant: { 'fs.write': 'allow' },
      parent: { 'fs.write': 'deny' },
    });
    expect(out['fs.write']).toBe('deny');
  });

  test('a grant applies its gate verbatim where the parent is not deny', () => {
    const out = childPermissions({
      grant: { network: 'deny' },
      parent: { network: 'allow' },
    });
    expect(out.network).toBe('deny');
  });

  test('without a grant the legacy intersection is unchanged', () => {
    const childDef: PermissionMap = { 'fs.write': 'allow' };
    const parent: PermissionMap = { 'fs.write': 'deny' };
    expect(childPermissions({ childDef, parent })).toEqual(intersectPermissions(childDef, parent));
    expect(childPermissions({})).toEqual(DEFAULT_PERMISSIONS);
  });
});
