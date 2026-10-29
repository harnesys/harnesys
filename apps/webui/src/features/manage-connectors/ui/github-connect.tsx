import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { openSystemBrowser } from '@/features/manage-connectors/lib/system-browser';
import {
  githubAppStatusQuery,
  githubInstallStatus,
  integrationsQueryKey,
  startGithubInstall,
  startGithubManifest,
} from '@/shared/api/integrations';
import { env } from '@/shared/config/env';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { StatusDot } from '@/shared/ui/status-dot';
import { toast } from '@/shared/ui/toast';
import { ConnectorCard, ConnectorCardRow } from './connector-card';

interface GithubConnectSectionProps {
  orgId: string;
  onCancel?: () => void;
}

type InstallMessageStatus = 'ready' | 'denied' | 'expired' | 'check';

export function GithubConnectSection({ orgId, onCancel }: GithubConnectSectionProps) {
  const queryClient = useQueryClient();
  const appStatus = useQuery(githubAppStatusQuery(orgId));
  const [appName, setAppName] = useState('Harnesys');
  const [waiting, setWaiting] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [forceManifest, setForceManifest] = useState(false);
  const [note, setNote] = useState('');
  const popupRef = useRef<Window | null>(null);
  const completedRef = useRef(false);
  const closeCheckRef = useRef(false);
  const lastCheckAtRef = useRef(0);
  const useManifest = forceManifest || appStatus.data?.configured !== true;

  const finish = useCallback(async () => {
    completedRef.current = true;
    await queryClient.invalidateQueries({ queryKey: integrationsQueryKey(orgId) });
    toast.add({ title: 'GitHub connected' });
  }, [queryClient, orgId]);

  const startMutation = useMutation({
    mutationFn: async (): Promise<{ url: string; sessionId: string }> => {
      if (!useManifest) {
        const res = await startGithubInstall(orgId);
        return { url: res.installUrl, sessionId: res.sessionId };
      }
      const res = await startGithubManifest(orgId, appName.trim() || 'Harnesys');
      return { url: res.popupUrl, sessionId: res.sessionId };
    },
    onSuccess: (res) => {
      completedRef.current = false;
      closeCheckRef.current = false;
      lastCheckAtRef.current = 0;
      setNote('');
      setSessionId(res.sessionId);
      setWaiting(true);
      if (env.isTauri) {
        void openSystemBrowser(res.url).catch(() => {
          toast.add({
            title: 'Failed to open browser',
            description: 'Open the GitHub page manually, then press Check status',
          });
        });
        return;
      }
      const popup = window.open(res.url, 'harnesys-github-install', 'popup,width=760,height=760');
      popupRef.current = popup;
      if (!popup) {
        setNote('The GitHub window was blocked — allow popups, then press Check status.');
      }
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : 'GitHub connect failed';
      if (!useManifest) {
        setForceManifest(true);
        setNote(`${message}. The saved GitHub App is gone — create it again.`);
        return;
      }
      toast.add({ title: 'GitHub connect failed', description: message });
    },
  });

  const checkMutation = useMutation({
    mutationFn: () => {
      lastCheckAtRef.current = Date.now();
      return githubInstallStatus(orgId, sessionId);
    },
    onSuccess: (res) => {
      if (res.status === 'ready') {
        void finish();
        return;
      }
      if (res.status === 'denied') {
        setNote('Installation was cancelled on GitHub — press Try again.');
        return;
      }
      if (res.status === 'expired') {
        setNote('The setup session expired — press Try again.');
        return;
      }
      setNote('Waiting for the installation to finish on GitHub.');
    },
    onError: () => {
      setNote('Status check failed — try again in a moment.');
    },
  });

  const runQuietCheck = useCallback(() => {
    if (completedRef.current || checkMutation.isPending || !sessionId) {
      return;
    }
    if (Date.now() - lastCheckAtRef.current < 2000) {
      return;
    }
    lastCheckAtRef.current = Date.now();
    checkMutation.mutate();
  }, [checkMutation, sessionId]);

  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    const onMessage = (event: MessageEvent) => {
      const payload = event.data as { type?: string; status?: string } | null;
      if (payload?.type !== 'harnesys:github-install') {
        return;
      }
      const status = payload.status as InstallMessageStatus;
      if (status === 'ready') {
        void finish();
        return;
      }
      if (status === 'check') {
        runQuietCheck();
        return;
      }
      if (status === 'denied') {
        setNote('Installation was cancelled on GitHub — press Try again.');
        return;
      }
      setNote('The setup session expired — press Try again.');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [waiting, finish, runQuietCheck]);

  useEffect(() => {
    if (!waiting) {
      return undefined;
    }
    const onFocus = () => {
      runQuietCheck();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [waiting, runQuietCheck]);

  useEffect(() => {
    if (!waiting || env.isTauri) {
      return undefined;
    }
    const timer = setInterval(() => {
      if (popupRef.current?.closed && !closeCheckRef.current) {
        closeCheckRef.current = true;
        runQuietCheck();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [waiting, runQuietCheck]);

  const description = useManifest
    ? 'Creates the Harnesys GitHub App (keys are delivered to this server automatically), then asks where to install it.'
    : 'Opens GitHub to install the Harnesys GitHub App. This page completes itself when GitHub confirms.';

  return (
    <SettingsSection
      label="Connect GitHub"
      description={description}
      actions={
        onCancel ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={onCancel}
          >
            Cancel
          </Button>
        ) : undefined
      }
      testId="connectors-connect-section"
    >
      {waiting ? (
        <ConnectorCard className="flex flex-col gap-3 p-4" testId="connectors-github-waiting">
          <div className="flex items-center gap-3">
            <StatusDot tone="wait" label="Waiting for GitHub" />
            <p className="min-w-0 flex-1 text-[13px] text-muted-foreground">
              Finish the steps in the GitHub window. Closed it too early? Press Check status or Try
              again.
            </p>
          </div>
          {note ? <p className="text-destructive text-xs leading-4">{note}</p> : null}
          <div className="flex items-center justify-end gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              disabled={startMutation.isPending}
              onClick={() => startMutation.mutate()}
            >
              Try again
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={checkMutation.isPending || !sessionId}
              onClick={() => checkMutation.mutate()}
            >
              {checkMutation.isPending ? 'Checking…' : 'Check status'}
            </Button>
          </div>
        </ConnectorCard>
      ) : (
        <ConnectorCard className="flex flex-col gap-3 p-4">
          {useManifest ? (
            <>
              <Field>
                <FieldLabel htmlFor="connect-github-app-name">App name</FieldLabel>
                <FieldDescription>
                  Shown on GitHub. Must be unique across all of GitHub — if taken, pick another.
                </FieldDescription>
                <Input
                  id="connect-github-app-name"
                  value={appName}
                  onChange={(event) => {
                    setAppName(event.target.value);
                  }}
                  placeholder="Harnesys"
                  data-testid="connect-github-app-name"
                />
              </Field>
              <p className="text-muted-foreground text-xs leading-4">
                Self-hosted without a public domain? See{' '}
                <span className="font-mono">docs/connectors/github-app-setup.md</span>.
              </p>
            </>
          ) : null}
          <ConnectorCardRow
            label="Installation"
            description="The install page opens on GitHub; this page completes itself when GitHub confirms."
            actions={
              <Button
                type="button"
                size="sm"
                disabled={startMutation.isPending}
                onClick={() => startMutation.mutate()}
              >
                {startMutation.isPending ? 'Opening GitHub…' : 'Continue on GitHub'}
              </Button>
            }
          />
        </ConnectorCard>
      )}
    </SettingsSection>
  );
}
