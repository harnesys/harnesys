import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AddonLock, lockEntryFor } from './addon-lock.ts';
import { addonLockPath, addonPackageDir } from './addon-paths.ts';

let home = '';

beforeAll(() => {
  home = mkdtempSync(join(tmpdir(), 'addon-lock-'));
});

afterAll(() => {
  rmSync(home, { recursive: true, force: true });
});

function entry(version: string, digest = 'digest') {
  return lockEntryFor({
    id: 'harnesys.test-addon',
    version,
    digest,
    source: 'builtin',
    trust: 'builtin',
    installedAt: '2026-11-10T00:00:00.000Z',
  });
}

describe('AddonLock', () => {
  test('read on missing lock returns empty entries', () => {
    const lock = new AddonLock(home);
    expect(lock.read()).toEqual({ entries: [] });
  });

  test('write is atomic and leaves no temp files behind', () => {
    const lock = new AddonLock(home);
    lock.write({ entries: [entry('1.0.0')] });
    expect(existsSync(addonLockPath(home))).toBe(true);
    const leftovers = readdirSync(join(home, 'add-ons')).filter((name) =>
      name.startsWith('addons.lock.json.tmp-'),
    );
    expect(leftovers).toEqual([]);
    expect(JSON.parse(readFileSync(addonLockPath(home), 'utf8')).entries.length).toBe(1);
    rmSync(addonLockPath(home));
  });

  test('confirm is idempotent and keeps multiple versions per addon', () => {
    const lock = new AddonLock(home);
    expect(lock.confirm(entry('1.0.0'))).toBe(true);
    expect(lock.confirm(entry('1.0.0'))).toBe(false);
    expect(lock.confirm(entry('1.1.0'))).toBe(true);
    expect(
      lock
        .read()
        .entries.map((e) => e.version)
        .sort(),
    ).toEqual(['1.0.0', '1.1.0']);
    lock.remove('harnesys.test-addon', '1.1.0');
    expect(lock.entry('harnesys.test-addon')?.version).toBe('1.0.0');
    expect(lock.remove('harnesys.test-addon', '1.1.0')).toBe(false);
  });

  test('corrupt lock file degrades to empty entries instead of throwing', () => {
    mkdirSync(join(home, 'add-ons'), { recursive: true });
    writeFileSync(addonLockPath(home), 'not json at all');
    expect(new AddonLock(home).read()).toEqual({ entries: [] });
  });
});

describe('lock path helpers', () => {
  test('package dir and lock path follow the §3.4 layout', () => {
    expect(addonPackageDir(home, 'harnesys.test-addon', '2.0.0')).toBe(
      join(home, 'add-ons', 'harnesys.test-addon', '2.0.0'),
    );
    expect(addonLockPath(home)).toBe(join(home, 'add-ons', 'addons.lock.json'));
  });

  test('rejects ids and versions escaping the layout', () => {
    expect(() => addonPackageDir(home, '../escape', '1.0.0')).toThrow();
    expect(() => addonPackageDir(home, 'harnesys.test-addon', '../../escape')).toThrow();
  });
});
