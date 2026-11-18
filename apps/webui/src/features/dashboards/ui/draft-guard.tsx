import type { DashboardDetail } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { type AlertComponentProps, alert } from '@/shared/services/overlay';
import { AlertDialogAction, AlertDialogCancel, AlertDialogFooter } from '@/shared/ui/alert-dialog';
import { toast } from '@/shared/ui/toast';
import { isWidgetConflict, useUpdateDashboardWidget } from '../dashboards-queries';
import { dirtyDraftIds, useDashboardInspectorStore } from '../model/inspector-store';

interface PendingSelection {
  dashboardId: string;
  widgetId: string;
}

type UnsavedChangeChoice = 'save' | 'discard';

export interface DraftSelectionGuard {
  requestSelect: (dashboardId: string, widgetId: string) => void;
}

function UnsavedChangesAlert({ onResolve }: AlertComponentProps<UnsavedChangeChoice>): ReactNode {
  return (
    <AlertDialogFooter>
      <AlertDialogCancel onClick={() => onResolve?.(undefined)}>Keep editing</AlertDialogCancel>
      <AlertDialogAction variant="outline" onClick={() => onResolve?.('discard')}>
        Discard changes
      </AlertDialogAction>
      <AlertDialogAction onClick={() => onResolve?.('save')}>Save and switch</AlertDialogAction>
    </AlertDialogFooter>
  );
}

/**
 * Selection goes through here so an unsaved widget draft is never dropped
 * silently: switching widgets asks, and either keeps the draft, discards it, or
 * saves it before the switch.
 */
export function useDraftSelectionGuard(dashboard: DashboardDetail): DraftSelectionGuard {
  const drafts = useDashboardInspectorStore((state) => state.drafts);
  const selectedWidgetId = useDashboardInspectorStore((state) => state.selectedWidgetId);
  const selectWidget = useDashboardInspectorStore((state) => state.selectWidget);
  const clearDraft = useDashboardInspectorStore((state) => state.clearDraft);
  const update = useUpdateDashboardWidget(dashboard.orgId, dashboard.id);

  const selectedDirty =
    selectedWidgetId !== null &&
    dirtyDraftIds(drafts, dashboard.widgets).includes(selectedWidgetId);

  const switchTo = (pending: PendingSelection): void => {
    selectWidget(pending.dashboardId, pending.widgetId);
  };

  const saveAndSwitch = (pending: PendingSelection, widgetId: string): void => {
    const draft = useDashboardInspectorStore.getState().drafts[widgetId] ?? null;
    if (draft === null) {
      switchTo(pending);
      return;
    }
    update.mutate(
      {
        widgetId,
        body: { doc: draft.doc },
        baseUpdatedAt: draft.baseUpdatedAt,
      },
      {
        onSuccess: () => {
          clearDraft(widgetId);
          switchTo(pending);
          toast.add({ title: 'Widget saved', type: 'success' });
        },
        onError: (error) => {
          toast.add({
            title: isWidgetConflict(error)
              ? 'Widget changed elsewhere — reload it before saving'
              : 'Failed to save widget',
            type: 'error',
          });
        },
      },
    );
  };

  const requestSelect = (dashboardId: string, widgetId: string): void => {
    if (!selectedDirty || widgetId === selectedWidgetId || selectedWidgetId === null) {
      selectWidget(dashboardId, widgetId);
      return;
    }
    const pending: PendingSelection = { dashboardId, widgetId };
    const currentWidgetId = selectedWidgetId;
    void alert
      .open<UnsavedChangeChoice>(UnsavedChangesAlert, {
        title: 'Unsaved changes',
        description:
          'This widget has edits that are not saved yet. Save them before switching, or discard them.',
        testId: 'draft-guard',
      })
      .then((choice) => {
        if (choice === null) {
          return;
        }
        if (choice === 'discard') {
          clearDraft(currentWidgetId);
          switchTo(pending);
          return;
        }
        saveAndSwitch(pending, currentWidgetId);
      });
  };

  return { requestSelect };
}
