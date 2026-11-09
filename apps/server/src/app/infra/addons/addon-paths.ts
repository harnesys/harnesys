import { join, resolve } from 'node:path';

export const ADDON_MONOREPO_ROOT = resolve(import.meta.dir, '..', '..', '..', '..', '..', '..');

export const ADDON_SDK_PROCESS_ENTRY = join(
  ADDON_MONOREPO_ROOT,
  'packages',
  'sdk',
  'process-entry.ts',
);

export const MONOREPO_ADDONS_DIR = join(ADDON_MONOREPO_ROOT, 'add-ons');

export const ADDON_ENV_ENTRY = 'HARNESYS_ADDON_ENTRY';
export const ADDON_ENV_ID = 'HARNESYS_ADDON_ID';
export const ADDON_ENV_VERSION = 'HARNESYS_ADDON_VERSION';
export const ADDON_ENV_DATA_DIR = 'HARNESYS_ADDON_DATA_DIR';
