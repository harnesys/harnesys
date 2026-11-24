import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { RowHeader, RowList } from '@/shared/ui/capability-rows';
import { RowListSkeleton, SettingsEmpty, SettingsErrorBanner } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import type { BrowserCredential } from './website-logins-api';
import {
  deleteWebsiteCredential,
  resetWebsiteCredentialStatus,
  websiteLoginsQuery,
  websiteLoginsQueryKey,
} from './website-logins-api';
import { WebsiteLoginsDialog } from './website-logins-dialog';
import { WebsiteLoginsRow } from './website-logins-row';

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}

export function WebsiteLoginsPane({ orgId }: { orgId: string }) {
  const queryClient = useQueryClient();
  const query = useQuery(websiteLoginsQuery(orgId));
  const credentials = query.data?.items ?? [];
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BrowserCredential | null>(null);

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: websiteLoginsQueryKey(orgId) });
  }

  const remove = useMutation({
    mutationFn: (credentialId: string) => deleteWebsiteCredential(orgId, credentialId),
    onSuccess: () => {
      refresh();
      toast.add({ title: 'Website login deleted' });
    },
    onError: (error) => {
      toast.add({ title: 'Failed to delete website login', description: errorMessage(error) });
    },
  });

  const reset = useMutation({
    mutationFn: (credentialId: string) => resetWebsiteCredentialStatus(orgId, credentialId),
    onSuccess: () => {
      refresh();
      toast.add({ title: 'Login status reset' });
    },
    onError: (error) => {
      toast.add({ title: 'Failed to reset login status', description: errorMessage(error) });
    },
  });

  function openAdd() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(credential: BrowserCredential) {
    setEditing(credential);
    setDialogOpen(true);
  }

  function confirmDelete(credential: BrowserCredential) {
    void alert
      .confirm({
        title: `Delete ${credential.name}?`,
        description:
          'The stored password is deleted with it and agents can no longer sign in to this site.',
        confirmText: 'Delete',
        variant: 'destructive',
      })
      .then((ok) => {
        if (ok) {
          remove.mutate(credential.id);
        }
      });
  }

  return (
    <div className="flex w-full flex-col gap-2" data-testid="website-logins-pane">
      <RowHeader
        label="Website logins"
        count={query.isPending ? undefined : credentials.length}
        description="Credentialed site sign-ins for the browser pack. Agents use them to log in instead of handling passwords in the open."
      >
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={!orgId}
          onClick={openAdd}
          data-testid="website-credential-add"
        >
          <PlusIcon />
          Add website login
        </Button>
      </RowHeader>

      {query.isPending && <RowListSkeleton testId="website-logins-loading" />}
      {query.isError && (
        <SettingsErrorBanner
          testId="website-logins-error"
          message={errorMessage(query.error)}
          onRetry={() => void query.refetch()}
        />
      )}
      {!query.isPending && !query.isError && credentials.length === 0 ? (
        <SettingsEmpty
          testId="website-logins-empty"
          title="No website logins"
          description="Add a credentialed login to let agents sign in to a site."
        />
      ) : null}

      <RowList>
        {credentials.map((credential) => (
          <WebsiteLoginsRow
            key={credential.id}
            credential={credential}
            expanded={expandedId === credential.id}
            onToggle={() =>
              setExpandedId((current) => (current === credential.id ? null : credential.id))
            }
            onEdit={() => openEdit(credential)}
            onReset={() => reset.mutate(credential.id)}
            onDelete={() => confirmDelete(credential)}
          />
        ))}
      </RowList>

      <p className="text-muted-foreground text-xs">Login activity is recorded in Audit.</p>

      <WebsiteLoginsDialog
        orgId={orgId}
        credential={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}
