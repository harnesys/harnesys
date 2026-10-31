import type { GoogleOAuthService } from '@harnesys/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { type GoogleAppConfigStatusResponse, saveGoogleAppConfig } from '@/shared/api/integrations';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
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
import {
  GOOGLE_API_LIBRARY_URL,
  GOOGLE_CLOUD_PROJECT_URL,
  GOOGLE_CONSENT_SCREEN_URL,
  GOOGLE_OAUTH_CREDENTIALS_URL,
  googleApiLibraryUrl,
  googleServiceInfo,
} from '../model/google-services';
import { GoogleServicePicker } from './google-service-picker';

interface GoogleAppCredentialsDialogProps {
  orgId: string;
  status: GoogleAppConfigStatusResponse;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const STEP_TITLES = ['Choose services', 'Enable the APIs', 'OAuth consent screen', 'OAuth client'];

export function GoogleAppCredentialsDialog({
  orgId,
  status,
  open,
  onOpenChange,
  onSaved,
}: GoogleAppCredentialsDialogProps) {
  const [step, setStep] = useState(0);
  const [services, setServices] = useState<GoogleOAuthService[]>([
    'drive',
    'gmail',
    'calendar',
    'sheets',
    'docs',
    'search_console',
  ]);
  const [enabledApis, setEnabledApis] = useState<string[]>([]);
  const [consentDone, setConsentDone] = useState(false);
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

  const apis = uniqueApis(services);
  const apisDone = apis.every((api) => enabledApis.includes(api.slug));

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
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-lg"
        data-testid="connectors-google-app-form"
      >
        <DialogHeader>
          <DialogTitle>Connect Google Cloud App</DialogTitle>
          <DialogDescription>
            One-time setup in Google Cloud, about 5 minutes — the wizard walks you through every
            step. Credentials are stored encrypted in this organization only.
          </DialogDescription>
          <p className="text-muted-foreground text-xs">
            Step {step + 1} of {STEP_TITLES.length} — {STEP_TITLES[step]}
          </p>
        </DialogHeader>
        <FieldGroup>
          {step === 0 ? (
            <div className="flex flex-col gap-2">
              <FieldDescription>
                Pick what this org will use with Google. Each connected account chooses its own set
                later — this list shapes the setup steps and default selection.
              </FieldDescription>
              <GoogleServicePicker selected={services} onChange={setServices} />
            </div>
          ) : null}
          {step === 1 ? (
            <div className="flex flex-col gap-2">
              <FieldDescription>
                Enable each API for your project in the Google Cloud Library, then tick it here.
              </FieldDescription>
              {apis.map((api) => (
                <div
                  key={api.slug}
                  className="flex items-center gap-3 rounded-lg p-2.5 ring-1 ring-foreground/5 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={enabledApis.includes(api.slug)}
                    onCheckedChange={() =>
                      setEnabledApis((prev) =>
                        prev.includes(api.slug)
                          ? prev.filter((slug) => slug !== api.slug)
                          : [...prev, api.slug],
                      )
                    }
                  />
                  <span className="min-w-0 flex-1 font-medium text-sm">{api.name}</span>
                  <a
                    className="text-primary text-xs underline hover:no-underline"
                    href={googleApiLibraryUrl(api)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Enable
                  </a>
                </div>
              ))}
              {!apisDone ? (
                <p className="text-muted-foreground text-xs">
                  Tick every API after enabling — Continue unlocks when all are done.
                </p>
              ) : null}
            </div>
          ) : null}
          {step === 2 ? (
            <div className="flex flex-col gap-2.5">
              <FieldDescription>
                Configure the OAuth consent screen for your project, then publish it.
              </FieldDescription>
              <ol className="list-decimal space-y-1.5 ps-4 text-muted-foreground text-xs leading-4">
                <li>
                  Open{' '}
                  <a
                    className="text-primary underline hover:no-underline"
                    href={GOOGLE_CONSENT_SCREEN_URL}
                    target="_blank"
                    rel="noreferrer"
                  >
                    OAuth consent screen
                  </a>{' '}
                  (Audience).
                </li>
                <li>
                  In <span className="font-medium">Data access / Scopes</span> add scopes for:{' '}
                  {services.map((key) => googleServiceInfo(key).label).join(', ')}.
                </li>
                <li>
                  Press <span className="font-medium">Publish app</span> and choose{' '}
                  <span className="font-medium">In Production</span>. In Testing mode Google drops
                  access every 7 days.
                </li>
                <li>
                  Unverified apps show a Google warning during sign-in — users press Advanced →
                  Continue. Fine for personal and team use (up to 100 accounts).
                </li>
              </ol>
              <div className="flex items-center gap-3 rounded-lg p-2.5 ring-1 ring-foreground/5 hover:bg-muted/50">
                <Checkbox
                  checked={consentDone}
                  onCheckedChange={(checked) => setConsentDone(checked === true)}
                />
                <span className="font-medium text-sm">Consent screen is published</span>
              </div>
            </div>
          ) : null}
          {step === 3 ? (
            <>
              <div className="flex flex-col gap-1.5 rounded-lg bg-background p-3 ring-1 ring-foreground/5">
                <p className="font-medium text-xs">Create the client</p>
                <ol className="list-decimal space-y-1 ps-4 text-muted-foreground text-xs leading-4">
                  <li>
                    Open{' '}
                    <a
                      className="text-primary underline hover:no-underline"
                      href={GOOGLE_OAUTH_CREDENTIALS_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Credentials → Create credentials → OAuth client ID
                    </a>
                    .
                  </li>
                  <li>
                    Application type:{' '}
                    <span className="font-medium text-foreground">Desktop app</span>. Loopback
                    redirects are allowed automatically — the URI below is what Harnesys uses.
                  </li>
                  <li>Copy the Client ID and Client secret into the fields.</li>
                  <li>
                    No project yet?{' '}
                    <a
                      className="text-primary underline hover:no-underline"
                      href={GOOGLE_CLOUD_PROJECT_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Create one
                    </a>{' '}
                    and repeat steps 2–3 from this wizard.
                  </li>
                </ol>
              </div>
              <Field>
                <FieldLabel htmlFor="google-app-redirect">Redirect URI (for reference)</FieldLabel>
                <div className="flex gap-2" data-testid="connectors-google-app-redirect">
                  <Input
                    id="google-app-redirect"
                    readOnly
                    value={status.redirectUri}
                    className="min-w-0 flex-1 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void copyRedirect()}
                  >
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
                  placeholder={status.hasClientSecret ? 'GOCSPX-…' : 'GOCSPX-…'}
                  className="font-mono text-xs"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="google-app-api-key">API key (optional)</FieldLabel>
                <FieldDescription>Enables the Drive folder picker.</FieldDescription>
                <Input
                  id="google-app-api-key"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIza…"
                  className="font-mono text-xs"
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="google-app-app-id">App ID (optional)</FieldLabel>
                <FieldDescription>Project number for the picker.</FieldDescription>
                <Input
                  id="google-app-app-id"
                  value={appId}
                  onChange={(e) => setAppId(e.target.value)}
                  placeholder="1234567890"
                  className="font-mono text-xs"
                />
              </Field>
              <p className="text-muted-foreground text-xs">
                Library:{' '}
                <a
                  className="text-primary underline hover:no-underline"
                  href={GOOGLE_API_LIBRARY_URL}
                  target="_blank"
                  rel="noreferrer"
                >
                  APIs & Services → Library
                </a>
              </p>
            </>
          ) : null}
        </FieldGroup>
        <DialogFooter>
          {step > 0 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : null}
          {step < STEP_TITLES.length - 1 ? (
            <Button
              type="button"
              size="sm"
              disabled={stepBlocked(step, services.length, apisDone, consentDone)}
              onClick={() => setStep(step + 1)}
              data-testid="connectors-google-app-next"
            >
              Continue
            </Button>
          ) : (
            <Button
              type="button"
              size="sm"
              disabled={!canSave || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface GoogleApiRef {
  name: string;
  slug: string;
}

function stepBlocked(
  step: number,
  serviceCount: number,
  apisDone: boolean,
  consentDone: boolean,
): boolean {
  if (step === 0) {
    return serviceCount === 0;
  }
  if (step === 1) {
    return !apisDone;
  }
  if (step === 2) {
    return !consentDone;
  }
  return false;
}

function uniqueApis(services: GoogleOAuthService[]): GoogleApiRef[] {
  const bySlug = new Map<string, GoogleApiRef>();
  for (const key of services) {
    for (const api of googleServiceInfo(key).apis) {
      bySlug.set(api.slug, api);
    }
  }
  return [...bySlug.values()];
}
