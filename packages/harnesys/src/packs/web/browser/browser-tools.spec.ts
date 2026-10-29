import { describe, expect, test } from 'bun:test';
import {
  normalizeBrowserArgs,
  selectTabByPosition,
  shellTokens,
  tabPositionalTarget,
} from './browser-tools.ts';

describe('shellTokens', () => {
  test('splits on whitespace', () => {
    expect(shellTokens('new https://example.com')).toEqual(['new', 'https://example.com']);
  });
  test('groups double-quoted spans', () => {
    expect(shellTokens('fill @e130 "Test User"')).toEqual(['fill', '@e130', 'Test User']);
  });
  test('groups single-quoted spans', () => {
    expect(shellTokens("press 'a b'")).toEqual(['press', 'a b']);
  });
  test('keeps empty quoted values', () => {
    expect(shellTokens('type @e1 ""')).toEqual(['type', '@e1', '']);
  });
});

describe('normalizeBrowserArgs', () => {
  test('passes tokens through untouched', () => {
    expect(normalizeBrowserArgs('fill', ['@e130', 'Test User'])).toEqual(['@e130', 'Test User']);
    expect(normalizeBrowserArgs('open', ['https://example.com'])).toEqual(['https://example.com']);
    expect(normalizeBrowserArgs('eval', ['document.title'])).toEqual(['document.title']);
    expect(normalizeBrowserArgs('click', ['@e134'])).toEqual(['@e134']);
  });
  test('drops a duplicated command word', () => {
    expect(normalizeBrowserArgs('snapshot', ['snapshot'])).toEqual([]);
    expect(normalizeBrowserArgs('press', ['press', 'Enter'])).toEqual(['Enter']);
  });
  test('splits a shell line prefixed with the command', () => {
    expect(normalizeBrowserArgs('click', ['click @e134'])).toEqual(['@e134']);
    expect(normalizeBrowserArgs('press', ['press Enter'])).toEqual(['Enter']);
    expect(normalizeBrowserArgs('fill', ['fill @e130 "Test User"'])).toEqual([
      '@e130',
      'Test User',
    ]);
  });
  test('splits tab subcommand lines', () => {
    expect(normalizeBrowserArgs('tab', ['new https://example.com'])).toEqual([
      'new',
      'https://example.com',
    ]);
    expect(normalizeBrowserArgs('tab', ['tab', 'new https://example.com'])).toEqual([
      'new',
      'https://example.com',
    ]);
  });
  test('leaves extra args after a shell line intact', () => {
    expect(normalizeBrowserArgs('find', ['role', 'button'])).toEqual(['role', 'button']);
    expect(normalizeBrowserArgs('click', ['click @e1', '--human'])).toEqual(['@e1', '--human']);
  });
});

describe('tabPositionalTarget', () => {
  test('bare index targets the n-th tab', () => {
    expect(tabPositionalTarget(['2'])).toEqual({ index: 0, position: 2 });
  });
  test('index after close targets the n-th tab', () => {
    expect(tabPositionalTarget(['close', '3'])).toEqual({ index: 1, position: 3 });
  });
  test('ignores tab ids, labels and subcommands', () => {
    expect(tabPositionalTarget(['t1'])).toBeNull();
    expect(tabPositionalTarget(['list'])).toBeNull();
    expect(tabPositionalTarget(['close', 't2'])).toBeNull();
    expect(tabPositionalTarget([])).toBeNull();
  });
});

describe('selectTabByPosition', () => {
  const listJson = JSON.stringify({
    success: true,
    data: {
      tabs: [
        { tabId: 't1', url: 'https://example.com/' },
        { tabId: 't2', url: 'https://example.org/' },
      ],
    },
    error: null,
  });
  test('picks the n-th tab id', () => {
    expect(selectTabByPosition(listJson, 1)).toBe('t1');
    expect(selectTabByPosition(listJson, 2)).toBe('t2');
  });
  test('rejects an out-of-range position and lists available tabs', () => {
    expect(() => selectTabByPosition(listJson, 3)).toThrow(
      'tab index 3 is out of range (2 tab(s) open); available tabs: t1, t2',
    );
  });
  test('rejects unreadable output', () => {
    expect(() => selectTabByPosition('not json', 1)).toThrow('unreadable output');
  });
});
