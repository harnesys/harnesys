import { describe, expect, test } from 'bun:test';
import { ensurePermissionsSection, type SectionEntry, sortSectionEntries } from './view-sections';

function types(entries: SectionEntry[]): string[] {
  return entries.map((entry) => (entry.kind === 'known' ? entry.section.type : entry.sectionType));
}

describe('sortSectionEntries', () => {
  test('applies the canonical layout regardless of declaration order', () => {
    const entries: SectionEntry[] = [
      { kind: 'known', section: { type: 'markdown', body: 'notes' } },
      { kind: 'known', section: { type: 'config' } },
      {
        kind: 'known',
        section: { type: 'table', title: 'Rows', source: { route: '/rows' }, columns: [] },
      },
      { kind: 'known', section: { type: 'jobs' } },
      { kind: 'known', section: { type: 'connections' } },
      { kind: 'known', section: { type: 'permissions' } },
      { kind: 'known', section: { type: 'status' } },
      { kind: 'unknown', sectionType: 'kanban' },
    ];
    expect(types(sortSectionEntries(entries))).toEqual([
      'status',
      'permissions',
      'connections',
      'config',
      'jobs',
      'table',
      'kanban',
      'markdown',
    ]);
  });

  test('keeps add-on-specific blocks in declaration order', () => {
    const entries: SectionEntry[] = [
      { kind: 'known', section: { type: 'jobs' } },
      {
        kind: 'known',
        section: { type: 'form', title: 'Pair', fields: [], submit: { route: '/pair' } },
      },
      {
        kind: 'known',
        section: { type: 'table', title: 'Chats', source: { route: '/chats' }, columns: [] },
      },
    ];
    expect(types(sortSectionEntries(entries))).toEqual(['jobs', 'form', 'table']);
  });
});

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
