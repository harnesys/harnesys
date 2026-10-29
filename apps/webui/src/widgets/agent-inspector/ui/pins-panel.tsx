import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useSelectedThread } from '@/features/desk';
import {
  confirmDeletePin,
  openAddPinDialog,
  openEditPinDialog,
  type PinDraft,
} from '@/features/manage-agent-memory';
import { agentPinsQuery, agentPinsQueryKey, deleteAgentPin, upsertAgentPin } from '@/shared/api';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { MemoryRow } from './memory-row';
import { Section, SectionEmpty } from './section';

export function PinsPanel({ agent }: { agent: Agent }) {
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const thread = useSelectedThread();
  const queryClient = useQueryClient();
  const streaming = useSessionStore(
    (state) => thread !== null && Boolean(state.activeRuns[thread.id]),
  );
  const wasStreaming = useRef(streaming);
  const query = useQuery({
    ...agentPinsQuery(projectId ?? '', agent.id),
    enabled: Boolean(projectId),
  });
  const pins = query.data ?? [];
  let hint: string | undefined;
  if (streaming) {
    hint = 'live';
  } else if (pins.length > 0) {
    hint = String(pins.length);
  }
  useEffect(() => {
    if (wasStreaming.current && !streaming && projectId) {
      void queryClient.invalidateQueries({
        queryKey: agentPinsQueryKey(projectId, agent.id),
      });
    }
    wasStreaming.current = streaming;
  }, [streaming, projectId, agent.id, queryClient]);
  async function invalidate() {
    if (!projectId) {
      return;
    }
    await queryClient.invalidateQueries({ queryKey: agentPinsQueryKey(projectId, agent.id) });
  }
  const upsert = useMutation({
    mutationFn: (draft: PinDraft) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return upsertAgentPin(projectId, agent.id, draft.key, { text: draft.text });
    },
    onSuccess: async (pin) => {
      await invalidate();
      toast.add({ title: 'Pin saved', description: pin.key });
    },
  });
  const remove = useMutation({
    mutationFn: (key: string) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return deleteAgentPin(projectId, agent.id, key);
    },
    onSuccess: async (_result, key) => {
      await invalidate();
      toast.add({ title: 'Pin deleted', description: key });
    },
  });
  const busy = upsert.isPending || remove.isPending;
  let content: ReactNode;
  if (query.isPending) {
    content = (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  } else if (pins.length === 0) {
    content = <SectionEmpty>No pins yet.</SectionEmpty>;
  } else {
    content = (
      <div className="flex flex-col gap-0.5">
        {pins.map((pin) => (
          <MemoryRow
            key={pin.key}
            title={pin.key}
            text={pin.text}
            source={pin.source}
            updatedAt={pin.updatedAt}
            busy={busy}
            testId={`pin-${pin.key}`}
            onEdit={() => {
              void openEditPinDialog(pin).then((draft) => {
                if (draft) {
                  upsert.mutate(draft);
                }
              });
            }}
            onDelete={() => {
              void confirmDeletePin(pin.key).then((confirmed) => {
                if (confirmed) {
                  remove.mutate(pin.key);
                }
              });
            }}
          />
        ))}
      </div>
    );
  }
  return (
    <Section
      label="Pins"
      hint={hint}
      action={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add pin"
          className="text-muted-foreground"
          disabled={!projectId || busy}
          onClick={() => {
            void openAddPinDialog().then((draft) => {
              if (draft) {
                upsert.mutate(draft);
              }
            });
          }}
        >
          <PlusIcon />
        </Button>
      }
    >
      {content}
    </Section>
  );
}
