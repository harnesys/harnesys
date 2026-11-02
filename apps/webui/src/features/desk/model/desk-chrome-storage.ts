import type { WindowDesksByOrg } from '@harnesys/studio-shared';

export interface DeskChromeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DESK_CHROME_STORAGE_KEY = 'harnesys.desk-chrome';

export function readDeskChrome(storage: DeskChromeStorage): WindowDesksByOrg {
  try {
    const raw = storage.getItem(DESK_CHROME_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    return parsed as WindowDesksByOrg;
  } catch {
    return {};
  }
}

export function writeDeskChrome(storage: DeskChromeStorage, desks: WindowDesksByOrg): void {
  try {
    storage.setItem(DESK_CHROME_STORAGE_KEY, JSON.stringify(desks));
  } catch {}
}
