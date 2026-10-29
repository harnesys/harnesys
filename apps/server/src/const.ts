import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import pkg from '../package.json' with { type: 'json' };
import appConfigYml from './config/application.yml' with { type: 'text' };

export const APP_VERSION = pkg.version as string;

export const APP_CONFIG_DIR_PATH = join(import.meta.dir, 'config');

export const EMBEDDED_APP_CONFIG_YML = appConfigYml;

export const HOME_DIR_NAME = '.harnesys';
export const STUDIO_DIR_LEGACY = '.studio';
export const BUNDLED_ASSETS_ENV = 'HARNESYS_BUNDLED_ASSETS';
export const SOURCE_ASSETS_DIR = join(import.meta.dir, '..', 'assets');
export const PRESET_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

export function bundledAssetsRoot(): string {
  const override = process.env[BUNDLED_ASSETS_ENV]?.trim();
  if (override) {
    return resolve(override);
  }
  const sibling = join(dirname(process.execPath), 'assets');
  if (existsSync(sibling)) {
    return sibling;
  }
  return SOURCE_ASSETS_DIR;
}

export function bundledPresetsPath(sub: 'agents' | 'modes'): string {
  return join(bundledAssetsRoot(), 'presets', sub);
}

export function systemPresetsPath(sub: 'agents' | 'modes', home: string): string {
  return join(home, 'presets', sub);
}

export const SAFETY_NAMES = new Set([
  'node_modules',
  '.git',
  '.harnesys-mirror',
  '.next',
  'dist',
  'build',
  '.turbo',
  '.cache',
  'coverage',
  HOME_DIR_NAME,
  STUDIO_DIR_LEGACY,
]);

export const KNOWLEDGE_MAX_SIZE_BYTES = 2_000_000;
export const DEFAULT_CHUNK_CHARS = 1200;
export const DEFAULT_OVERLAP = 150;
export const EMBEDDING_ERROR_PREVIEW_CHARS = 240;
export const KNOWLEDGE_EMBED_BATCH_SIZE = 64;
export const FILES_WATCHER_DEBOUNCE_MS = 200;
export const KNOWLEDGE_WATCH_ENSURE_INTERVAL_MS = 30_000;
export const KNOWLEDGE_INDEX_SLOW_FILE_MS = 5000;
export const KNOWLEDGE_EMBED_SLOW_MS = 8000;
export const OLLAMA_EMBED_KEEP_ALIVE = '10m';
export const SSE_KEEP_ALIVE_MS = 4_000;

export const KNOWLEDGE_TEXT_EXTS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.htm',
  '.yaml',
  '.yml',
  '.toml',
  '.xml',
  '.csv',
  '.rs',
  '.go',
  '.py',
  '.sh',
  '.sql',
]);

export const DEFAULT_KNOWLEDGE_SETTINGS = {
  entireSource: false,
  backend: 'fts' as const,
  embedProvider: null,
  embedModel: null,
  watchEnabled: false,
};
