import { afterAll, describe, expect, test } from 'bun:test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { engineSpecOf } from './engine-catalog.ts';
import { probeEngines } from './engine-probe.ts';

const SPEC = engineSpecOf('obscura');
if (SPEC === undefined) {
  throw new Error('obscura spec missing from catalog');
}

const ROOT = join(homedir(), '.harnesys', 'tmp', `engine-store-spec-${Date.now()}`);

afterAll(async () => {
  await rm(ROOT, { recursive: true, force: true });
});

describe('probeEngines', () => {
  test('finds the binary nested inside archive subdirectories', async () => {
    const versionDir = join(ROOT, SPEC.id, SPEC.version, `${SPEC.id}-wrapper`);
    const nestedDir = join(versionDir, 'inner');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(join(nestedDir, SPEC.id), '#!/bin/sh\n');
    await writeFile(
      join(ROOT, 'allowlist.json'),
      `${JSON.stringify([{ engineId: SPEC.id, enabled: true }], null, 2)}\n`,
      'utf8',
    );
    const probe = await probeEngines(ROOT);
    const entry = probe.entries.find((candidate) => candidate.engineId === SPEC.id);
    expect(entry?.installed).toBe(true);
    expect(entry?.binaryPath).toBe(join(nestedDir, SPEC.id));
    expect(probe.installedPaths[SPEC.id]).toBe(join(nestedDir, SPEC.id));
  }, 20_000);
});
