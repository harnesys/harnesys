import { describe, expect, test } from 'bun:test';
import type { WindowDesksByOrg } from '@harnesys/studio-shared';
import {
  DESK_CHROME_STORAGE_KEY,
  type DeskChromeStorage,
  readDeskChrome,
  writeDeskChrome,
} from './desk-chrome-storage';

function fakeStorage(seed?: string): DeskChromeStorage & { value: string | null } {
  const store = {
    value: seed ?? null,
    getItem(key: string) {
      return key === DESK_CHROME_STORAGE_KEY ? store.value : null;
    },
    setItem(key: string, value: string) {
      if (key === DESK_CHROME_STORAGE_KEY) {
        store.value = value;
      }
    },
  };
  return store;
}

describe('desk chrome storage', () => {
  test('round-trips desks through storage', () => {
    const storage = fakeStorage();
    const desks: WindowDesksByOrg = {
      org1: { workspace: { tabs: [], activeId: null } },
    };
    writeDeskChrome(storage, desks);
    expect(readDeskChrome(storage)).toEqual(desks);
  });

  test('returns empty map when nothing stored', () => {
    expect(readDeskChrome(fakeStorage())).toEqual({});
  });

  test('returns empty map for corrupt json', () => {
    expect(readDeskChrome(fakeStorage('{not json'))).toEqual({});
  });

  test('returns empty map for non-object payload', () => {
    expect(readDeskChrome(fakeStorage('[1,2,3]'))).toEqual({});
  });
});
