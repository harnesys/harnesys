import { describe, expect, test } from 'bun:test';
import { parseAddonManifest } from '@harnesys/sdk';

const manifest = parseAddonManifest(
  await Bun.file(new URL('../addon.json', import.meta.url)).json(),
);

describe('harnesys.telegram-groups manifest', () => {
  test('parses with the expected identity', () => {
    expect(manifest.id).toBe('harnesys.telegram-groups');
    expect(manifest.version).toBe('1.1.0');
    expect(manifest.runtime).toEqual({ entry: 'dist/index.js', profile: 'trusted' });
  });

  test('declares the permissions behind the thread commands', () => {
    const permissionIds = manifest.permissions.map((permission) => permission.id);
    for (const id of [
      'runs.read',
      'runs.dispatch',
      'threads.compact',
      'usage.read',
      'skills.read',
    ]) {
      expect(permissionIds).toContain(id);
    }
  });

  test('registers the group command surface', () => {
    const pack = manifest.contributions.find((contribution) => contribution.family === 'config');
    if (pack === undefined) {
      throw new Error('config contribution is missing');
    }
    const fields = (pack.descriptor as { fields: Array<{ key: string; help: string }> }).fields;
    const commands = fields.find((field) => field.key === 'commands');
    if (commands === undefined) {
      throw new Error('commands config field is missing');
    }
    expect(commands.help).toContain('/stop');
    expect(commands.help).toContain('/compact');
  });
});
