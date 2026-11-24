import type { SubmitBrowserLoginAttemptInput } from '@harnesys/contracts';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import {
  getActiveBrowserLoginAttempt,
  submitBrowserLoginAttemptInput,
} from '@/features/manage-org-browser/website-logins-api';
import { rejectAsk, respondToAsk } from '@/features/send-message/model/hitl-actions';
import type { PendingHitl } from '@/features/send-message/model/pending-hitl';
import { getActiveOrgId } from '@/shared/api/active-org';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { HitlShell } from './hitl-shell';

type AttemptMode = 'code' | 'manual' | 'import';

function credentialIdOf(input: unknown): string {
  if (input === null || typeof input !== 'object') {
    return '';
  }
  const value = (input as { credentialId?: unknown }).credentialId;
  return typeof value === 'string' ? value : '';
}

function remainingLabel(expiresAt: string | undefined, now: number): string {
  if (expiresAt === undefined) {
    return '';
  }
  const left = Math.max(0, Date.parse(expiresAt) - now);
  const seconds = Math.ceil(left / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')} left`;
}

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function inputOf(
  mode: AttemptMode,
  fields: { code: string; username: string; password: string; cookies: string },
): SubmitBrowserLoginAttemptInput | null {
  if (mode === 'code') {
    return fields.code.trim() === '' ? null : { code: fields.code.trim() };
  }
  if (mode === 'manual') {
    return fields.username.trim() === '' || fields.password === ''
      ? null
      : { username: fields.username.trim(), password: fields.password };
  }
  return fields.cookies.trim() === '' ? null : { cookies: fields.cookies.trim() };
}

export function BrowserLoginCard({
  pending,
  threadId,
}: {
  pending: PendingHitl;
  threadId: string;
}) {
  const orgId = getActiveOrgId() ?? '';
  const credentialId = credentialIdOf(pending.tool?.input);
  const query = useQuery({
    queryKey: ['browser-login-attempt', orgId, credentialId, threadId],
    queryFn: () => getActiveBrowserLoginAttempt(orgId, credentialId, threadId),
    enabled: Boolean(orgId && credentialId && threadId),
    retry: false,
  });
  const attempt = query.data?.attempt ?? null;
  const [mode, setMode] = useState<AttemptMode>('code');
  const [code, setCode] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [cookies, setCookies] = useState('');
  const [busy, setBusy] = useState(false);
  const attemptKind = attempt?.kind;
  useEffect(() => {
    if (attemptKind !== undefined) {
      setMode(attemptKind === 'challenge' ? 'code' : 'manual');
    }
  }, [attemptKind]);
  const now = useNow(attempt !== null);
  const payload = inputOf(mode, { code, username, password, cookies });

  async function submit() {
    if (busy || attempt === null || payload === null) {
      return;
    }
    setBusy(true);
    try {
      await submitBrowserLoginAttemptInput(orgId, credentialId, attempt.attemptId, payload);
      setCode('');
      setUsername('');
      setPassword('');
      setCookies('');
      await respondToAsk(threadId, pending, { provided: true });
    } catch (error) {
      toast.add({
        title: 'Could not submit login input',
        description: error instanceof Error ? error.message : 'Unknown error',
      });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      await rejectAsk(threadId, pending, 'website login cancelled');
    } finally {
      setBusy(false);
    }
  }

  return (
    <HitlShell>
      <div className="flex flex-col gap-2 px-3 pt-2.5 pb-2.5" data-testid="browser-login-card">
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium text-sm">Website login needs you</p>
          <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
            {remainingLabel(attempt?.expiresAt, now)}
          </span>
        </div>
        {pending.prompt ? (
          <p className="text-[11px] text-muted-foreground leading-snug">{pending.prompt}</p>
        ) : null}
        <ToggleGroup
          variant="segment"
          size="sm"
          value={[mode]}
          onValueChange={(value) => {
            const next = value[0];
            if (next === 'code' || next === 'manual' || next === 'import') {
              setMode(next);
            }
          }}
        >
          <ToggleGroupItem value="code" className="text-[11px]">
            Verification code
          </ToggleGroupItem>
          <ToggleGroupItem value="manual" className="text-[11px]">
            Username & password
          </ToggleGroupItem>
          <ToggleGroupItem value="import" className="text-[11px]">
            Import session
          </ToggleGroupItem>
        </ToggleGroup>
        {mode === 'code' ? (
          <Input
            aria-label="Verification code"
            placeholder="123456"
            autoComplete="one-time-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
          />
        ) : null}
        {mode === 'manual' ? (
          <div className="grid grid-cols-2 gap-2">
            <Input
              aria-label="Username"
              placeholder="Username"
              autoComplete="username"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
            <Input
              aria-label="Password"
              placeholder="Password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        ) : null}
        {mode === 'import' ? (
          <Textarea
            aria-label="Cookies JSON"
            placeholder='Paste the site cookies JSON exported from your own browser, e.g. [{"name":"session","value":"...","domain":"example.com"}]. Nothing is stored after the run.'
            rows={4}
            value={cookies}
            onChange={(event) => setCookies(event.target.value)}
          />
        ) : null}
        {attempt === null ? (
          <p className="text-[11px] text-muted-foreground leading-snug">
            No active login attempt was found for this run.{' '}
            <button
              type="button"
              className="underline"
              onClick={() => void query.refetch()}
              data-testid="browser-login-attempt-refresh"
            >
              Check again
            </button>
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={cancel}>
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || attempt === null || payload === null}
            onClick={submit}
            data-testid="browser-login-submit"
          >
            Continue
          </Button>
        </div>
      </div>
    </HitlShell>
  );
}
