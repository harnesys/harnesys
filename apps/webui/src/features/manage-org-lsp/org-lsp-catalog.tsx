import type { LspCatalogEntry } from '@harnesys/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { orgLspQueryKey, upsertOrgLspServer } from '@/shared/api/org-lsp';
import { Button } from '@/shared/ui/button';
import { Row, RowField, RowHeader, RowList, RowSection } from '@/shared/ui/capability-rows';
import { SettingsEmpty } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

function commandLine(entry: LspCatalogEntry): string {
  return [entry.command, ...(entry.args ?? [])].filter(Boolean).join(' ');
}

function extensionList(entry: LspCatalogEntry): string {
  const extensions = Object.keys(entry.extensionToLanguage);
  return extensions.length > 0 ? extensions.join(', ') : 'no extensions';
}

export function OrgLspCatalog({ orgId, catalog }: { orgId: string; catalog: LspCatalogEntry[] }) {
  const queryClient = useQueryClient();
  const add = useMutation({
    mutationFn: (entry: LspCatalogEntry) =>
      upsertOrgLspServer(orgId, entry.serverId, {
        command: entry.command,
        args: entry.args,
        extensionToLanguage: entry.extensionToLanguage,
      }),
    onSuccess: (result, entry) => {
      queryClient.setQueryData(orgLspQueryKey(orgId), result);
      toast.add({
        title: `Server ${entry.serverId} added`,
        description: entry.binaryOk
          ? 'Command is on PATH — it starts on first use.'
          : `Install the binary first: ${entry.install}`,
      });
    },
    onError: (error) => {
      toast.add({ title: 'Add failed', description: errorMessage(error) });
    },
  });
  return (
    <section className="flex w-full flex-col gap-1" data-testid="org-lsp-catalog">
      <RowHeader
        label="Available servers"
        count={catalog.length}
        description="Adds the server entry to .harnesys/lsp.json in one click."
      />
      {catalog.length === 0 ? (
        <SettingsEmpty
          title="Every catalog server is added"
          description="New catalog entries ship with app updates."
        />
      ) : (
        <RowList testId="org-lsp-catalog-list">
          {catalog.map((entry) => (
            <Row
              key={entry.serverId}
              testId={`lsp-catalog-${entry.serverId}`}
              title={entry.label}
              mono={false}
              summary={entry.description}
              status={
                entry.binaryOk
                  ? { tone: 'off', label: 'Ready' }
                  : { tone: 'wait', label: 'Not installed' }
              }
              alwaysShowActions
              actions={
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={add.isPending}
                  onClick={() => add.mutate(entry)}
                >
                  <PlusIcon />
                  Add
                </Button>
              }
            >
              <RowSection label="Details">
                <RowField label="Server" value={entry.serverId} />
                <RowField label="Extensions" value={extensionList(entry)} />
                <RowField label="Command" value={commandLine(entry)} />
                <RowField label="Install" value={entry.install} />
              </RowSection>
            </Row>
          ))}
        </RowList>
      )}
    </section>
  );
}
