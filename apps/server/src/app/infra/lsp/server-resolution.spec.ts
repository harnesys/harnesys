import { describe, expect, test } from 'bun:test';
import type { LspServerSpec } from 'harnesys';
import type { PluginLspEntry } from '../../domain/plugin/plugin-runtime.port.ts';
import type { LspServerSpec as FileLspSpec } from '../lsp/org-lsp-file.ts';
import { extensionOwnerMap, resolveLspServers } from './server-resolution.ts';

function fileSpec(serverId: string, exts: string[]): FileLspSpec {
  return {
    serverId,
    command: `cmd-${serverId}`,
    extensionToLanguage: Object.fromEntries(exts.map((e) => [e, 'x'])),
  };
}

function pluginSpec(serverId: string, exts: string[]): LspServerSpec {
  return {
    serverId,
    command: `cmd-${serverId}`,
    extensionToLanguage: Object.fromEntries(exts.map((e) => [e, 'x'])),
  };
}

function pluginEntry(serverId: string, exts: string[], disabled = false): PluginLspEntry {
  return {
    serverId: `plugin:p1:${serverId}`,
    plugin: 'p1',
    spec: pluginSpec(serverId, exts),
    disabled,
  };
}

describe('resolveLspServers', () => {
  test('file server shadows plugin server on shared extension', () => {
    const resolved = resolveLspServers(
      [fileSpec('file-ts', ['.ts'])],
      [pluginEntry('ts', ['.ts', '.tsx'])],
      new Set(),
    );
    const file = resolved.find((entry) => entry.origin === 'file');
    const plugin = resolved.find((entry) => entry.origin === 'plugin');
    expect(file?.shadowed).toBe(false);
    expect(plugin?.shadowed).toBe(true);
  });

  test('disabled plugin servers are excluded', () => {
    const resolved = resolveLspServers(
      [],
      [pluginEntry('ts', ['.ts'], true)],
      new Set(['plugin:p1:ts']),
    );
    expect(resolved).toEqual([]);
  });

  test('extension map routes to the winning server', () => {
    const resolved = resolveLspServers(
      [fileSpec('file-ts', ['.ts'])],
      [pluginEntry('py', ['.py'])],
      new Set(),
    );
    const map = extensionOwnerMap(resolved);
    expect(map.get('.ts')?.serverId).toBe('file:file-ts');
    expect(map.get('.py')?.serverId).toBe('plugin:p1:py');
  });

  test('no server for an extension yields empty owner', () => {
    const resolved = resolveLspServers([], [pluginEntry('py', ['.py'])], new Set());
    expect(extensionOwnerMap(resolved).get('.ts')).toBeUndefined();
  });
});
