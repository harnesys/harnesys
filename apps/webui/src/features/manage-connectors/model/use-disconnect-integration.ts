import { useMutation, useQueryClient } from '@tanstack/react-query';
import { orgSourcesQueryKey } from '@/features/manage-connectors/model/drive-sources';
import { disconnectIntegration, integrationsQueryKey } from '@/shared/api/integrations';
import { projectQueryKey } from '@/shared/api/projects';
import { alert } from '@/shared/services/overlay';
import { toast } from '@/shared/ui/toast';

export function useDisconnectIntegration(orgId: string, providerLabel: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (integrationId: string) => disconnectIntegration(orgId, integrationId),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: integrationsQueryKey(orgId) });
      await queryClient.invalidateQueries({ queryKey: orgSourcesQueryKey(orgId) });
      await queryClient.invalidateQueries({ queryKey: projectQueryKey });
      toast.add({
        title: `${providerLabel} account disconnected`,
        description:
          res.detachedSources > 0 ? `${res.detachedSources} linked sources removed.` : undefined,
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Disconnect failed';
      toast.add({ title: 'Disconnect failed', description: msg });
    },
  });
}

export function confirmDisconnect(
  linkedSources: number,
  accountLabel: string,
  onConfirm: () => void,
): void {
  void alert
    .confirm({
      title: `Disconnect ${accountLabel}?`,
      description:
        linkedSources > 0
          ? `${linkedSources} linked ${linkedSources === 1 ? 'source' : 'sources'} will be removed.`
          : 'No sources are linked to this account.',
      confirmText: 'Disconnect',
      variant: 'destructive',
      testId: 'connectors-disconnect-confirm',
    })
    .then((ok) => {
      if (ok) {
        onConfirm();
      }
    });
}
