import { afterEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  assembleDirs,
  commandStatus,
  pickNodeBin,
  resolveShellPath,
  scanNodeVersions,
} from './toolchain-discovery.ts';

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function fakeHome(): string {
  const home = mkdtempSync(join(tmpdir(), 'harnesys-toolchain-'));
  dirs.push(home);
  return home;
}

function stubNodeBin(root: string, version: string): string {
  const binDir = join(root, version, 'bin');
  mkdirSync(binDir, { recursive: true });
  writeFileSync(join(binDir, 'node'), '#!/bin/sh\n', { mode: 0o755 });
  return binDir;
}

describe('scanNodeVersions', () => {
  test('lists nvm versions with manager and bin dir', () => {
    const home = fakeHome();
    const bin = stubNodeBin(join(home, '.nvm/versions/node'), 'v22.11.0');
    stubNodeBin(join(home, '.nvm/versions/node'), 'v24.13.0');

    const versions = scanNodeVersions(home);

    expect(versions).toHaveLength(2);
    expect(versions.map((entry) => entry.manager)).toEqual(['nvm', 'nvm']);
    expect(versions.some((entry) => entry.binDir === bin)).toBe(true);
  });

  test('covers fnm, volta, mise and asdf layouts', () => {
    const home = fakeHome();
    stubNodeBin(join(home, '.fnm/node-versions'), 'v20.0.0');
    stubNodeBin(join(home, '.volta/tools/image/node'), '20.5.1');
    stubNodeBin(join(home, '.local/share/mise/installs/node'), '21.0.0');
    stubNodeBin(join(home, '.asdf/installs/node'), '18.19.0');

    const versions = scanNodeVersions(home);

    expect(versions.map((entry) => entry.manager).sort()).toEqual(['asdf', 'fnm', 'mise', 'volta']);
  });

  test('auto picks the highest version, pin honors the id', () => {
    const home = fakeHome();
    stubNodeBin(join(home, '.nvm/versions/node'), 'v22.11.0');
    stubNodeBin(join(home, '.nvm/versions/node'), 'v24.13.0');
    const versions = scanNodeVersions(home);

    expect(pickNodeBin(versions, 'auto')).toBe(join(home, '.nvm/versions/node/v24.13.0/bin'));
    expect(pickNodeBin(versions, 'nvm-v22.11.0')).toBe(
      join(home, '.nvm/versions/node/v22.11.0/bin'),
    );
    expect(pickNodeBin(versions, 'nvm-v99.0.0')).toBeUndefined();
  });

  test('fnm installation/bin layout is read', () => {
    const home = fakeHome();
    const parent = join(home, 'Library/Application Support/fnm/node-versions');
    mkdirSync(join(parent, 'v20.18.1/installation/bin'), { recursive: true });
    writeFileSync(join(parent, 'v20.18.1/installation/bin/node'), '#!/bin/sh\n', {
      mode: 0o755,
    });

    const versions = scanNodeVersions(home);

    expect(versions).toHaveLength(1);
    expect(versions[0]?.manager).toBe('fnm');
    expect(versions[0]?.binDir).toBe(join(parent, 'v20.18.1/installation/bin'));
  });
});

describe('assembleDirs', () => {
  test('override dirs first, node bin, probed path, then managed and extra dirs', () => {
    const dirs = assembleDirs({
      probed: ['/usr/bin', '/bin'],
      managedDirs: ['/managed/bin', '/opt/homebrew/bin'],
      extraDirs: ['/extra'],
      overrideDirs: ['/override/bin'],
      home: '/home/test',
    });

    expect(dirs).toEqual([
      '/override/bin',
      '/managed/bin',
      '/usr/bin',
      '/bin',
      '/opt/homebrew/bin',
      '/extra',
    ]);
  });

  test('custom mode without probe keeps managed and extra dirs only', () => {
    const dirs = assembleDirs({
      probed: [],
      managedDirs: ['/managed/bin'],
      extraDirs: ['~/extra'],
      overrideDirs: [],
      home: '/home/test',
    });

    expect(dirs).toEqual(['/managed/bin', '/home/test/extra']);
  });

  test('dedupes and tilde-expands', () => {
    const dirs = assembleDirs({
      probed: ['/bin', '~/work'],
      managedDirs: ['/bin'],
      extraDirs: ['~/work', '/tail'],
      overrideDirs: [],
      home: '/home/test',
    });

    expect(dirs).toEqual(['/bin', '/home/test/work', '/tail']);
  });
});

describe('resolveShellPath', () => {
  test('auto prefers SHELL env, then detected, then zsh fallback', () => {
    expect(resolveShellPath('auto', '/home', '/bin/bash', [])).toBe('/bin/bash');
    expect(resolveShellPath('auto', '/home', undefined, [{ path: '/bin/zsh', kind: 'zsh' }])).toBe(
      '/bin/zsh',
    );
    expect(resolveShellPath('auto', '/home', undefined, [])).toBe('/bin/zsh');
  });

  test('explicit setting wins without detection', () => {
    expect(resolveShellPath('/usr/bin/fish', '/home', '/bin/bash', [])).toBe('/usr/bin/fish');
  });
});

describe('commandStatus', () => {
  test('override beats a PATH hit', () => {
    const dirs: string[] = [];
    const status = commandStatus('my-ls', { 'my-ls': '/override/my-ls' }, dirs);
    expect(status.source).toBe('override');
    expect(status.resolvedPath).toBeNull();
  });

  test('missing without any hit', () => {
    const status = commandStatus('ghost-ls', {}, ['/opt/homebrew/bin']);
    expect(status.source).toBe('missing');
    expect(status.resolvedPath).toBeNull();
  });
});
