import type { DashboardWidget } from '@harnesys/contracts';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';
import { dirtyDraftIds, useDashboardInspectorStore } from '../model/inspector-store';

interface PendingSelection {
  dashboardId: string;
  widgetId: string;
}

export interface DraftSelectionGuard {
  requestSelect: (dashboardId: string, widgetId: string) => void;
  dialog: React.ReactNode;
}

/**
 * Selection goes through here so an unsaved widget draft is never dropped
 * silently: switching widgets asks, and either keeps the draft discarded or
 * the edit in place.
 */
export function useDraftSelectionGuard(widgets: DashboardWidget[]): DraftSelectionGuard {
  const drafts = useDashboardInspectorStore((state) => state.drafts);
  const selectedWidgetId = useDashboardInspectorStore((state) => state.selectedWidgetId);
  const selectWidget = useDashboardInspectorStore((state) => state.selectWidget);
  const clearDraft = useDashboardInspectorStore((state) => state.clearDraft);
  const [pending, setPending] = useState<PendingSelection | null>(null);

  const selectedDirty =
    selectedWidgetId !== null && dirtyDraftIds(drafts, widgets).includes(selectedWidgetId);

  const requestSelect = (dashboardId: string, widgetId: string): void => {
    if (!selectedDirty || widgetId === selectedWidgetId) {
      selectWidget(dashboardId, widgetId);
      return;
    }
    setPending({ dashboardId, widgetId });
  };

  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
          <AlertDialogDescription>
            This widget has edits that are not saved yet. Switching drops them.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPending(null)}>Keep editing</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (selectedWidgetId) {
                clearDraft(selectedWidgetId);
              }
              if (pending) {
                selectWidget(pending.dashboardId, pending.widgetId);
              }
              setPending(null);
            }}
          >
            Discard and switch
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestSelect, dialog };
}
