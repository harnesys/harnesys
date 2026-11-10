import { join } from 'node:path';

const ADDONS_DIR = 'add-ons';
const LOCK_FILE = 'addons.lock.json';
const STAGING_DIR = '.staging';
const ADDON_DATA_DIR = 'addons';
const ADDON_DB_FILE = 'data.db';
const ADDON_FILES_DIR = 'files';
const ADDON_LOGS_DIR = 'logs';

export function assertSafeAddonId(id: string): string {
  if (!id || id.includes('..') || id.includes('/') || id.includes('\\')) {
    throw new Error(`invalid addon id: ${id}`);
  }
  return id;
}

export function assertSafeVersion(version: string): string {
  if (!version || version.includes('..') || version.includes('/') || version.includes('\\')) {
    throw new Error(`invalid addon version: ${version}`);
  }
  return version;
}

export function addonsHomeDir(home: string): string {
  return join(home, ADDONS_DIR);
}

export function addonPackageDir(home: string, id: string, version: string): string {
  assertSafeAddonId(id);
  assertSafeVersion(version);
  return join(addonsHomeDir(home), id, version);
}

export function addonLockPath(home: string): string {
  return join(addonsHomeDir(home), LOCK_FILE);
}

export function addonStagingDir(home: string, planId: string): string {
  assertSafeAddonId(planId);
  return join(addonsHomeDir(home), STAGING_DIR, planId);
}

export function orgAddonDataDir(orgDataDir: string, addonId: string): string {
  assertSafeAddonId(addonId);
  return join(orgDataDir, ADDON_DATA_DIR, addonId);
}

export function orgAddonDbPath(orgDataDir: string, addonId: string): string {
  return join(orgAddonDataDir(orgDataDir, addonId), ADDON_DB_FILE);
}

export function orgAddonFilesDir(orgDataDir: string, addonId: string): string {
  return join(orgAddonDataDir(orgDataDir, addonId), ADDON_FILES_DIR);
}

export function orgAddonLogsDir(orgDataDir: string, addonId: string): string {
  return join(orgAddonDataDir(orgDataDir, addonId), ADDON_LOGS_DIR);
}
