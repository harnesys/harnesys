import type { WidgetNode } from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { getPrimitiveComponent, NOOP_EMIT } from '../registry';
import { WidgetEmptyState, WidgetErrorState } from './states';

const MAX_NODE_DEPTH = 10;

/**
 * Recursively renders a WidgetNode tree produced by a transform. Primitives
 * compose: a `custom` node stacks its children, which may be metric/chart/
 * table nodes carrying their own props.
 */
export function WidgetNodeRenderer({
  node,
  depth = 0,
}: {
  node: WidgetNode;
  depth?: number;
}): ReactNode {
  if (depth > MAX_NODE_DEPTH) {
    return (
      <WidgetErrorState
        title="Nesting too deep"
        message={`Transform node tree exceeds ${MAX_NODE_DEPTH} levels.`}
      />
    );
  }

  const children = node.children ?? [];
  const content =
    node.primitive === 'custom'
      ? null
      : (() => {
          const Entry = getPrimitiveComponent(node.primitive);
          return <Entry.Component props={node.props} emit={NOOP_EMIT} />;
        })();

  if (node.primitive === 'custom' && children.length === 0) {
    return <WidgetEmptyState message="Custom transform returned no nodes" />;
  }
  if (children.length === 0) {
    return content;
  }

  return (
    <div className="flex h-full min-h-0 w-full flex-col gap-3">
      {content}
      {children.map((child, index) => (
        <WidgetNodeRenderer key={index} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}
