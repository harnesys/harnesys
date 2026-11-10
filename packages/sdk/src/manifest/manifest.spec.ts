import { describe, expect, test } from 'bun:test';
import { validManifest } from '../testing/fixtures.ts';
import { contributionDescriptorJsonSchema, manifestJsonSchema } from './json-schema.ts';
import { l10nKeys, resolveL10n } from './l10n.ts';
import { AddonManifestSchema, parseAddonManifest } from './manifest.ts';
import { validateManifest } from './validate.ts';

describe('addon manifest schema', () => {
  test('parses a valid manifest', () => {
    const parsed = parseAddonManifest(validManifest());
    expect(parsed.id).toBe('harnesys.demo');
  });

  test('rejects bad addon id, version and platform', () => {
    const broken = { ...validManifest(), id: 'BadId', version: '1.0', platform: 0 } as unknown;
    const result = AddonManifestSchema.safeParse(broken);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.length).toBeGreaterThanOrEqual(3);
    }
  });

  test('schema violations are reported together', () => {
    const raw: Record<string, unknown> = JSON.parse(JSON.stringify(validManifest()));
    raw.id = 'nope';
    raw.version = 'not-semver';
    raw.platform = 0;
    const result = validateManifest(raw);
    expect(result.violations.length).toBe(3);
    expect(result.manifest).toBeNull();
  });

  test('cross-check violations are all reported at once', () => {
    const raw = validManifest();
    raw.permissions = [{ id: 'not.a.permission', reason: 'because' }];
    raw.contributions = [
      { id: 'pack', family: 'tool-pack', descriptor: { name: 'github' } },
      { id: 'pack', family: 'no-such-family', descriptor: {} },
      {
        id: 'dup',
        family: 'job',
        descriptor: { id: 'sync', title: 'Sync', schedule: { everySec: 60 }, catchUp: 'none' },
      },
      {
        id: 'dup',
        family: 'job',
        descriptor: { id: 'sync', title: 'Sync', schedule: { everySec: 60 }, catchUp: 'none' },
      },
    ];
    const result = validateManifest(raw);
    const codes = result.violations.map((violation) => violation.code);
    expect(codes).toContain('unknown_permission');
    expect(codes).toContain('duplicate_contribution_id');
    expect(codes).toContain('unknown_family');
    expect(codes).toContain('descriptor_schema');
    expect(codes).toContain('duplicate_id');
  });

  test('flags resident activation without lifecycle.resident', () => {
    const raw = { ...validManifest(), activation: 'resident' };
    const result = validateManifest(raw);
    expect(result.violations.some((v) => v.code === 'resident_without_permission')).toBe(true);
  });

  test('flags undeclared connection references', () => {
    const raw = validManifest();
    const pack = raw.contributions[0];
    if (pack) {
      pack.descriptor.connection = 'slack';
    }
    const result = validateManifest(raw);
    expect(result.violations.some((v) => v.code === 'unknown_connection')).toBe(true);
  });

  test('optional contributions in unknown families produce warnings only', () => {
    const raw = validManifest();
    raw.contributions.push({
      id: 'extra',
      family: 'no-such-family',
      optional: true,
      descriptor: {},
    });
    const result = validateManifest(raw);
    expect(
      result.violations.some((v) => v.code === 'unknown_family' && v.severity === 'warning'),
    ).toBe(true);
  });

  test('checks %key% l10n keys when a dictionary is provided', () => {
    const raw = validManifest();
    raw.description = '%missing.key%';
    const result = validateManifest(raw, { l10nKeys: ['unrelated'] });
    expect(
      result.violations.some(
        (v) => v.code === 'missing_l10n_key' && v.message.includes('%missing.key%'),
      ),
    ).toBe(true);
  });
});

describe('manifest json schema publication', () => {
  test('produces a JSON Schema object with manifest properties', () => {
    const schema = manifestJsonSchema();
    expect(schema.type).toBe('object');
    expect(JSON.stringify(schema)).toContain('runtime');
    expect(JSON.stringify(schema)).toContain('contributions');
  });

  test('produces a JSON Schema for a family descriptor', () => {
    const schema = contributionDescriptorJsonSchema('tool-pack');
    expect(schema).not.toBeNull();
    expect(JSON.stringify(schema)).toContain('inputSchema');
  });

  test('returns null for unknown families', () => {
    expect(contributionDescriptorJsonSchema('nope')).toBeNull();
  });
});

describe('l10n', () => {
  test('resolves record locales with en fallback', () => {
    expect(resolveL10n({ en: 'Hello', ru: 'Привет' }, { locale: 'ru' })).toBe('Привет');
    expect(resolveL10n({ en: 'Hello', ru: 'Привет' }, { locale: 'de' })).toBe('Hello');
  });

  test('interpolates %key% from the dictionary and keeps missing keys as-is', () => {
    expect(resolveL10n('%greeting% world', { locale: 'en', dict: { greeting: 'Hi' } })).toBe(
      'Hi world',
    );
    expect(resolveL10n('%missing% world', { locale: 'en', dict: {} })).toBe('%missing% world');
  });

  test('collects %key% tokens', () => {
    expect(l10nKeys('%a.b% and %c%')).toEqual(['a.b', 'c']);
  });
});
