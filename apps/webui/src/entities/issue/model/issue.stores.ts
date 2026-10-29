import type {
  IssueBoardRecord,
  IssueBoardRules,
  IssueLabelRecord,
  IssueRecord,
} from '@harnesys/studio-shared';
import { create } from 'zustand';

interface IssueStore {
  items: IssueRecord[];
  byId: (id: string) => IssueRecord | undefined;
  inBoard: (boardId: string) => IssueRecord[];
  upsert: (issue: IssueRecord) => void;
  remove: (issueId: string) => void;
  replaceAll: (issues: IssueRecord[]) => void;
  setAttachmentCount: (issueId: string, count: number) => void;
}

export const useIssueStore = create<IssueStore>((set, get) => ({
  items: [],
  byId: (id) => get().items.find((item) => item.id === id),
  inBoard: (boardId) => get().items.filter((item) => item.boardId === boardId),
  upsert: (issue) => {
    set((state) => ({
      items: state.items.some((item) => item.id === issue.id)
        ? state.items.map((item) => (item.id === issue.id ? issue : item))
        : [...state.items, issue],
    }));
  },
  remove: (issueId) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== issueId && item.parentIssueId !== issueId),
    }));
  },
  replaceAll: (issues) => {
    set({ items: issues });
  },
  setAttachmentCount: (issueId, count) => {
    set((state) => ({
      items: state.items.map((item) =>
        item.id === issueId ? { ...item, attachmentCount: count } : item,
      ),
    }));
  },
}));

interface IssueBoardStore {
  boards: IssueBoardRecord[];
  boardById: (id: string) => IssueBoardRecord | undefined;
  rulesFor: (boardId: string) => IssueBoardRules;
  upsert: (board: IssueBoardRecord) => void;
  remove: (boardId: string) => void;
  replaceAll: (boards: IssueBoardRecord[]) => void;
}

export const useIssueBoardStore = create<IssueBoardStore>((set, get) => ({
  boards: [],
  boardById: (id) => get().boards.find((item) => item.id === id),
  rulesFor: (boardId) => get().boards.find((item) => item.id === boardId)?.rules ?? [],
  upsert: (board) => {
    set((state) => ({
      boards: state.boards.some((item) => item.id === board.id)
        ? state.boards.map((item) => (item.id === board.id ? board : item))
        : [...state.boards, board],
    }));
  },
  remove: (boardId) => {
    set((state) => ({
      boards: state.boards.filter((item) => item.id !== boardId),
    }));
  },
  replaceAll: (boards) => {
    set({ boards });
  },
}));

interface IssueLabelStore {
  items: IssueLabelRecord[];
  byId: (id: string) => IssueLabelRecord | undefined;
  upsert: (label: IssueLabelRecord) => void;
  remove: (labelId: string) => void;
  replaceAll: (labels: IssueLabelRecord[]) => void;
}

export const useIssueLabelStore = create<IssueLabelStore>((set, get) => ({
  items: [],
  byId: (id) => get().items.find((item) => item.id === id),
  upsert: (label) => {
    set((state) => ({
      items: state.items.some((item) => item.id === label.id)
        ? state.items.map((item) => (item.id === label.id ? label : item))
        : [...state.items, label],
    }));
  },
  remove: (labelId) => {
    set((state) => ({
      items: state.items.filter((item) => item.id !== labelId),
    }));
  },
  replaceAll: (labels) => {
    set({ items: labels });
  },
}));
