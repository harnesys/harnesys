import { beforeAll, describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { syncTemplate } from '../scripts/sync-template.ts';
import { DEFAULT_SDK, defaultDescription, parseArgs, resolvePlan } from './options.ts';

const context = { cwd: '/tmp/work', repoRoot: '/repo' };

beforeAll(() => {
  syncTemplate();
});

describe('resolvePlan', () => {
  test('derives the id and title from a dotted directory name', () => {
    const plan = resolvePlan(parseArgs(['acme.example']), context);
    expect(plan.id).toBe('acme.example');
    expect(plan.dir).toBe(resolve('/tmp/work', 'acme.example'));
    expect(plan.title).toBe('Example');
    expect(plan.builtin).toBe(false);
  });

  test('--id and --name override the derived values', () => {
    const flags = parseArgs(['my-addon', '--id', 'acme.my-addon', '--name', 'My Add-on']);
    const plan = resolvePlan(flags, context);
    expect(plan.id).toBe('acme.my-addon');
    expect(plan.title).toBe('My Add-on');
    expect(plan.dir).toBe(resolve('/tmp/work', 'my-addon'));
  });

  test('--description overrides the default derived from the title', () => {
    const plan = resolvePlan(parseArgs(['acme.example']), context);
    expect(plan.description).toBe(defaultDescription(plan.title));

    const custom = resolvePlan(
      parseArgs(['acme.example', '--description', 'Save links.']),
      context,
    );
    expect(custom.description).toBe('Save links.');
  });

  test('rejects a directory name without a publisher', () => {
    expect(() => resolvePlan(parseArgs(['my-addon']), context)).toThrow(/invalid add-on id/);
  });

  test('builtin mode defaults to harnesys.<name> under add-ons/', () => {
    const plan = resolvePlan(parseArgs(['greeter', '--builtin']), context);
    expect(plan.id).toBe('harnesys.greeter');
    expect(plan.dir).toBe(join('/repo', 'add-ons', 'harnesys.greeter'));
    expect(plan.title).toBe('Greeter');
    expect(plan.builtin).toBe(true);
  });

  test('DEFAULT_SDK matches the SDK pin in the template', () => {
    const text = readFileSync(join(import.meta.dir, '..', 'template', 'package.json'), 'utf8');
    const pkg = JSON.parse(text) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.['@harnesys/sdk']).toBe(DEFAULT_SDK);
  });
});
