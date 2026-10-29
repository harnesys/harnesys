import type { SemanticScope } from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { Agent } from '@/entities/agent';
import { useSessionStore } from '@/entities/session';
import { useSelectedThread } from '@/features/desk';
import {
  confirmDeleteSemantic,
  openAddSemanticDialog,
  openEditSemanticDialog,
  type SemanticDraft,
} from '@/features/manage-agent-memory';
import { agentSemanticQuery, deleteAgentSemantic, upsertAgentSemantic } from '@/shared/api';
import { studioFocusProjectId, useStudioLocation } from '@/shared/config/location';
import { Button } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';
import { toast } from '@/shared/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { MemoryRow } from './memory-row';
import { Section, SectionEmpty } from './section';

const SCOPES: ReadonlyArray<{
  value: SemanticScope | 'all';
  label: string;
}> = [
  { value: 'all', label: 'All' },
  { value: 'long', label: 'Long' },
  { value: 'session', label: 'Session' },
];

export function SemanticPanel({ agent }: { agent: Agent }) {
  const projectId = studioFocusProjectId(useStudioLocation().focus);
  const thread = useSelectedThread();
  const queryClient = useQueryClient();
  const [scope, setScope] = useState<SemanticScope | 'all'>('all');
  const streaming = useSessionStore(
    (state) => thread !== null && Boolean(state.activeRuns[thread.id]),
  );
  const wasStreaming = useRef(streaming);
  const filterScope = scope === 'all' ? undefined : scope;
  const query = useQuery({
    ...agentSemanticQuery(projectId ?? '', agent.id, { scope: filterScope }),
    enabled: Boolean(projectId),
  });
  const rows = query.data ?? [];
  let hint: string | undefined;
  if (streaming) {
    hint = 'live';
  } else if (rows.length > 0) {
    hint = String(rows.length);
  }
  useEffect(() => {
    if (wasStreaming.current && !streaming && projectId) {
      void queryClient.invalidateQueries({
        queryKey: ['projects', projectId, 'agents', agent.id, 'semantic'],
      });
    }
    wasStreaming.current = streaming;
  }, [streaming, projectId, agent.id, queryClient]);
  async function invalidate() {
    if (!projectId) {
      return;
    }
    await queryClient.invalidateQueries({
      queryKey: ['projects', projectId, 'agents', agent.id, 'semantic'],
    });
  }
  const save = useMutation({
    mutationFn: async (draft: SemanticDraft) => {
      if (!projectId) {
        throw new Error('No project');
      }
      const threadId = draft.threadId ?? thread?.id;
      if (draft.scope === 'session' && !threadId) {
        throw new Error('Select a thread for session memory');
      }
      if (draft.id) {
        await deleteAgentSemantic(projectId, agent.id, draft.id);
      }
      return upsertAgentSemantic(projectId, agent.id, {
        scope: draft.scope,
        text: draft.text,
        ...(draft.key ? { key: draft.key } : {}),
        ...(draft.scope === 'session' && threadId ? { threadId } : {}),
      });
    },
    onSuccess: async (row) => {
      await invalidate();
      toast.add({ title: 'Memory saved', description: row.key ?? row.scope });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => {
      if (!projectId) {
        throw new Error('No project');
      }
      return deleteAgentSemantic(projectId, agent.id, id);
    },
    onSuccess: async () => {
      await invalidate();
      toast.add({ title: 'Memory deleted' });
    },
  });
  const busy = save.isPending || remove.isPending;
  let content: ReactNode;
  if (query.isPending) {
    content = (
      <div className="flex flex-col gap-1">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-9 w-full" />
      </div>
    );
  } else if (rows.length === 0) {
    content = <SectionEmpty>No memory recorded for this scope.</SectionEmpty>;
  } else {
    content = (
      <div className="flex flex-col gap-0.5">
        {rows.map((row) => {
          const title = row.key ?? row.id.slice(0, 8);
          return (
            <MemoryRow
              key={row.id}
              title={title}
              text={row.text}
              source={row.source}
              updatedAt={row.updatedAt}
              badge={row.scope}
              busy={busy}
              testId={`semantic-${row.id}`}
              onEdit={() => {
                void openEditSemanticDialog(row).then((draft) => {
                  if (draft) {
                    save.mutate(draft);
                  }
                });
              }}
              onDelete={() => {
                void confirmDeleteSemantic(title).then((confirmed) => {
                  if (confirmed) {
                    remove.mutate(row.id);
                  }
                });
              }}
            />
          );
        })}
      </div>
    );
  }
  return (
    <Section
      label="Semantic memory"
      hint={hint}
      action={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Add memory"
          className="text-muted-foreground"
          disabled={!projectId || busy}
          onClick={() => {
            const initial = scope === 'all' ? 'long' : scope;
            void openAddSemanticDialog(initial).then((draft) => {
              if (draft) {
                save.mutate(draft);
              }
            });
          }}
        >
          <PlusIcon />
        </Button>
      }
    >
      <ToggleGroup
        variant="segment"
        size="sm"
        value={[scope]}
        onValueChange={(value) => {
          const next = value[0];
          if (next === 'all' || next === 'session' || next === 'long') {
            setScope(next);
          }
        }}
      >
        {SCOPES.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value} className="font-normal text-[11px]">
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {content}
    </Section>
  );
}
