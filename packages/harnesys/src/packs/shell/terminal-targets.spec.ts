import { describe, expect, test } from 'bun:test';
import { TOOL_TARGET_KINDS, TOOL_TARGET_SCHEMA, toRegistryTarget } from './terminal-targets.ts';

describe('toRegistryTarget kinds', () => {
  test('host and undefined resolve to the local machine', () => {
    expect(toRegistryTarget(undefined)).toBeUndefined();
    expect(toRegistryTarget({ kind: 'host' })).toBeUndefined();
  });

  test('an unknown kind names itself and lists the valid kinds', () => {
    expect(() => toRegistryTarget({ kind: 'local' } as never)).toThrow(
      `unknown target kind "local", valid kinds: ${TOOL_TARGET_KINDS.join(' | ')}`,
    );
  });

  test('ssh without host keeps the ssh-specific message', () => {
    expect(() => toRegistryTarget({ kind: 'ssh' })).toThrow('ssh target requires host');
  });

  test('the shared schema enumerates the kinds it accepts', () => {
    const kind = TOOL_TARGET_SCHEMA.properties?.kind as { enum?: string[] };
    expect(kind?.enum).toEqual([...TOOL_TARGET_KINDS]);
  });
});
