import type { ApprovalStatus } from '@harnesys/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import {
  decideInbox,
  type InboxApprovalRecord,
  type InboxDecideInput,
  inboxQuery,
  inboxQueryKey,
  inboxQueryKeyFor,
} from '@/entities/approval';
import { watchApprovalEvents } from '@/shared/api/events';
import { cancelRun } from '@/shared/api/threads';
import { useOrgId } from '@/shared/config/location';
import { playInboxSound } from '@/shared/lib/notification-sound';
import { showSystemNotification } from '@/shared/lib/system-notification';
import { toast } from '@/shared/ui/toast';

export function useInbox(status?: ApprovalStatus) {
  const orgId = useOrgId() ?? '';
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!orgId) {
      return;
    }
    return watchApprovalEvents((eventOrgId, frame) => {
      if (eventOrgId === orgId) {
        if (frame.type === 'requested') {
          playInboxSound();
          showSystemNotification('Approval needed', frame.approval.question);
        }
        void queryClient.invalidateQueries({ queryKey: [...inboxQueryKey, orgId] });
      }
    });
  }, [orgId, queryClient]);
  return useQuery(inboxQuery(orgId, status));
}

export interface InboxDecideVariables {
  approval: InboxApprovalRecord;
  body: InboxDecideInput;
}

export function useInboxDecide() {
  const orgId = useOrgId() ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ approval, body }: InboxDecideVariables) => decideInbox(orgId, approval.id, body),
    onMutate: async ({ approval }) => {
      const keys = [inboxQueryKeyFor(orgId), inboxQueryKeyFor(orgId, 'pending')];
      await Promise.all(keys.map((key) => queryClient.cancelQueries({ queryKey: key })));
      const snapshots = keys.map(
        (key) => [key, queryClient.getQueryData<{ items: InboxApprovalRecord[] }>(key)] as const,
      );
      for (const key of keys) {
        queryClient.setQueryData<{ items: InboxApprovalRecord[] }>(key, (current) =>
          current ? { items: current.items.filter((item) => item.id !== approval.id) } : current,
        );
      }
      return { keys, snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, snapshot] of context?.snapshots ?? []) {
        queryClient.setQueryData(key, snapshot);
      }
    },
    onSuccess: (response) => {
      if (!response.winner) {
        toast.add({
          title: 'Already decided',
          description: 'This approval was decided from another surface.',
        });
        return;
      }
      if (response.resumeState === 'decided') {
        toast.add({
          title: 'Decision saved, applying…',
          description: 'The run will pick the decision up shortly.',
        });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [...inboxQueryKey, orgId] });
    },
  });
}

export interface StopRunVariables {
  threadId: string;
  runId: string;
}

export function useStopRun() {
  const orgId = useOrgId() ?? '';
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ threadId, runId }: StopRunVariables) => cancelRun(threadId, runId),
    onSuccess: () => {
      toast.add({ title: 'Run stopped', description: 'The parked run was cancelled.' });
    },
    onError: (error) => {
      toast.add({
        title: 'Stop failed',
        description: error instanceof Error ? error.message : 'could not stop the run',
        type: 'error',
      });
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: [...inboxQueryKey, orgId] });
    },
  });
}
