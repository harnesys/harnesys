import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { openSystemBrowser } from '@/features/manage-connectors/lib/system-browser';
import {
  googleOAuthStatus,
  integrationsQueryKey,
  startGoogleOAuthLoopback,
} from '@/shared/api/integrations';
import { env } from '@/shared/config/env';
import { Button } from '@/shared/ui/button';
import { StatusDot } from '@/shared/ui/status-dot';
import { toast } from '@/shared/ui/toast';
import { ConnectorCard } from './connector-card';

interface GoogleSigninCardProps {
  orgId: string;
  onFinished: () => void;
}

export function GoogleSigninCard({ orgId, onFinished }: GoogleSigninCardProps) {
  const queryClient = useQueryClient();
  const [sessionId, setSessionId] = useState('');
  const [note, setNote] = useState('');

  const startMutation = useMutation({
    mutationFn: () => startGoogleOAuthLoopback(orgId),
    onSuccess: (res) => {
      setSessionId(res.sessionId);
      if (env.isTauri) {
        void openSystemBrowser(res.authUrl).catch(() => {
          toast.add({
            title: 'Failed to open browser',
            description: 'Open the Google page manually, then press Check now',
          });
        });
        return;
      }
      const popup = window.open(res.authUrl, 'harnesys-google-oauth', 'popup,width=520,height=680');
      if (!popup) {
        setNote('The Google window was blocked — allow popups, then press Check now.');
      }
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'OAuth start failed';
      toast.add({ title: 'Google OAuth failed', description: msg });
      onFinished();
    },
  });

  const checkMutation = useMutation({
    mutationFn: () => googleOAuthStatus(orgId, sessionId),
    onSuccess: async (res) => {
      if (res.status === 'ready') {
        await queryClient.invalidateQueries({ queryKey: integrationsQueryKey(orgId) });
        toast.add({ title: 'Google account connected' });
        onFinished();
        return;
      }
      if (res.status === 'denied') {
        setNote('Authorization was denied on the Google page.');
        return;
      }
      if (res.status === 'expired') {
        setNote('The sign-in code expired — close this card and connect again.');
        return;
      }
      setNote('Still waiting — finish the sign-in in the Google window.');
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Status check failed';
      toast.add({ title: 'Check failed', description: msg });
    },
  });

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    startMutation.mutate();
  }, [startMutation]);

  useEffect(() => {
    if (env.isTauri) {
      return undefined;
    }
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; status?: string } | null;
      if (data?.type !== 'harnesys:google-oauth') {
        return;
      }
      if (data.status === 'ready') {
        checkMutation.mutate();
        return;
      }
      setNote('Authorization was denied on the Google page.');
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [checkMutation]);

  return (
    <ConnectorCard className="flex flex-col gap-2 p-4" testId="connectors-google-signin">
      <div className="flex items-center gap-2">
        <StatusDot tone="wait" label="Waiting for Google" />
        <p className="min-w-0 flex-1 font-medium text-sm">
          {startMutation.isPending ? 'Opening Google…' : 'Waiting for Google sign-in'}
        </p>
      </div>
      <p className="text-muted-foreground text-xs leading-4">
        Complete the sign-in in the Google window — it grants Drive, Calendar, and Gmail access and
        adds the account below.
      </p>
      {note ? <p className="text-destructive text-xs leading-4">{note}</p> : null}
      <div className="flex items-center justify-end gap-1">
        <Button type="button" variant="ghost" size="sm" onClick={onFinished}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!sessionId || checkMutation.isPending}
          onClick={() => checkMutation.mutate()}
        >
          {checkMutation.isPending ? 'Checking…' : 'Check now'}
        </Button>
      </div>
    </ConnectorCard>
  );
}
