import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type GoogleAppConfigStatusResponse, saveGoogleAppConfig } from '@/shared/api/integrations';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { toast } from '@/shared/ui/toast';

interface GoogleAppCredentialsDialogProps {
  orgId: string;
  status: GoogleAppConfigStatusResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const SETUP_STEPS = [
  {
    title: 'Create a Google Cloud project',
    href: 'https://console.cloud.google.com/projectcreate',
  },
  {
    title: 'Enable Calendar, Gmail, and Drive APIs in APIs & Services → Library',
    href: 'https://console.cloud.google.com/apis/library',
  },
  {
    title: 'Publish the OAuth consent screen to Production — Testing expires every 7 days',
    href: 'https://console.cloud.google.com/apis/consent',
  },
  {
    title: 'Create an OAuth client ID and register the redirect URI below',
    href: 'https://console.cloud.google.com/apis/credentials',
  },
];

export function GoogleAppCredentialsDialog({
  orgId,
  status,
  open,
  onOpenChange,
  onSaved,
}: GoogleAppCredentialsDialogProps) {
  const [clientId, setClientId] = useState(status.clientId);
  const [clientSecret, setClientSecret] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [appId, setAppId] = useState('');

  const saveMutation = useMutation({
    mutationFn: () => saveGoogleAppConfig(orgId, { clientId, clientSecret, apiKey, appId }),
    onSuccess: () => {
      toast.add({ title: 'Google Cloud App saved' });
      onSaved();
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      toast.add({
        title: 'Failed to save',
        description: err instanceof Error ? err.message : 'Save failed',
      });
    },
  });

  const copyRedirect = async () => {
    try {
      await navigator.clipboard.writeText(status.redirectUri);
      toast.add({ title: 'Redirect URI copied' });
    } catch {
      toast.add({ title: 'Copy failed', description: 'Copy the URI manually' });
    }
  };

  const canSave = clientId.trim().length > 0 && clientSecret.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid="connectors-google-app-form">
        <DialogHeader>
          <DialogTitle>Google Cloud App credentials</DialogTitle>
          <DialogDescription>
            One-time setup in Google Cloud, about 5 minutes. Credentials are stored encrypted in
            this organization only — Harnesys never sees them.
          </DialogDescription>
        </DialogHeader>
        <FieldGroup>
          <div className="flex flex-col gap-1.5 rounded-lg bg-background p-3 ring-1 ring-foreground/5">
            <p className="font-medium text-xs">Setup in Google Cloud</p>
            <ol className="list-decimal space-y-1 ps-4 text-muted-foreground text-xs leading-4">
              {SETUP_STEPS.map((step) => (
                <li key={step.title}>
                  <a
                    className="text-primary underline hover:no-underline"
                    href={step.href}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {step.title}
                  </a>
                </li>
              ))}
            </ol>
          </div>
          <Field>
            <FieldLabel htmlFor="google-app-redirect">Redirect URI</FieldLabel>
            <FieldDescription>Register this exact URI on the OAuth client.</FieldDescription>
            <div className="flex gap-2" data-testid="connectors-google-app-redirect">
              <Input
                id="google-app-redirect"
                readOnly
                value={status.redirectUri}
                className="min-w-0 flex-1 font-mono text-xs"
              />
              <Button type="button" variant="outline" size="sm" onClick={() => void copyRedirect()}>
                Copy
              </Button>
            </div>
          </Field>
          <Field>
            <FieldLabel htmlFor="google-app-client-id">Client ID</FieldLabel>
            <Input
              id="google-app-client-id"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              placeholder="…apps.googleusercontent.com"
              className="font-mono text-xs"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="google-app-client-secret">Client secret</FieldLabel>
            {status.hasClientSecret ? (
              <FieldDescription>Saved — enter a new one to replace it.</FieldDescription>
            ) : null}
            <Input
              id="google-app-client-secret"
              type="password"
              value={clientSecret}
              onChange={(e) => setClientSecret(e.target.value)}
              placeholder="GOCSPX-…"
              className="font-mono text-xs"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="google-app-api-key">API key</FieldLabel>
            <FieldDescription>Optional — enables the Drive folder picker.</FieldDescription>
            <Input
              id="google-app-api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="AIza…"
              className="font-mono text-xs"
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="google-app-app-id">App ID</FieldLabel>
            <FieldDescription>Optional — project number for the picker.</FieldDescription>
            <Input
              id="google-app-app-id"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="1234567890"
              className="font-mono text-xs"
            />
          </Field>
        </FieldGroup>
        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            disabled={saveMutation.isPending}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={saveMutation.isPending || !canSave}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
