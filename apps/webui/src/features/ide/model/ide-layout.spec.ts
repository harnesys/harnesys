import { describe, expect, test } from 'bun:test';
import type { IdeTab } from './ide.store';
import {
  createWorkspaceWithTab,
  type IdeSplitNode,
  type IdeWorkspaceState,
  splitGroupState,
} from './ide-layout';

const tab: IdeTab = { id: 'thread:p1:t1', kind: 'thread', projectId: 'p1', threadId: 't1' };

function split(ws: IdeWorkspaceState, side: 'left' | 'right' | 'up' | 'down') {
  const anchor = ws.groups[0];
  if (!anchor) {
    throw new Error('missing group');
  }
  const next = splitGroupState(ws, anchor.id, side, 'new-group');
  if (!next) {
    throw new Error('split failed');
  }
  const layout = next.layout;
  if (layout?.kind !== 'split') {
    throw new Error('expected split layout');
  }
  return { ws: next, layout, anchorId: anchor.id };
}

function groupId(node: IdeSplitNode): string {
  if (node.kind !== 'group') {
    throw new Error('expected group node');
  }
  return node.groupId;
}

describe('split group orientation', () => {
  test('right split is a row with the new group second', () => {
    const { layout, anchorId } = split(createWorkspaceWithTab(tab), 'right');
    expect(layout.orientation).toBe('row');
    expect(groupId(layout.first)).toBe(anchorId);
    expect(groupId(layout.second)).toBe('new-group');
  });

  test('left split is a row with the new group first', () => {
    const { layout, anchorId } = split(createWorkspaceWithTab(tab), 'left');
    expect(layout.orientation).toBe('row');
    expect(groupId(layout.first)).toBe('new-group');
    expect(groupId(layout.second)).toBe(anchorId);
  });

  test('down split is a column with the new group second', () => {
    const { layout, ws } = split(createWorkspaceWithTab(tab), 'down');
    expect(layout.orientation).toBe('column');
    expect(groupId(layout.second)).toBe('new-group');
    expect(ws.activeGroupId).toBe('new-group');
  });

  test('up split is a column with the new group first', () => {
    const { layout, anchorId } = split(createWorkspaceWithTab(tab), 'up');
    expect(layout.orientation).toBe('column');
    expect(groupId(layout.first)).toBe('new-group');
    expect(groupId(layout.second)).toBe(anchorId);
  });
});
