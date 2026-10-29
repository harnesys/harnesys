import type {
  KnowledgeFileStatus,
  KnowledgeIndexState,
  UpsertKnowledgeRootRequest,
  UpsertKnowledgeSettingsRequest,
} from '@harnesys/studio-shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ApiError,
  cancelKnowledgeIndex,
  deleteKnowledgeRoot,
  knowledgeFilesQuery,
  knowledgeIndexStateQuery,
  knowledgeIndexStateQueryKey,
  knowledgeRootsQuery,
  knowledgeRootsQueryKey,
  knowledgeSettingsQuery,
  knowledgeSettingsQueryKey,
  knowledgeStatsQuery,
  knowledgeStatsQueryKey,
  putKnowledgeSettings,
  reindexKnowledge,
  upsertKnowledgeRoot,
} from '@/shared/api';
import { toast } from '@/shared/ui/toast';
import { patchKnowledgeIndexState } from './patch-knowledge-index-state';

export function useKnowledgeIndex(
  orgId: string | undefined,
  sourceId: string | undefined,
  fileStatus?: KnowledgeFileStatus,
) {
  const queryClient = useQueryClient();
  const enabled = Boolean(orgId && sourceId);
  const oid = orgId ?? '';
  const sid = sourceId ?? '';
  const settingsQuery = useQuery({
    ...knowledgeSettingsQuery(oid, sid),
    enabled,
  });
  const rootsQuery = useQuery({
    ...knowledgeRootsQuery(oid, sid),
    enabled,
  });
  const statsQuery = useQuery({
    ...knowledgeStatsQuery(oid, sid),
    enabled,
  });
  const indexStateQuery = useQuery({
    ...knowledgeIndexStateQuery(oid, sid),
    enabled,
  });
  const filesQuery = useQuery({
    ...knowledgeFilesQuery(oid, sid, { status: fileStatus }),
    enabled,
  });

  async function invalidateAll() {
    if (!(orgId && sourceId)) {
      return;
    }
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: knowledgeSettingsQueryKey(orgId, sourceId) }),
      queryClient.invalidateQueries({ queryKey: knowledgeRootsQueryKey(orgId, sourceId) }),
      queryClient.invalidateQueries({ queryKey: knowledgeStatsQueryKey(orgId, sourceId) }),
      queryClient.invalidateQueries({ queryKey: knowledgeIndexStateQueryKey(orgId, sourceId) }),
      queryClient.invalidateQueries({
        queryKey: ['orgs', orgId, 'sources', sourceId, 'knowledge', 'files'],
      }),
    ]);
  }

  function setIndexState(state: KnowledgeIndexState) {
    if (!(orgId && sourceId)) {
      return;
    }
    patchKnowledgeIndexState(queryClient, orgId, sourceId, state);
  }

  const saveSettings = useMutation({
    mutationFn: (body: UpsertKnowledgeSettingsRequest) => {
      if (!(orgId && sourceId)) {
        throw new Error('No source');
      }
      return putKnowledgeSettings(orgId, sourceId, body);
    },
    onSuccess: (settings) => {
      if (!(orgId && sourceId)) {
        return;
      }
      queryClient.setQueryData(knowledgeSettingsQueryKey(orgId, sourceId), settings);
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to save settings',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });

  const upsertRoot = useMutation({
    mutationFn: (body: UpsertKnowledgeRootRequest) => {
      if (!(orgId && sourceId)) {
        throw new Error('No source');
      }
      return upsertKnowledgeRoot(orgId, sourceId, body);
    },
    onSuccess: async (root) => {
      await invalidateAll();
      toast.add({ title: 'Knowledge root saved', description: root.path });
    },
    onError: (error) => {
      toast.add({
        title: 'Failed to save root',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });

  const removeRoot = useMutation({
    mutationFn: (path: string) => {
      if (!(orgId && sourceId)) {
        throw new Error('No source');
      }
      return deleteKnowledgeRoot(orgId, sourceId, path);
    },
    onSuccess: async (_result, path) => {
      await invalidateAll();
      toast.add({ title: 'Knowledge root removed', description: path });
    },
  });

  const reindex = useMutation({
    mutationFn: () => {
      if (!(orgId && sourceId)) {
        throw new Error('No source');
      }
      return reindexKnowledge(orgId, sourceId);
    },
    onSuccess: async (state) => {
      setIndexState(state);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: knowledgeStatsQueryKey(oid, sid) }),
        queryClient.invalidateQueries({
          queryKey: ['orgs', oid, 'sources', sid, 'knowledge', 'files'],
        }),
      ]);
      toast.add({ title: 'Reindex started' });
    },
    onError: (error) => {
      toast.add({
        title: 'Reindex failed',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });

  const cancel = useMutation({
    mutationFn: () => {
      if (!(orgId && sourceId)) {
        throw new Error('No source');
      }
      return cancelKnowledgeIndex(orgId, sourceId);
    },
    onSuccess: async (state) => {
      setIndexState(state);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: knowledgeStatsQueryKey(oid, sid) }),
        queryClient.invalidateQueries({
          queryKey: ['orgs', oid, 'sources', sid, 'knowledge', 'files'],
        }),
      ]);
      toast.add({ title: 'Indexing cancelled' });
    },
    onError: (error) => {
      toast.add({
        title: 'Cancel failed',
        description: error instanceof ApiError ? error.message : 'Request failed',
      });
    },
  });

  return {
    settingsQuery,
    rootsQuery,
    statsQuery,
    indexStateQuery,
    filesQuery,
    saveSettings,
    upsertRoot,
    removeRoot,
    reindex,
    cancel,
    invalidateAll,
  };
}
