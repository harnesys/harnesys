import { type Expr, primitiveById, rowBindingsOf, type WidgetItem } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import type { WidgetRuntime } from './data/use-widget-runtime';

/** Derived value definitions keyed by name, as stored on the widget doc. */
export type DerivedDefs = Record<string, Expr>;

import { dependenciesOf } from './engine/deps';
import type { ExprDiagnostic, ExprRoots } from './engine/expr-eval';
import { evaluateBinding, evaluateExpr } from './engine/expr-eval';
import { EXPR_ROOTS_PROP } from './engine/row-bindings';
import { ItemErrorBoundary } from './item-error-boundary';
import { WidgetErrorState, WidgetLoadingState, WidgetPropsErrorState } from './primitives/states';
import { getPrimitiveComponent } from './registry';

/** Item props = static `props` overridden by evaluated `bindings`. */
export function resolveItemProps(
  item: WidgetItem,
  roots: ExprRoots,
  diagnostics: ExprDiagnostic[],
): Record<string, unknown> {
  const props: Record<string, unknown> = { ...item.props };
  for (const [key, expr] of Object.entries(item.bindings)) {
    const bindingDiagnostics: ExprDiagnostic[] = [];
    props[key] = evaluateBinding(expr, roots, bindingDiagnostics);
    for (const entry of bindingDiagnostics) {
      diagnostics.push({ ...entry, path: `bindings.${key}${entry.path ? `.${entry.path}` : ''}` });
    }
  }
  return props;
}

/**
 * One emitter per item: event handlers from `item.on` win; a legacy item
 * `action` still fires on `click` when the item declares no click handler.
 */
export function itemEmit(
  item: WidgetItem,
  runtime: WidgetRuntime,
): (event: string, payload?: unknown) => void {
  return (event, payload) => {
    const handler = item.on[event];
    if (handler !== undefined) {
      void runtime.dispatch(handler, { event: payload });
      return;
    }
    if (event === 'click' && item.action !== undefined) {
      void runtime.dispatch(item.action, { event: payload });
    }
  };
}

export interface ItemContentProps {
  item: WidgetItem;
  data: Record<string, unknown>;
  runtime: WidgetRuntime;
  orgId: string;
  derivedDefs: DerivedDefs;
  editMode: boolean;
}

/** Visibility, per-source gating, binding resolution and rendering for one item. */
export function ItemContent({
  item,
  data,
  runtime,
  orgId,
  derivedDefs,
  editMode,
}: ItemContentProps): ReactNode {
  const itemDiagnostics: ExprDiagnostic[] = [];
  const roots: ExprRoots = {
    state: runtime.state,
    sources: data,
    status: runtime.sourceStatus,
    derived: runtime.derived,
    event: null,
    row: null,
    org: { id: orgId },
  };
  if (item.visibleWhen !== undefined && !evaluateExpr(item.visibleWhen, roots)) {
    return null;
  }

  const dependencies = dependenciesOf(item, derivedDefs);
  const failedId = dependencies.find((id) => {
    const status = runtime.sourceStatus[id];
    return status !== undefined && status.error !== null;
  });
  if (failedId !== undefined) {
    return (
      <WidgetErrorState
        title="Data unavailable"
        message={runtime.sourceStatus[failedId]?.error ?? 'Source failed'}
        onRetry={() => runtime.retrySource(failedId)}
      />
    );
  }
  const loading = dependencies.some(
    (id) => runtime.sourceStatus[id]?.loading === true && data[id] === undefined,
  );
  if (loading) {
    return <WidgetLoadingState />;
  }

  const itemProps = resolveItemProps(item, roots, itemDiagnostics);
  const descriptor = primitiveById(item.primitive);
  const parsedProps = descriptor?.props.safeParse(itemProps);
  if (descriptor && parsedProps && !parsedProps.success) {
    const issue = parsedProps.error.issues[0];
    return (
      <WidgetPropsErrorState
        itemId={item.id}
        message={`${issue?.path.join('.') || 'props'}: ${issue?.message ?? 'invalid props'}`}
        detail={
          parsedProps.error.issues.length > 1
            ? `${parsedProps.error.issues.length} issues`
            : undefined
        }
      />
    );
  }
  const resolvedProps =
    parsedProps?.success === true ? (parsedProps.data as Record<string, unknown>) : itemProps;
  const Entry = getPrimitiveComponent(item.primitive);
  const componentProps =
    rowBindingsOf(resolvedProps) === null
      ? resolvedProps
      : { ...resolvedProps, [EXPR_ROOTS_PROP]: roots };
  return (
    <ItemErrorBoundary itemId={item.id} resetKey={JSON.stringify(resolvedProps)}>
      {editMode && itemDiagnostics.length > 0 ? (
        <WidgetErrorState
          title="Binding diagnostics"
          message={itemDiagnostics.map((d) => `${d.path}: ${d.message}`).join('; ')}
        />
      ) : null}
      <Entry.Component props={componentProps} emit={itemEmit(item, runtime)} />
    </ItemErrorBoundary>
  );
}
