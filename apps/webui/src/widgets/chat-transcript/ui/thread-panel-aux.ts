import { useEffect } from 'react';
import { type FeedRun, isCompactRun, useSessionStore } from '@/entities/session';
import type { Thread } from '@/entities/thread';
import { onRevealMessageRequest } from '@/features/send-message';
import type { BranchChild } from './branch-point-badge';

export function registerRevealRequest(
  threadId: string,
  setRevealState: (state: { threadId: string; key: string | null }) => void,
): () => void {
  return onRevealMessageRequest((targetThreadId, messageId) => {
    if (targetThreadId === threadId) {
      setRevealState({ threadId, key: messageId });
    }
  });
}

export function useThreadFeedBoundary(
  threadId: string,
  active: boolean,
  inheritedCount: number,
): void {
  useEffect(() => {
    if (!active) {
      return;
    }
    useSessionStore.getState().setThreadFeedBoundary(threadId, inheritedCount);
  }, [active, threadId, inheritedCount]);
}

export function groupBranchChildren(
  allThreads: readonly Thread[],
  threadId: string,
): Record<string, BranchChild[]> {
  const children = allThreads.filter((item) => item.parentThreadId === threadId);
  const grouped: Record<string, BranchChild[]> = {};
  for (const child of children) {
    if (!child.forkAt) {
      continue;
    }
    const group = grouped[child.forkAt];
    if (group) {
      group.push({ id: child.id, agentId: child.agentId, title: child.title });
    } else {
      grouped[child.forkAt] = [{ id: child.id, agentId: child.agentId, title: child.title }];
    }
  }
  return grouped;
}

export function undoableRunKeyOf(
  streaming: boolean,
  compacting: boolean,
  runs: FeedRun[],
): string | null {
  return streaming || compacting ? null : lastCompactRunKey(runs);
}

function lastCompactRunKey(runs: FeedRun[]): string | null {
  for (let index = runs.length - 1; index >= 0; index--) {
    const run = runs[index];
    if (run && isCompactRun(run)) {
      return run.key;
    }
  }
  return null;
}
