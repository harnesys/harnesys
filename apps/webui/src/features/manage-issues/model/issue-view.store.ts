import type { IssueType } from '@harnesys/studio-shared';
import { create } from 'zustand';

export type IssueViewMode = 'kanban' | 'list';

export interface IssueFilters {
  statuses: string[];
  priorities: number[];
  types: IssueType[];
  labels: string[];
  assignees: string[];
}

export type IssueSortField =
  | 'priority'
  | 'createdAt'
  | 'updatedAt'
  | 'dueDate'
  | 'title'
  | 'type'
  | 'status';

export type IssueSortOrder = 'asc' | 'desc';

export interface IssueSort {
  field: IssueSortField;
  order: IssueSortOrder;
}

export interface BoardViewSettings {
  mode: IssueViewMode;
  hiddenStatuses: string[];
  filters: IssueFilters;
  sort: IssueSort;
}

export const EMPTY_ISSUE_FILTERS: IssueFilters = {
  statuses: [],
  priorities: [],
  types: [],
  labels: [],
  assignees: [],
};

const DEFAULT_SETTINGS: BoardViewSettings = {
  mode: 'kanban',
  hiddenStatuses: [],
  filters: EMPTY_ISSUE_FILTERS,
  sort: { field: 'priority', order: 'asc' },
};

interface IssueViewState {
  byBoard: Record<string, BoardViewSettings>;
  patch: (boardId: string, patch: Partial<BoardViewSettings>) => void;
  setFilters: (boardId: string, patch: Partial<IssueFilters>) => void;
  setSort: (boardId: string, field: IssueSortField) => void;
}

function readSettings(state: IssueViewState, boardId: string): BoardViewSettings {
  return state.byBoard[boardId] ?? DEFAULT_SETTINGS;
}

export const useIssueViewStore = create<IssueViewState>((set) => ({
  byBoard: {},
  patch: (boardId, patch) => {
    set((state) => ({
      byBoard: { ...state.byBoard, [boardId]: { ...readSettings(state, boardId), ...patch } },
    }));
  },
  setFilters: (boardId, patch) => {
    set((state) => {
      const current = readSettings(state, boardId);
      return {
        byBoard: {
          ...state.byBoard,
          [boardId]: { ...current, filters: { ...current.filters, ...patch } },
        },
      };
    });
  },
  setSort: (boardId, field) => {
    set((state) => {
      const current = readSettings(state, boardId);
      const order = current.sort.field === field && current.sort.order === 'asc' ? 'desc' : 'asc';
      return {
        byBoard: { ...state.byBoard, [boardId]: { ...current, sort: { field, order } } },
      };
    });
  },
}));

export function useBoardViewSettings(boardId: string): BoardViewSettings {
  return useIssueViewStore((state) => readSettings(state, boardId));
}
