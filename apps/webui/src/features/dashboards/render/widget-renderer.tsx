import type { WidgetDoc, WidgetItem } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
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
import { useWidgetPersistedState } from '../dashboards-queries';
import { BoardItemsBody } from './board/board-items-body';
import { CompositeBody } from './composite-body';
import { useWidgetRuntime, type WidgetStateRef } from './data/use-widget-runtime';
import { useWidgetSources } from './data/use-widget-sources';
import { ItemErrorBoundary } from './item-error-boundary';
import { LegacyBody } from './legacy-body';
import { WidgetRuntimeContext } from './runtime-context';

export type { PrimitiveComponent, WidgetDefinitionMeta } from './registry';

interface ConfirmPrompt {
  request: (message: string) => Promise<boolean>;
  dialog: ReactNode;
}

function useConfirmPrompt(): ConfirmPrompt {
  const [message, setMessage] = useState<string | null>(null);
  const resolverRef = useRef<((answer: boolean) => void) | null>(null);

  const settle = (answer: boolean): void => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setMessage(null);
    resolve?.(answer);
  };

  const request = (text: string): Promise<boolean> =>
    new Promise<boolean>((resolve) => {
      resolverRef.current?.(false);
      resolverRef.current = resolve;
      setMessage(text);
    });

  const dialog = (
    <AlertDialog
      open={message !== null}
      onOpenChange={(open) => {
        if (!open) {
          settle(false);
        }
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>Confirm action</AlertDialogTitle>
          <AlertDialogDescription className="whitespace-pre-wrap break-words">
            {message ?? ''}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={() => settle(true)}>Run</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { request, dialog };
}

export interface WidgetRendererProps {
  orgId: string;
  dashboardId: string;
  widgetId: string;
  doc: WidgetDoc;
  /** Bump to refetch all declared sources (shell Refresh action). */
  refreshSignal?: number;
  /** Canvas edit mode: item boxes become draggable/resizable/selectable. */
  editMode?: boolean;
  selectedItemId?: string | null;
  onSelectItem?: (itemId: string) => void;
  /** Subgrid slot changes (inner drag/resize stop); the surface buffers these as a draft. */
  onItemsLayoutChange?: (items: WidgetItem[]) => void;
  /** Broad layout: inner 12-col grid, or stacked primitives (mobile). */
  bodyVariant?: 'grid' | 'stack';
}

/**
 * Widget render engine. Composite docs (with `items`) render an internal
 * subgrid of primitives sharing one reactive scope (state + sources + derived);
 * legacy docs resolve sources/transform and render a single primitive. Both
 * paths expose the same runtime context to interactive primitives.
 */
export function WidgetRenderer(props: WidgetRendererProps): ReactNode {
  const {
    orgId,
    dashboardId,
    widgetId,
    doc,
    refreshSignal = 0,
    editMode = false,
    selectedItemId = null,
    onSelectItem,
    onItemsLayoutChange,
    bodyVariant = 'grid',
  } = props;
  const persisted = useWidgetPersistedState(orgId, dashboardId, widgetId, doc.persistedState);
  const initialState = { ...doc.state, ...persisted.values };
  const paramStateRef: WidgetStateRef = useRef<Record<string, unknown>>(initialState);
  const prompt = useConfirmPrompt();
  const src = useWidgetSources({
    orgId,
    dashboardId,
    widgetId,
    sources: doc.sources,
    getState: () => paramStateRef.current,
  });
  const runtime = useWidgetRuntime({
    orgId,
    initialState,
    derivedDefs: doc.derived,
    src,
    requestConfirm: prompt.request,
    stateRef: paramStateRef,
    persistedKeys: doc.persistedState,
    onPersistedChange: persisted.write,
  });

  const refetchRef = useRef(src.refetchAll);
  useEffect(() => {
    refetchRef.current = src.refetchAll;
  });
  useEffect(() => {
    if (refreshSignal > 0) {
      refetchRef.current();
    }
  }, [refreshSignal]);

  const contextValue = {
    orgApi: runtime.orgApi,
    invokeExternal: src.invokeExternal,
    state: runtime.state,
    setState: runtime.setState,
    dispatch: runtime.dispatch,
  };

  const compositeItems = doc.items.length > 0;
  const renderItems =
    compositeItems &&
    (bodyVariant === 'stack' ? (
      <BoardItemsBody
        orgId={orgId}
        doc={doc}
        data={src.data}
        runtime={runtime}
        editMode={editMode}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
      />
    ) : (
      <CompositeBody
        orgId={orgId}
        doc={doc}
        data={src.data}
        runtime={runtime}
        editMode={editMode}
        selectedItemId={selectedItemId}
        onSelectItem={onSelectItem}
        onItemsLayoutChange={onItemsLayoutChange}
      />
    ));

  const body = renderItems ? (
    renderItems
  ) : (
    <ItemErrorBoundary itemId={widgetId}>
      <LegacyBody orgId={orgId} dashboardId={dashboardId} widgetId={widgetId} doc={doc} src={src} />
    </ItemErrorBoundary>
  );

  return (
    <WidgetRuntimeContext value={contextValue}>
      {body}
      {prompt.dialog}
    </WidgetRuntimeContext>
  );
}
