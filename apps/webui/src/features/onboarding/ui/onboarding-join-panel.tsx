import { useState } from 'react';
import { pairWithRelay } from '@/shared/api/fleet';
import type { MachineOrgEntry } from '@/shared/api/orgs';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  CHOOSE_BACK,
  JOIN_PANEL_BODY,
  JOIN_PANEL_TITLE,
  JOIN_SUBMIT,
} from '../model/onboarding-copy';
import { OnboardingShell } from './onboarding-shell';

export function OnboardingJoinPanel({
  onBack,
  onJoined,
}: {
  onBack: () => void;
  onJoined: (entry: MachineOrgEntry) => void;
}) {
  const [relayUrl, setRelayUrl] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [orgId, setOrgId] = useState('');
  const [nodeName, setNodeName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!relayUrl.trim() || !inviteCode.trim() || !orgId.trim()) {
      setError('Relay URL, invite code and org ID are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await pairWithRelay({
        relayUrl: relayUrl.trim(),
        inviteCode: inviteCode.trim(),
        nodeName: nodeName.trim() || 'worker',
        orgId: orgId.trim(),
      });
      onJoined({
        orgId: result.orgId,
        name: result.orgName,
        role: 'worker',
        relayUrl: relayUrl.trim().replace(/\/+$/, ''),
        localDbPath: null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell testId="onboarding-join">
      <div className="mx-auto w-full max-w-lg">
        <button
          type="button"
          onClick={onBack}
          className="mb-8 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          data-testid="onboarding-back"
        >
          ← {CHOOSE_BACK}
        </button>
        <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
          {JOIN_PANEL_TITLE}
        </h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{JOIN_PANEL_BODY}</p>
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <Field
            id="join-relay-url"
            label="Relay URL"
            hint="Address of the machine that already hosts the organization."
            value={relayUrl}
            onChange={setRelayUrl}
            placeholder="http://192.168.1.10:47474"
            testId="join-relay-url"
          />
          <Field
            id="join-org-id"
            label="Organization ID"
            hint="UUID from the owner (Fleet → invite)."
            value={orgId}
            onChange={setOrgId}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            testId="join-org-id"
          />
          <Field
            id="join-invite-code"
            label="Invite code"
            hint="Short code from the invite. Case does not matter."
            value={inviteCode}
            onChange={(next) => setInviteCode(next.toUpperCase())}
            placeholder="ABCD2345"
            testId="join-invite-code"
          />
          <Field
            id="join-node-name"
            label="Name for this machine"
            hint="Shown in Fleet. Defaults to worker."
            value={nodeName}
            onChange={setNodeName}
            placeholder="laptop"
            testId="join-node-name"
          />
          {error ? <p className="text-destructive text-sm">{error}</p> : null}
          <Button type="submit" className="w-full" disabled={busy} data-testid="join-org-submit">
            {busy ? 'Joining…' : JOIN_SUBMIT}
          </Button>
        </form>
      </div>
    </OnboardingShell>
  );
}

function Field({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  testId,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-testid={testId}
      />
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
