import type { DashboardWidget, WidgetDoc } from '@harnesys/contracts';
import { create } from 'zustand';
import { sameWidgetDoc } from './widget-form';

/** Buffered widget edit: the doc, the server revision it started from, and its own undo stack. */
export interface WidgetDraft {
  doc: WidgetDoc;
  baseUpdatedAt: string;
  past: WidgetDoc[];
  future: WidgetDoc[];
}

export const DRAFT_HISTORY_LIMIT = 50;

interface DashboardInspectorState {
  dashboardId: string | null;
  editMode: boolean;
  selectedWidgetId: string | null;
  selectedItemId: string | null;
  drafts: Record<string, WidgetDraft>;
  setEditMode: (dashboardId: string, on: boolean) => void;
  selectWidget: (dashboardId: string, widgetId: string) => void;
  selectItem: (widgetId: string, itemId: string) => void;
  /** Selects a widget and focuses one of its primitives in one step. */
  selectWidgetItem: (dashboardId: string, widgetId: string, itemId: string) => void;
  setDraft: (widgetId: string, doc: WidgetDoc, baseUpdatedAt: string) => void;
  undoDraft: (widgetId: string) => void;
  redoDraft: (widgetId: string) => void;
  clearDraft: (widgetId: string) => void;
  clearSelection: () => void;
  closeDashboard: () => void;
}

export const useDashboardInspectorStore = create<DashboardInspectorState>()((set) => ({
  dashboardId: null,
  editMode: false,
  selectedWidgetId: null,
  selectedItemId: null,
  drafts: {},
  /** Pins the surface so editMode selectors match after a fresh page load. */
  setEditMode: (dashboardId, on) =>
    set((state) => ({
      dashboardId,
      editMode: on,
      selectedWidgetId: on ? state.selectedWidgetId : null,
      selectedItemId: on ? state.selectedItemId : null,
    })),
  selectWidget: (dashboardId, widgetId) =>
    set({
      dashboardId,
      selectedWidgetId: widgetId,
      selectedItemId: null,
      editMode: true,
    }),
  selectItem: (widgetId, itemId) =>
    set((state) => ({
      selectedWidgetId: widgetId,
      selectedItemId: state.selectedWidgetId === widgetId ? itemId : null,
    })),
  selectWidgetItem: (dashboardId, widgetId, itemId) =>
    set({ dashboardId, selectedWidgetId: widgetId, selectedItemId: itemId, editMode: true }),
  setDraft: (widgetId, doc, baseUpdatedAt) =>
    set((state) => {
      const current = state.drafts[widgetId];
      if (!current) {
        return {
          drafts: { ...state.drafts, [widgetId]: { doc, baseUpdatedAt, past: [], future: [] } },
        };
      }
      if (sameWidgetDoc(current.doc, doc)) {
        return state;
      }
      return {
        drafts: {
          ...state.drafts,
          [widgetId]: {
            doc,
            baseUpdatedAt: current.baseUpdatedAt,
            past: [...current.past, current.doc].slice(-DRAFT_HISTORY_LIMIT),
            future: [],
          },
        },
      };
    }),
  undoDraft: (widgetId) =>
    set((state) => {
      const current = state.drafts[widgetId];
      const previous = current?.past.at(-1);
      if (!current || previous === undefined) {
        return state;
      }
      return {
        drafts: {
          ...state.drafts,
          [widgetId]: {
            doc: previous,
            baseUpdatedAt: current.baseUpdatedAt,
            past: current.past.slice(0, -1),
            future: [current.doc, ...current.future].slice(0, DRAFT_HISTORY_LIMIT),
          },
        },
      };
    }),
  redoDraft: (widgetId) =>
    set((state) => {
      const current = state.drafts[widgetId];
      const [next, ...rest] = current?.future ?? [];
      if (!current || next === undefined) {
        return state;
      }
      return {
        drafts: {
          ...state.drafts,
          [widgetId]: {
            doc: next,
            baseUpdatedAt: current.baseUpdatedAt,
            past: [...current.past, current.doc].slice(-DRAFT_HISTORY_LIMIT),
            future: rest,
          },
        },
      };
    }),
  clearDraft: (widgetId) =>
    set((state) => {
      const drafts = { ...state.drafts };
      delete drafts[widgetId];
      return { drafts };
    }),
  clearSelection: () => set({ selectedWidgetId: null, selectedItemId: null }),
  closeDashboard: () =>
    set({
      dashboardId: null,
      editMode: false,
      selectedWidgetId: null,
      selectedItemId: null,
      drafts: {},
    }),
}));

export function dirtyDraftIds(
  drafts: Record<string, WidgetDraft>,
  widgets: DashboardWidget[],
): string[] {
  const saved = new Map(widgets.map((widget) => [widget.id, widget.doc]));
  return Object.entries(drafts)
    .filter(([widgetId, draft]) => {
      const doc = saved.get(widgetId);
      return doc !== undefined && !sameWidgetDoc(doc, draft.doc);
    })
    .map(([widgetId]) => widgetId);
}
