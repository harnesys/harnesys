import type { App, RegisterAccountBody } from '@harnesys/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { appsQueryKey, registerAccount } from '@/shared/api/apps';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsErrorBanner, SettingsField } from '@/shared/ui/settings-kit';
import { Textarea } from '@/shared/ui/textarea';

const DEFAULT_ACCOUNT_KIND: Record<string, string> = {
  'google-cloud-project': 'google-account',
  'github-app': 'github-installation',
  'telegram-mtproto': 'telegram-user',
};

const NO_APP = 'none';

export function AccountForm({
  orgId,
  apps,
  onDone,
}: {
  orgId: string;
  apps: App[];
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [appId, setAppId] = useState(NO_APP);
  const [kind, setKind] = useState('');
  const [externalAccountId, setExternalAccountId] = useState('');
  const [label, setLabel] = useState('');
  const [scopes, setScopes] = useState('');
  const [credentials, setCredentials] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  const register = useMutation({
    mutationFn: (body: RegisterAccountBody) => registerAccount(orgId, body),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: appsQueryKey(orgId) });
      onDone();
    },
  });

  const submit = () => {
    const parsed = parseCredentials(credentials);
    if (parsed === null) {
      setJsonError('Credentials must be a JSON object with string values');
      return;
    }
    setJsonError(null);
    register.mutate({
      appId: appId === NO_APP ? null : appId,
      kind: kind.trim(),
      externalAccountId: externalAccountId.trim(),
      label: label.trim() || externalAccountId.trim(),
      scopes: scopes
        .split(',')
        .map((scope) => scope.trim())
        .filter(Boolean),
      credentials: parsed,
    });
  };

  return (
    <form
      className="flex flex-col gap-1 rounded-md border border-border/40 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      data-testid="account-form"
    >
      {jsonError ? (
        <SettingsErrorBanner message={jsonError} testId="account-form-json-error" />
      ) : null}
      {register.error ? (
        <SettingsErrorBanner message={register.error.message} testId="account-form-error" />
      ) : null}
      <SettingsField
        label="Application"
        description="Leave empty when the credentials are the identity, like a bot token."
        htmlFor="account-app"
      >
        <Select
          value={appId}
          onValueChange={(next) => {
            if (!next) {
              return;
            }
            setAppId(next);
            const app = apps.find((entry) => entry.id === next);
            const suggested = app ? DEFAULT_ACCOUNT_KIND[app.kind] : undefined;
            if (typeof suggested === 'string' && suggested && !kind) {
              setKind(suggested);
            }
          }}
        >
          <SelectTrigger id="account-app" data-testid="account-app-select">
            <SelectValue placeholder="No application" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_APP}>No application</SelectItem>
            {apps.map((app) => (
              <SelectItem key={app.id} value={app.id}>
                {app.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </SettingsField>
      <SettingsField label="Kind" description="e.g. google-account" htmlFor="account-kind">
        <Input
          id="account-kind"
          value={kind}
          autoComplete="off"
          placeholder="google-account"
          onChange={(event) => setKind(event.target.value)}
          data-testid="account-kind"
        />
      </SettingsField>
      <SettingsField
        label="External account"
        description="Provider-side id: email, sub, installation id, or phone."
        htmlFor="account-external"
      >
        <Input
          id="account-external"
          value={externalAccountId}
          autoComplete="off"
          placeholder="me@example.com"
          onChange={(event) => setExternalAccountId(event.target.value)}
          data-testid="account-external"
        />
      </SettingsField>
      <SettingsField
        label="Name"
        description="Optional label for this connection."
        htmlFor="account-label"
      >
        <Input
          id="account-label"
          value={label}
          autoComplete="off"
          placeholder="me@example.com"
          onChange={(event) => setLabel(event.target.value)}
          data-testid="account-label"
        />
      </SettingsField>
      <SettingsField
        label="Scopes"
        description="Comma separated. The same external account with a different scope set is a separate connection."
        htmlFor="account-scopes"
      >
        <Input
          id="account-scopes"
          value={scopes}
          autoComplete="off"
          placeholder="drive, gmail"
          onChange={(event) => setScopes(event.target.value)}
          data-testid="account-scopes"
        />
      </SettingsField>
      <SettingsField
        label="Credentials"
        description="JSON object with token values, for example refreshToken."
        htmlFor="account-credentials"
      >
        <Textarea
          id="account-credentials"
          rows={4}
          className="font-mono text-xs"
          placeholder={'{ "refreshToken": "..." }'}
          value={credentials}
          onChange={(event) => setCredentials(event.target.value)}
          data-testid="account-credentials"
        />
      </SettingsField>
      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={!kind.trim() || !externalAccountId.trim() || register.isPending}
          data-testid="account-form-submit"
        >
          {register.isPending ? 'Connecting...' : 'Connect account'}
        </Button>
      </div>
    </form>
  );
}

function parseCredentials(raw: string): Record<string, string> | null {
  if (!raw.trim()) {
    return {};
  }
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const output: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value !== 'string') {
        return null;
      }
      output[key] = value;
    }
    return output;
  } catch {
    return null;
  }
}
