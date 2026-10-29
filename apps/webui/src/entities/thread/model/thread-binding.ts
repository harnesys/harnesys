import type { ExecutionProfile } from '@/shared/api';

export const SANDBOX_DIR_VALUE = 'sandbox';
export const CUSTOM_DIR_VALUE = '__custom__';
export const CUSTOM_PATH_ERROR = 'Path must be absolute';
export const RECENT_DIRECTORIES_LIMIT = 5;

export interface SelectOption {
  value: string;
  label: string;
}

const RECENT_DIRECTORIES_PREFIX = 'harnesys.thread-binding.recents.';

export function profileOptions(profiles: ExecutionProfile[]): SelectOption[] {
  return [
    { value: '', label: 'Inherit' },
    ...profiles.map((profile) => ({
      value: profile.id,
      label: profile.name,
    })),
  ];
}

export function directoryOptions(input: {
  sources: { id: string; name: string; absoluteRoot: string | null }[];
  recents: string[];
  currentDirectory: string | null;
}): SelectOption[] {
  const rootOptions: SelectOption[] = [];
  for (const source of input.sources) {
    if (source.absoluteRoot) {
      rootOptions.push({ value: source.absoluteRoot, label: source.name });
    }
  }
  const rootValues = new Set(rootOptions.map((option) => option.value));
  const recentOptions = input.recents
    .filter((path) => !rootValues.has(path) && path !== input.currentDirectory)
    .slice(0, RECENT_DIRECTORIES_LIMIT)
    .map((path) => ({ value: path, label: path }));
  const base = [
    { value: SANDBOX_DIR_VALUE, label: 'Thread sandbox (default)' },
    ...rootOptions,
    ...recentOptions,
  ];
  if (input.currentDirectory && !base.some((option) => option.value === input.currentDirectory)) {
    base.push({ value: input.currentDirectory, label: input.currentDirectory });
  }
  return [...base, { value: CUSTOM_DIR_VALUE, label: 'Custom path…' }];
}

export function loadRecentDirectories(orgId: string): string[] {
  try {
    const raw = localStorage.getItem(RECENT_DIRECTORIES_PREFIX + orgId);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function rememberRecentDirectory(orgId: string, directory: string): string[] {
  const previous = loadRecentDirectories(orgId).filter((item) => item !== directory);
  const next = [directory, ...previous].slice(0, RECENT_DIRECTORIES_LIMIT);
  try {
    localStorage.setItem(RECENT_DIRECTORIES_PREFIX + orgId, JSON.stringify(next));
  } catch {}
  return next;
}

export function isAbsoluteDirectoryPath(value: string): boolean {
  return value.startsWith('/');
}
