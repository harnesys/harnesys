import type { ExecutionProfile } from '@/shared/api';

export const THREAD_DIR_VALUE = 'thread';
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
