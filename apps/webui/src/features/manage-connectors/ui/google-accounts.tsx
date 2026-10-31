import type { GoogleOAuthService, Integration } from '@harnesys/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FolderPlusIcon, UnplugIcon } from 'lucide-react';
import { useState } from 'react';
import { pickGoogleDriveFolder } from '@/features/manage-connectors/lib/google-folder-picker';
import {
  integrationDriveSources,
  orgSourcesQueryKey,
} from '@/features/manage-connectors/model/drive-sources';
import {
  integrationStatusLabel,
  integrationStatusTone,
} from '@/features/manage-connectors/model/integration-status';
import {
  confirmDisconnect,
  useDisconnectIntegration,
} from '@/features/manage-connectors/model/use-disconnect-integration';
import { googlePickerSession } from '@/shared/api/integrations';
import { projectQueryKey } from '@/shared/api/projects';
import { attachCloudDrive, type Source } from '@/shared/api/sources';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { toast } from '@/shared/ui/toast';
import { accountServices, hasDriveService } from '../model/google-services';
import { CONNECTOR_INSET_CLASSES, ConnectorCard } from './connector-card';
import { DriveSourcesList } from './drive-sources-list';
import { GoogleConnectCard } from './google-connect-card';
import { GoogleServiceChips } from './google-service-picker';
import { GoogleSigninCard } from './google-signin-card';

type GoogleConnectPhase = 'off' | 'pick' | 'signin';

interface GoogleAccountsSectionProps {
  orgId: string;
  accounts: Integration[];
  sources: Source[] | undefined;
  sourcesLoading: boolean;
}

export function GoogleAccountsSection({
  orgId,
  accounts,
  sources,
  sourcesLoading,
}: GoogleAccountsSectionProps) {
  const disconnect = useDisconnectIntegration(orgId, 'Google');
  const [folderFor, setFolderFor] = useState<string | null>(null);
  const [phase, setPhase] = useState<GoogleConnectPhase>('off');
  const [services, setServices] = useState<GoogleOAuthService[]>([]);

  return (
    <SettingsSection
      label="Accounts"
      count={accounts.length}
      actions={
        phase !== 'off' ? undefined : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={() => setPhase('pick')}
            data-testid="connectors-connect-another"
          >
            {accounts.length > 0 ? 'Connect another account' : 'Connect Google account'}
          </Button>
        )
      }
      testId="connectors-accounts"
    >
      <div className="flex flex-col gap-3">
        {phase === 'pick' ? (
          <GoogleConnectCard
            onContinue={(picked) => {
              setServices(picked);
              setPhase('signin');
            }}
            onCancel={() => setPhase('off')}
          />
        ) : null}
        {phase === 'signin' ? (
          <GoogleSigninCard orgId={orgId} services={services} onFinished={() => setPhase('off')} />
        ) : null}
        {accounts.map((account) => {
          const linked = integrationDriveSources(sources ?? [], account.id);
          const services = accountServices(account);
          const driveEnabled = hasDriveService(account);
          return (
            <ConnectorCard key={account.id} className="flex flex-col gap-3 p-4">
              <div className="flex items-start gap-3">
                <StatusDot
                  tone={integrationStatusTone(account.status)}
                  label={account.status}
                  className="mt-1.5"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate font-medium text-sm"
                    data-testid={`connectors-account-${account.id}`}
                  >
                    {account.accountLabel}
                  </p>
                  <div className="pt-0.5">
                    {services.length > 0 ? (
                      <GoogleServiceChips services={services} />
                    ) : (
                      <span className="text-[11px] text-muted-foreground">
                        No services granted — reconnect to pick them
                      </span>
                    )}
                  </div>
                </div>
                {driveEnabled ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={account.status !== 'connected'}
                    onClick={() => {
                      setFolderFor(folderFor === account.id ? null : account.id);
                    }}
                    data-testid={`connectors-add-folder-${account.id}`}
                  >
                    <FolderPlusIcon data-icon="inline-start" />
                    Add folder
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground"
                  disabled={disconnect.isPending}
                  onClick={() => {
                    confirmDisconnect(linked.length, account.accountLabel, () =>
                      disconnect.mutate(account.id),
                    );
                  }}
                  data-testid={`connectors-disconnect-${account.id}`}
                >
                  <UnplugIcon data-icon="inline-start" />
                  Disconnect
                </Button>
              </div>
              {folderFor === account.id ? (
                <AddFolderRows
                  orgId={orgId}
                  integrationId={account.id}
                  onClose={() => {
                    setFolderFor(null);
                  }}
                />
              ) : null}
              {driveEnabled ? (
                <DriveSourcesList orgId={orgId} sources={linked} loading={sourcesLoading} />
              ) : null}
              <div className="flex justify-end border-foreground/5 border-t pt-2">
                <p className="text-muted-foreground text-xs">
                  {integrationStatusLabel(account.status)}
                  {linked.length > 0
                    ? ` · ${linked.length} ${linked.length === 1 ? 'folder' : 'folders'}`
                    : ''}
                </p>
              </div>
            </ConnectorCard>
          );
        })}
      </div>
    </SettingsSection>
  );
}

interface AddFolderRowsProps {
  orgId: string;
  integrationId: string;
  onClose: () => void;
}

function AddFolderRows({ orgId, integrationId, onClose }: AddFolderRowsProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('Google Drive');
  const [folderId, setFolderId] = useState('');
  const [folderLabel, setFolderLabel] = useState('');
  const [picking, setPicking] = useState(false);

  const attachMutation = useMutation({
    mutationFn: () => {
      if (!folderId.trim()) {
        return Promise.reject(new Error('Choose a Drive folder first'));
      }
      return attachCloudDrive(orgId, {
        integrationId,
        name: name.trim() || folderLabel || 'Google Drive',
        remoteFolderId: folderId.trim(),
        backend: 'google',
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: orgSourcesQueryKey(orgId) });
      await queryClient.invalidateQueries({ queryKey: projectQueryKey });
      toast.add({ title: 'Drive folder attached as a source' });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Attach failed';
      toast.add({ title: 'Attach failed', description: msg });
    },
  });

  const chooseFolder = async () => {
    setPicking(true);
    try {
      const session = await googlePickerSession(orgId, integrationId);
      const picked = await pickGoogleDriveFolder(session);
      if (!picked) {
        return;
      }
      setFolderId(picked.id);
      setFolderLabel(picked.name);
      if (!name.trim() || name === 'Google Drive') {
        setName(picked.name);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Picker failed';
      toast.add({ title: 'Folder picker failed', description: msg });
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className={`${CONNECTOR_INSET_CLASSES} flex flex-col p-3`}>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor={`drive-folder-name-${integrationId}`}>Name</FieldLabel>
          <Input
            id={`drive-folder-name-${integrationId}`}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`drive-folder-picker-${integrationId}`}>Drive folder</FieldLabel>
          <FieldDescription>
            Opens the Google folder picker. Docs, Sheets, and Slides are skipped; changes appear
            after a manual refresh.
          </FieldDescription>
          <div className="flex gap-2">
            <Input
              id={`drive-folder-picker-${integrationId}`}
              readOnly
              value={folderLabel ? `${folderLabel} (${folderId})` : 'No folder selected'}
              className="min-w-0 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={picking}
              onClick={() => {
                void chooseFolder();
              }}
            >
              {picking ? 'Opening…' : 'Choose folder'}
            </Button>
          </div>
        </Field>
      </FieldGroup>
      <div className="flex items-center justify-end gap-1 pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={attachMutation.isPending || !folderId}
          onClick={() => attachMutation.mutate()}
        >
          {attachMutation.isPending ? 'Attaching…' : 'Attach folder'}
        </Button>
      </div>
    </div>
  );
}
