import type { DashboardWidget, WidgetDoc } from '@harnesys/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import {
  dashboardDetailQueryKey,
  dashboardsCatalogQuery,
  isWidgetConflict,
  useActivateDashboardWidget,
  useDeleteDashboardWidget,
  useUpdateDashboardWidget,
} from '@/features/dashboards/dashboards-queries';
import { cn } from '@/shared/lib/utils';
import { alert } from '@/shared/services/overlay';
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
import { Input } from '@/shared/ui/input';
import { ScrollArea } from '@/shared/ui/scroll-area';
import { toast } from '@/shared/ui/toast';
import type { WidgetDraft } from '../../model/inspector-store';
import { useDashboardInspectorStore } from '../../model/inspector-store';
import { sameWidgetDoc } from '../../model/widget-form';
import { ApproveWidgetDialog } from '../approve-widget-dialog';
import { IconPicker } from '../icon-picker';
import { WidgetJsonEditorDialog } from '../widget-json-editor-dialog';
import { SourcesEditor } from './inspector-sources';
import { StateEditor } from './inspector-state';
import { ItemForm } from './item-form';
import { Section } from './section';
import { TransformEditor } from './transform-editor';
import { WidgetInspectorHeader } from './widget-inspector-header';

interface WidgetInspectorProps {
  orgId: string;
  dashboardId: string;
  widgets: DashboardWidget[];
}

export function WidgetInspector({
  orgId,
  dashboardId,
  widgets,
}: WidgetInspectorProps): React.ReactNode {
  const storeDashboardId = useDashboardInspectorStore((state) => state.dashboardId);
  const selectedWidgetId = useDashboardInspectorStore((state) => state.selectedWidgetId);
  const drafts = useDashboardInspectorStore((state) => state.drafts);

  const selected =
    storeDashboardId === dashboardId && selectedWidgetId
      ? (widgets.find((widget) => widget.id === selectedWidgetId) ?? null)
      : null;

  if (!selected) {
    return (
      <div className="flex min-h-0 flex-1 items-center justify-center px-4">
        <p className="text-center text-[11px] text-muted-foreground">
          Select a widget on the canvas to edit it.
        </p>
      </div>
    );
  }

  return (
    <WidgetConstructor
      key={selected.id}
      orgId={orgId}
      dashboardId={dashboardId}
      widget={selected}
      draft={drafts[selected.id] ?? null}
    />
  );
}

function WidgetConstructor({
  orgId,
  dashboardId,
  widget,
  draft,
}: {
  orgId: string;
  dashboardId: string;
  widget: DashboardWidget;
  draft: WidgetDraft | null;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const setDraft = useDashboardInspectorStore((state) => state.setDraft);
  const clearDraft = useDashboardInspectorStore((state) => state.clearDraft);
  const undoDraft = useDashboardInspectorStore((state) => state.undoDraft);
  const redoDraft = useDashboardInspectorStore((state) => state.redoDraft);
  const selectedItemId = useDashboardInspectorStore((state) => state.selectedItemId);
  const selectItem = useDashboardInspectorStore((state) => state.selectItem);
  const update = useUpdateDashboardWidget(orgId, dashboardId);
  const remove = useDeleteDashboardWidget(orgId, dashboardId);
  const activate = useActivateDashboardWidget(orgId, dashboardId);
  const catalogQuery = useQuery(dashboardsCatalogQuery(orgId));
  const catalog = catalogQuery.data?.items ?? [];
  const [jsonOpen, setJsonOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [conflictOpen, setConflictOpen] = useState(false);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const confirmRemove = (): void => {
    void alert
      .confirm({
        title: `Delete widget "${doc.title}"?`,
        description: 'The widget and its persisted state are removed from the dashboard.',
        confirmText: 'Delete widget',
        variant: 'destructive',
      })
      .then((confirmed) => {
        if (!confirmed) {
          return;
        }
        remove.mutate(widget.id, {
          onSuccess: () => {
            clearDraft(widget.id);
            useDashboardInspectorStore.getState().clearSelection();
          },
        });
      });
  };

  const doc = draft?.doc ?? widget.doc;
  const dirty = draft !== null && !sameWidgetDoc(draft.doc, widget.doc);
  const isDraftStatus = widget.status === 'draft';
  const isComposite = doc.items.length > 0;
  const edit = (next: WidgetDoc): void => setDraft(widget.id, next, widget.updatedAt);

  useEffect(() => {
    if (selectedItemId) {
      itemRefs.current[selectedItemId]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedItemId]);

  const save = (force: boolean): void => {
    update.mutate(
      {
        widgetId: widget.id,
        body: { doc },
        ...(!force && draft ? { baseUpdatedAt: draft.baseUpdatedAt } : {}),
      },
      {
        onSuccess: () => {
          clearDraft(widget.id);
          setConflictOpen(false);
          toast.add({ title: isDraftStatus ? 'Draft saved' : 'Widget saved', type: 'success' });
        },
        onError: (error) => {
          if (isWidgetConflict(error)) {
            setConflictOpen(true);
            return;
          }
          toast.add({ title: 'Failed to save widget', type: 'error' });
        },
      },
    );
  };

  const reload = (): void => {
    clearDraft(widget.id);
    setConflictOpen(false);
    void queryClient.invalidateQueries({ queryKey: dashboardDetailQueryKey(orgId, dashboardId) });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <WidgetInspectorHeader
        doc={doc}
        draft={draft}
        isDraftStatus={isDraftStatus}
        dirty={dirty}
        saving={update.isPending}
        approving={activate.isPending}
        deleting={remove.isPending}
        onUndo={() => undoDraft(widget.id)}
        onRedo={() => redoDraft(widget.id)}
        onEditJson={() => setJsonOpen(true)}
        onApprove={() => setApproveOpen(true)}
        onSave={() => save(false)}
        onDiscard={() => clearDraft(widget.id)}
        onDelete={confirmRemove}
        onDeselect={() => useDashboardInspectorStore.getState().clearSelection()}
      />
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-3 px-3 py-3 pb-6">
          <Section label="Title">
            <Input
              value={doc.title}
              onChange={(event) => edit({ ...doc, title: event.target.value })}
              className="h-8"
              aria-label="Widget title"
              data-testid="inspector-widget-title"
            />
          </Section>
          <Section label="Icon" hint={doc.icon}>
            <IconPicker
              value={doc.icon ?? null}
              onChange={(icon) => edit({ ...doc, icon: icon ?? undefined })}
              testIdPrefix="inspector-widget-icon"
              allowNone
            />
          </Section>
          <Section label="Sources" hint={`${doc.sources.length}/10`}>
            <SourcesEditor
              orgId={orgId}
              catalog={catalog}
              sources={doc.sources}
              onChange={(sources) => edit({ ...doc, sources })}
            />
          </Section>
          <Section label="State" hint={Object.keys(doc.state).length > 0 ? undefined : 'empty'}>
            <StateEditor
              state={doc.state}
              persisted={doc.persistedState ?? []}
              onChange={(state) => edit({ ...doc, state })}
              onPersistChange={(persistedState) =>
                edit({
                  ...doc,
                  persistedState: persistedState.length > 0 ? persistedState : undefined,
                })
              }
            />
          </Section>
          <Section label="Primitives" hint={`${doc.items.length}/30`}>
            {isComposite ? (
              <div className="flex flex-col gap-2">
                {doc.items.map((item, index) => (
                  <div
                    key={item.id}
                    ref={(node) => {
                      itemRefs.current[item.id] = node;
                    }}
                    className={cn(
                      'rounded-lg border bg-card transition-colors',
                      selectedItemId === item.id && 'border-live',
                    )}
                    data-testid={`inspector-item-${item.id}`}
                  >
                    <ItemForm
                      orgId={orgId}
                      catalog={catalog}
                      item={item}
                      doc={doc}
                      index={index}
                      focused={selectedItemId === item.id}
                      onFocus={() => selectItem(widget.id, item.id)}
                      onChange={(next) =>
                        edit({
                          ...doc,
                          items: doc.items.map((entry) => (entry.id === item.id ? next : entry)),
                        })
                      }
                      onRemove={() =>
                        edit({
                          ...doc,
                          items: doc.items.filter((entry) => entry.id !== item.id),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Legacy single-primitive widget. Add primitives from the widget header{' '}
                <span className="font-mono">+</span> button in Edit mode to compose it.
              </p>
            )}
          </Section>
          {!isComposite ? (
            <TransformEditor
              value={doc.transform}
              onChange={(transform) => edit({ ...doc, transform })}
            />
          ) : null}
        </div>
      </ScrollArea>
      <WidgetJsonEditorDialog
        open={jsonOpen}
        onOpenChange={setJsonOpen}
        initial={doc}
        onSave={(next) => edit(next)}
      />
      <ApproveWidgetDialog
        open={approveOpen}
        onOpenChange={setApproveOpen}
        title={doc.title}
        orgId={orgId}
        doc={doc}
        pending={activate.isPending}
        onConfirm={() =>
          activate.mutate(widget.id, {
            onSuccess: () => {
              setApproveOpen(false);
              useDashboardInspectorStore.getState().clearSelection();
            },
          })
        }
      />
      <AlertDialog open={conflictOpen} onOpenChange={setConflictOpen}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>Widget changed on the server</AlertDialogTitle>
            <AlertDialogDescription>
              Someone else saved this widget after your draft started. Overwrite keeps your version;
              reload discards the draft and shows the saved one.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={reload}>Reload</AlertDialogCancel>
            <AlertDialogAction onClick={() => save(true)}>Overwrite</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
