import { type MouseEvent as ReactMouseEvent, useRef, useState } from 'react';
import type { IdeSplitNode, IdeTab } from '@/features/ide';
import {
  firstGroupOfLayout,
  lastGroupOfLayout,
  useIdeGroup,
  useIdeStore,
  useIdeTabs,
} from '@/features/ide';
import { cn } from '@/shared/lib/utils';
import { Resizer } from '@/shared/ui/resizer';
import { IdeTabContent } from '@/widgets/ide-content';
import { IdeGroupTabs, ideDrag, takeIdeDrag } from '@/widgets/ide-tabs';
export function IdeLayoutView() {
  const layout = useIdeStore((state) => state.workspace.layout);
  if (!layout) {
    return null;
  }
  return (
    <SplitNodeView
      node={layout}
      leadingGroupId={firstGroupOfLayout(layout)}
      trailingGroupId={lastGroupOfLayout(layout)}
    />
  );
}
function SplitNodeView({
  node,
  leadingGroupId,
  trailingGroupId,
}: {
  node: IdeSplitNode;
  leadingGroupId: string;
  trailingGroupId: string;
}) {
  if (node.kind === 'group') {
    return (
      <IdeGroupPane
        groupId={node.groupId}
        leading={node.groupId === leadingGroupId}
        trailing={node.groupId === trailingGroupId}
      />
    );
  }
  return (
    <IdeSplitView node={node} leadingGroupId={leadingGroupId} trailingGroupId={trailingGroupId} />
  );
}
function GroupContent({ activeTab }: { activeTab: IdeTab | null }) {
  if (activeTab) {
    return <IdeTabContent tab={activeTab} projectId={activeTab.projectId} />;
  }
  return (
    <div className="flex flex-1 items-center justify-center text-muted-foreground text-sm">
      No tab
    </div>
  );
}
function IdeSplitView({
  node,
  leadingGroupId,
  trailingGroupId,
}: {
  node: Extract<
    IdeSplitNode,
    {
      kind: 'split';
    }
  >;
  leadingGroupId: string;
  trailingGroupId: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const onResizeStart = (event: ReactMouseEvent) => {
    event.preventDefault();
    const box = ref.current?.getBoundingClientRect();
    if (!box) {
      return;
    }
    setDragging(true);
    const onMove = (move: MouseEvent) => {
      const ratio = (move.clientX - box.left) / box.width;
      useIdeStore.getState().setSplitRatio(node.splitId, ratio);
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  return (
    <div
      ref={ref}
      className="flex min-h-0 min-w-0 flex-1"
      data-testid={`ide-split-${node.splitId}`}
    >
      <div
        className="flex min-h-0 min-w-0 flex-col"
        style={{ width: `${node.ratio * 100}%`, flex: 'none' }}
      >
        <SplitNodeView
          node={node.first}
          leadingGroupId={leadingGroupId}
          trailingGroupId={trailingGroupId}
        />
      </div>
      <Resizer
        label="Resize split"
        testId="ide-split-resize"
        dragging={dragging}
        onResizeStart={onResizeStart}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <SplitNodeView
          node={node.second}
          leadingGroupId={leadingGroupId}
          trailingGroupId={trailingGroupId}
        />
      </div>
    </div>
  );
}
function IdeGroupPane({
  groupId,
  leading,
  trailing,
}: {
  groupId: string;
  leading: boolean;
  trailing: boolean;
}) {
  const group = useIdeGroup(groupId);
  const ws = useIdeTabs();
  const [dragOver, setDragOver] = useState(false);
  if (!group) {
    return null;
  }
  const activeTab = ws.tabs.find((t) => t.id === group.activeId) ?? null;
  return (
    <section
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col',
        dragOver && 'ring-1 ring-ring ring-inset',
      )}
      data-testid={`ide-group-${groupId}`}
      aria-label={`IDE group ${groupId}`}
      onDragOver={(e) => {
        const drag = ideDrag();
        if (!drag) {
          return;
        }
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        const drag = takeIdeDrag();
        if (!drag) {
          return;
        }
        useIdeStore.getState().moveTab(drag.tabId, groupId, null);
      }}
    >
      <IdeGroupTabs groupId={groupId} leading={leading} trailing={trailing} />
      <div className="flex min-h-0 flex-1 flex-col">
        <GroupContent activeTab={activeTab} />
      </div>
    </section>
  );
}
