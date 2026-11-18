import type { WidgetDoc } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';
import { getPath } from './data/get-path';
import type { WidgetSourcesController } from './data/use-widget-sources';
import { WidgetNodeRenderer } from './primitives/node-renderer';
import { WidgetEmptyState, WidgetErrorState, WidgetLoadingState } from './primitives/states';
import { getPrimitiveComponent, NOOP_EMIT } from './registry';
import type { TransformRunner, TransformRunResult } from './types';
import { createTransformRunner } from './worker/bridge';

function propsFromConfig(config: Record<string, unknown>, root: unknown): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(config)) {
    if (key.length > 4 && key.endsWith('Path') && typeof value === 'string') {
      // `<name>Path` config entries resolve a path in the source data into
      // the `<name>` primitive prop (e.g. valuePath -> value).
      props[key.slice(0, -4)] = getPath(root, value);
    } else {
      props[key] = value;
    }
  }
  return props;
}

function firstSourceDatum(doc: WidgetDoc, data: Record<string, unknown>): unknown {
  return doc.sources.length > 0 ? data[doc.sources[0].id] : undefined;
}

/**
 * Pre-composite render path: sources (+ optional sandboxed transform) feed a
 * single primitive. Kept for agent-authored and legacy widgets.
 */
export function LegacyBody({
  orgId,
  dashboardId,
  widgetId,
  doc,
  src,
}: {
  orgId: string;
  dashboardId: string;
  widgetId: string;
  doc: WidgetDoc;
  src: WidgetSourcesController;
}): ReactNode {
  const runnerRef = useRef<TransformRunner | null>(null);
  const [runResult, setRunResult] = useState<TransformRunResult | null>(null);
  const [runToken, setRunToken] = useState(0);
  const [running, setRunning] = useState(false);
  const allErrored = doc.sources.length > 0 && doc.sources.every((source) => src.errors[source.id]);
  const noData = Object.keys(src.data).length === 0;

  useEffect(() => {
    const runner = createTransformRunner({ orgId, dashboardId, widgetId });
    runnerRef.current = runner;
    return () => {
      runnerRef.current = null;
      runner.dispose();
    };
  }, [orgId, dashboardId, widgetId]);

  useEffect(() => {
    const runner = runnerRef.current;
    if (!doc.transform || !runner || !src.ready) {
      return;
    }
    const attempt = runToken;
    let cancelled = false;
    setRunning(true);
    const pendingRun = runner
      .run({ code: doc.transform, sources: src.data, config: doc.config })
      .then((result) => {
        if (!cancelled && attempt === runToken) {
          setRunResult(result);
        }
      })
      .finally(() => {
        if (!cancelled && attempt === runToken) {
          setRunning(false);
        }
      });
    void pendingRun;
    return () => {
      cancelled = true;
    };
  }, [runToken, doc.transform, doc.config, src.ready, src.data]);

  const renderPrimitive = (primitiveProps: Record<string, unknown>): ReactNode => {
    const Entry = getPrimitiveComponent(doc.primitive);
    return <Entry.Component props={primitiveProps} emit={NOOP_EMIT} />;
  };

  const content = renderLegacyContent({
    doc,
    src,
    allErrored,
    noData,
    runResult,
    running,
    renderPrimitive,
    retryTransform: () => {
      setRunResult(null);
      setRunToken((token) => token + 1);
    },
  });

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden">{content}</div>
  );
}

function renderLegacyContent(args: {
  doc: WidgetDoc;
  src: WidgetSourcesController;
  allErrored: boolean;
  noData: boolean;
  runResult: TransformRunResult | null;
  running: boolean;
  renderPrimitive: (props: Record<string, unknown>) => ReactNode;
  retryTransform: () => void;
}): ReactNode {
  const { doc, src, allErrored, noData, runResult, running, renderPrimitive, retryTransform } =
    args;
  if (allErrored && noData) {
    const messages = doc.sources.map((source) => src.errors[source.id]).filter(Boolean);
    return (
      <WidgetErrorState
        title="Data unavailable"
        message={messages[0] ?? 'All sources failed'}
        onRetry={src.refetchAll}
      />
    );
  }
  if (!src.ready && noData) {
    return <WidgetLoadingState />;
  }
  if (doc.transform) {
    return renderTransformResult({ runResult, running, retryTransform, renderPrimitive, doc });
  }
  if (doc.primitive === 'custom') {
    return <WidgetEmptyState message="Custom widgets require a transform" />;
  }
  return renderPrimitive(propsFromConfig(doc.config, firstSourceDatum(doc, src.data)));
}

function renderTransformResult({
  runResult,
  running,
  retryTransform,
  renderPrimitive,
  doc,
}: {
  runResult: TransformRunResult | null;
  running: boolean;
  retryTransform: () => void;
  renderPrimitive: (props: Record<string, unknown>) => ReactNode;
  doc: WidgetDoc;
}): ReactNode {
  if (running && !runResult) {
    return <WidgetLoadingState />;
  }
  if (runResult && !runResult.ok) {
    return (
      <WidgetErrorState
        title="Transform failed"
        message={runResult.message}
        detail={runResult.stack}
        onRetry={retryTransform}
      />
    );
  }
  if (runResult?.ok && runResult.resultKind === 'node') {
    return <WidgetNodeRenderer node={runResult.node} />;
  }
  if (runResult?.ok && runResult.resultKind === 'data') {
    return renderPrimitive(propsFromConfig(doc.config, runResult.data));
  }
  return <WidgetLoadingState />;
}
