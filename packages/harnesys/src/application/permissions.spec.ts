import { describe, expect, test } from 'bun:test';
import { DEFAULT_PERMISSIONS } from '../constants.ts';
import type { PermissionMap } from '../ports/permissions.ts';
import { childPermissions, intersectPermissions } from './permissions.ts';

describe('childPermissions', () => {
  test('a grant cannot lift the default ask gate', () => {
    const out = childPermissions({ grant: { 'fs.write': 'allow' } });
    expect(out['fs.write']).toBe('ask');
    expect(out['fs.read']).toBe(DEFAULT_PERMISSIONS['fs.read']);
    expect(out.process).toBe(DEFAULT_PERMISSIONS.process);
  });

  test('a grant cannot lift an explicit parent ask gate', () => {
    const out = childPermissions({
      grant: { process: 'allow' },
      parent: { process: 'ask' },
    });
    expect(out.process).toBe('ask');
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

  test('a child inherits an allow gate from the parent', () => {
    const out = childPermissions({ parent: { process: 'allow' } });
    expect(out.process).toBe('allow');
  });

  test('a child definition can tighten the parent gate', () => {
    const out = childPermissions({
      childDef: { process: 'deny' },
      parent: { process: 'allow' },
    });
    expect(out.process).toBe('deny');
  });

  test('a child definition cannot loosen the parent gate', () => {
    const out = childPermissions({
      childDef: { 'fs.write': 'allow' },
      parent: { 'fs.write': 'ask' },
    });
    expect(out['fs.write']).toBe('ask');
  });

  test('without a grant or parent the defaults apply', () => {
    expect(childPermissions({})).toEqual(DEFAULT_PERMISSIONS);
  });
});
