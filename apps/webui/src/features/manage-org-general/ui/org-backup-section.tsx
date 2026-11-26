import { useMutation } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useOrgStore } from '@/features/switch-org/org-context';
import {
  downloadOrgBackup,
  downloadOrgDatabase,
  listOrgs,
  restoreOrgBackup,
} from '@/shared/api/orgs';
import { formatBytes } from '@/shared/lib/file-meta';
import { alert } from '@/shared/services/overlay';
import { Button } from '@/shared/ui/button';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';

export function OrgBackupSection({ orgId, orgName }: { orgId: string; orgName: string }) {
  const { upsertOrg, setOrgs } = useOrgStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dbReceivedBytes, setDbReceivedBytes] = useState<number | null>(null);

  const downloadMutation = useMutation({
    mutationFn: () => downloadOrgBackup(orgId),
    onSuccess: () => {
      toast.add({ title: 'Backup downloaded' });
    },
    onError: (error: unknown) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not create backup',
      });
    },
  });

  const downloadDatabase = () => {
    setDbReceivedBytes(0);
    void downloadOrgDatabase(orgId, (bytes) => setDbReceivedBytes(bytes))
      .then(() => {
        toast.add({ title: 'Database downloaded' });
      })
      .catch((error: unknown) => {
        toast.add({
          title: error instanceof Error ? error.message : 'Could not download database',
        });
      })
      .finally(() => setDbReceivedBytes(null));
  };

  const restoreMutation = useMutation({
    mutationFn: (file: File) => restoreOrgBackup(file),
    onSuccess: (entry) => {
      upsertOrg(entry);
      void listOrgs().then((response) => setOrgs(response.orgs));
      toast.add({
        title: 'Organization restored',
        description: `${entry.name} is now available on this machine.`,
      });
    },
    onError: (error: unknown) => {
      toast.add({
        title: error instanceof Error ? error.message : 'Could not restore backup',
      });
    },
  });

  const restoring = restoreMutation.isPending;
  const downloading = downloadMutation.isPending;

  const onFilePicked = (file: File | undefined) => {
    const input = fileInputRef.current;
    if (input) {
      input.value = '';
    }
    if (!file) {
      return;
    }
    void alert
      .confirm({
        title: `Restore “${orgName}”?`,
        description:
          'The archive is restored as a new organization on this machine with its original id and name. The id must be free; if the organization already exists here, delete or rename it first.',
        confirmText: 'Restore',
        testId: 'org-backup-restore-dialog',
      })
      .then((confirmed) => {
        if (confirmed) {
          restoreMutation.mutate(file);
        }
      });
  };

  return (
    <SettingsSection
      label="Backup & restore"
      description="Download a full archive of this organization's database and files, or just the SQLite database file. Restoring creates a new local copy; secrets stay encrypted with this machine's master key, so restoring on another machine requires the same master.key."
      testId="org-general-backup"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={downloading}
          data-testid="org-general-backup-download"
          onClick={() => downloadMutation.mutate()}
        >
          {downloading ? 'Preparing...' : 'Download backup'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={dbReceivedBytes !== null}
          aria-busy={dbReceivedBytes !== null}
          data-testid="org-general-database-download"
          onClick={downloadDatabase}
        >
          {dbReceivedBytes === null
            ? 'Download database'
            : `Downloading… ${formatBytes(dbReceivedBytes)}`}
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={restoring}
          data-testid="org-general-backup-restore"
          onClick={() => fileInputRef.current?.click()}
        >
          {restoring ? 'Restoring...' : 'Restore from archive'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".tar.gz,.tgz,application/gzip"
          className="hidden"
          aria-label="Organization backup archive"
          data-testid="org-general-backup-file"
          onChange={(event) => onFilePicked(event.target.files?.[0])}
        />
      </div>
    </SettingsSection>
  );
}
