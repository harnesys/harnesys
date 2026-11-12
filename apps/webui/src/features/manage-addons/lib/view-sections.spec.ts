import { describe, expect, test } from 'bun:test';
import { ensurePermissionsSection, type SectionEntry } from './view-sections';

function types(entries: SectionEntry[]): string[] {
  return entries.map((entry) => (entry.kind === 'known' ? entry.section.type : entry.sectionType));
}

describe('ensurePermissionsSection', () => {
  test('inserts permissions before config when the addon omits it', () => {
    const entries: SectionEntry[] = [
      { kind: 'known', section: { type: 'status' } },
      { kind: 'known', section: { type: 'config' } },
      { kind: 'known', section: { type: 'jobs' } },
    ];
    expect(types(ensurePermissionsSection(entries))).toEqual([
      'status',
      'permissions',
      'config',
      'jobs',
    ]);
  });

  test('keeps an existing permissions section and its position', () => {
    const entries: SectionEntry[] = [
      { kind: 'known', section: { type: 'permissions' } },
      { kind: 'known', section: { type: 'config' } },
    ];
    expect(types(ensurePermissionsSection(entries))).toEqual(['permissions', 'config']);
  });

  test('appends when there is no config section', () => {
    const entries: SectionEntry[] = [{ kind: 'known', section: { type: 'status' } }];
    expect(types(ensurePermissionsSection(entries))).toEqual(['status', 'permissions']);
  });
});
