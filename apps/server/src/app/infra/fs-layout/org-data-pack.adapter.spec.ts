import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../../../config.schema.ts';
import { HostFsLayoutAdapter } from './host-fs-layout.adapter.ts';
import { OrgDataPackAdapter } from './org-data-pack.adapter.ts';

function testConfig(home: string): AppConfig {
  return {
    environment: 'test',
    app: { name: 'test', version: '0.0.0' },
    harnesys: { home, masterKey: '', publicUrl: '' },
    githubApp: {
      appId: '',
      privateKey: '',
      clientId: '',
      clientSecret: '',
      webhookSecret: '',
      appSlug: '',
    },
  };
}

function makeHome(): string {
  return mkdtempSync(join(tmpdir(), 'harnesys-org-pack-'));
}

describe('OrgDataPackAdapter', () => {
  test('pack returns false when org data dir does not exist', async () => {
    const home = makeHome();
    try {
      const adapter = new OrgDataPackAdapter(new HostFsLayoutAdapter(testConfig(home)));
      const out = join(home, 'out.tgz');
      expect(await adapter.pack('org-x', out)).toBe(false);
      expect(existsSync(out)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  test('pack + unpack roundtrip restores org data files', async () => {
    const home = makeHome();
    try {
      const layout = new HostFsLayoutAdapter(testConfig(home));
      const adapter = new OrgDataPackAdapter(layout);
      const doc = layout.ensureOrgSourceDir('org-a', 'src-1');
      writeFileSync(join(doc, 'note.md'), 'hello');

      const archive = join(home, 'org-a.tgz');
      expect(await adapter.pack('org-a', archive)).toBe(true);
      expect(existsSync(archive)).toBe(true);
      rmSync(join(home, 'data'), { recursive: true, force: true });

      await adapter.unpack('org-a', archive);
      expect(await adapter.pack('org-a', archive)).toBe(true);
      const restored = join(layout.orgSourceDir('org-a', 'src-1'), 'note.md');
      expect(await Bun.file(restored).text()).toBe('hello');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
