import { describe, expect, test } from 'bun:test';
import { HOOK_EVENT_NAMES } from '@harnesys/contracts';
import { NATIVE_HOOK_EVENTS } from './hook.ts';
import { HOOK_EVENT_CATALOG, hookCatalogEntry, hookMatcherApplies } from './hook-catalog.ts';

describe('hook event catalog', () => {
  test('covers exactly the contract event list', () => {
    const catalogEvents = HOOK_EVENT_CATALOG.map((entry) => entry.event).toSorted();
    expect(catalogEvents).toEqual([...HOOK_EVENT_NAMES].toSorted());
  });

  test('native hook events come from the contract', () => {
    expect([...NATIVE_HOOK_EVENTS].toSorted()).toEqual([...HOOK_EVENT_NAMES].toSorted());
  });

  test('every entry has a label, a phase and a description', () => {
    for (const entry of HOOK_EVENT_CATALOG) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
      expect(entry.phase.length).toBeGreaterThan(0);
    }
  });

  test('only events with a subject accept a matcher', () => {
    expect(hookMatcherApplies('PreToolUse')).toBe(true);
    expect(hookMatcherApplies('UserPromptSubmit')).toBe(false);
    expect(hookMatcherApplies('Stop')).toBe(false);
  });

  test('catalog lookup returns the entry of an event', () => {
    expect(hookCatalogEntry('PreToolUse').matcherSubject).toBe('tool name');
  });
});
