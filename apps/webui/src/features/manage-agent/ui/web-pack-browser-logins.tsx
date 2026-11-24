import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { websiteLoginsQuery } from '@/features/manage-org-browser/website-logins-api';
import { getActiveOrgId } from '@/shared/api/active-org';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';

const HARDENED_NOTE =
  'Credentialed browser (hardened): the browser tool is restricted to an allowlist, all traffic goes through a per-session egress proxy, and browser_login requires approval. The raw CLI surface and browser_fetch are disabled. This only activates when the agent has no shell access (process permission denied) on macOS or Linux; otherwise the login tool is not offered.';

export function WebsiteLoginAllowlist({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const orgId = getActiveOrgId() ?? '';
  const query = useQuery(websiteLoginsQuery(orgId));
  const credentials = query.data?.items ?? [];

  useEffect(() => {
    if (!query.isSuccess) {
      return;
    }
    const valid = value.filter((id) => credentials.some((credential) => credential.id === id));
    if (valid.length !== value.length) {
      onChange(valid);
    }
  }, [query.isSuccess, credentials, value, onChange]);

  function toggle(credentialId: string, checked: boolean) {
    const next = checked ? [...value, credentialId] : value.filter((id) => id !== credentialId);
    onChange(next);
  }

  return (
    <Field>
      <FieldLabel>Allowed website logins</FieldLabel>
      {(query.isError || credentials.length === 0) && (
        <p
          className="text-[11px] text-muted-foreground leading-snug"
          data-testid="pack-web-no-logins"
        >
          No website logins configured yet
        </p>
      )}
      {credentials.length > 0 && (
        <div className="flex flex-col gap-2" data-testid="pack-web-login-allowlist">
          {credentials.map((credential) => (
            <div key={credential.id} className="flex items-start gap-2 rounded-md px-1 py-0.5">
              <Checkbox
                className="mt-0.5"
                id={`pack-web-login-${credential.id}`}
                checked={value.includes(credential.id)}
                onCheckedChange={(next) => toggle(credential.id, next === true)}
              />
              <span className="truncate text-[11px] leading-snug">{credential.name}</span>
            </div>
          ))}
        </div>
      )}
      {value.length > 0 && (
        <FieldDescription className="text-[11px] leading-snug">{HARDENED_NOTE}</FieldDescription>
      )}
    </Field>
  );
}
