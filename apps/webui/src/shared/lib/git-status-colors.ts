import type { GitFileStatus } from '@harnesys/studio-shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
export type GitStatusColors = Record<GitFileStatus, string>;
export const DEFAULT_GIT_STATUS_COLORS: GitStatusColors = {
  conflicted: '#d5756c',
  modified: '#6997bb',
  staged: '#629755',
  added: '#629755',
  renamed: '#3a8484',
  deleted: '#6c6c6c',
  untracked: '#d1665a',
  ignored: '#838505',
};
export interface GitStatusSettingsRow {
  label: string;
  status: GitFileStatus;
}
export interface GitStatusSettingsGroup {
  label: string;
  rows: GitStatusSettingsRow[];
}
export const GIT_STATUS_GROUPS: GitStatusSettingsGroup[] = [
  {
    label: 'Working tree',
    rows: [
      { label: 'Modified', status: 'modified' },
      { label: 'Deleted', status: 'deleted' },
      { label: 'Untracked', status: 'untracked' },
      { label: 'Ignored', status: 'ignored' },
    ],
  },
  {
    label: 'Index',
    rows: [
      { label: 'Added', status: 'added' },
      { label: 'Staged', status: 'staged' },
      { label: 'Renamed', status: 'renamed' },
      { label: 'Conflicted', status: 'conflicted' },
    ],
  },
];
export const GIT_STATUS_STATUSES: GitFileStatus[] = GIT_STATUS_GROUPS.flatMap((group) =>
  group.rows.map((row) => row.status),
);
export const GIT_STATUS_COLORS_STORAGE_KEY = 'studio-git-status-colors';
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
function isHex(value: unknown): value is string {
  return typeof value === 'string' && HEX_RE.test(value);
}
function sanitizeColors(input: unknown): GitStatusColors {
  const next = { ...DEFAULT_GIT_STATUS_COLORS };
  if (input && typeof input === 'object') {
    const record = input as Record<string, unknown>;
    for (const status of GIT_STATUS_STATUSES) {
      const value = record[status];
      if (isHex(value)) {
        next[status] = value.toLowerCase();
      }
    }
  }
  return next;
}
export interface GitStatusColorsState {
  colors: GitStatusColors;
  setColor: (status: GitFileStatus, value: string) => void;
  resetColors: () => void;
}
export const useGitStatusColors = create<GitStatusColorsState>()(
  persist(
    (set) => ({
      colors: DEFAULT_GIT_STATUS_COLORS,
      setColor: (status, value) => {
        if (!isHex(value)) {
          return;
        }
        set((state) => ({ colors: { ...state.colors, [status]: value.toLowerCase() } }));
      },
      resetColors: () => set({ colors: DEFAULT_GIT_STATUS_COLORS }),
    }),
    {
      name: GIT_STATUS_COLORS_STORAGE_KEY,
      version: 1,
      partialize: (state) => ({ colors: state.colors }),
      migrate: (persisted) => {
        const state = persisted as {
          colors?: unknown;
        };
        return { colors: sanitizeColors(state.colors) };
      },
    },
  ),
);
export function gitStatusColorClass(status: GitFileStatus): string {
  switch (status) {
    case 'deleted':
      return 'line-through';
    case 'ignored':
      return 'opacity-70';
    default:
      return '';
  }
}
