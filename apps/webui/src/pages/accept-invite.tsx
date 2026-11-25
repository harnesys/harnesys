import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { OnboardingShell } from '@/features/onboarding';
import { OnboardingField } from '@/features/onboarding/ui/onboarding-field';
import { ApiError } from '@/shared/api/client';
import {
  type AcceptedMemberInvite,
  acceptMemberInvite,
  previewMemberInvite,
} from '@/shared/api/members';
import { sessionLogin } from '@/shared/api/session';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { Spinner } from '@/shared/ui/spinner';

function describeFailure(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 410) {
      return 'This invite link is invalid, expired, or already used. Ask the organization admin for a new invite link.';
    }
    if (err.status === 401) {
      return 'This login already exists with a different password';
    }
    return err.message;
  }
  return err instanceof Error ? err.message : 'Accept invite failed';
}

export function AcceptInvitePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialCode = (searchParams.get('code') ?? '').trim();
  const [code, setCode] = useState(initialCode);
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(initialCode.length > 0);
  const [invalid, setInvalid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialCode) {
      return;
    }
    let cancelled = false;
    previewMemberInvite(initialCode)
      .then(() => {
        if (!cancelled) {
          setChecking(false);
        }
      })
      .catch((err: unknown) => {
        if (cancelled) {
          return;
        }
        setChecking(false);
        if (err instanceof ApiError && err.status === 410) {
          setInvalid(true);
          setError(describeFailure(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [initialCode]);

  const submit = async () => {
    if (!code.trim() || !login.trim() || !password) {
      setError('Invite code, login and password are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const accepted: AcceptedMemberInvite = await acceptMemberInvite({
        code: code.trim(),
        login: login.trim(),
        password,
      });
      await sessionLogin(login.trim(), password);
      void navigate(studioPath.desk(accepted.orgId), { replace: true });
    } catch (err) {
      setError(describeFailure(err));
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <OnboardingShell testId="invite-accept">
        <div className="mx-auto flex w-full max-w-lg items-center gap-3">
          <Spinner className="size-5" />
          <p className="text-muted-foreground text-sm">Checking the invite link…</p>
        </div>
      </OnboardingShell>
    );
  }

  if (invalid) {
    return (
      <OnboardingShell testId="invite-accept">
        <div className="mx-auto w-full max-w-lg" data-testid="invite-accept-invalid">
          <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
            Invite unavailable
          </h1>
          <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
            {error ??
              'This invite link is invalid, expired, or already used. Ask the organization admin for a new invite link.'}
          </p>
          <p className="mt-6 text-muted-foreground text-sm">
            Already a member?{' '}
            <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </OnboardingShell>
    );
  }

  return (
    <OnboardingShell testId="invite-accept">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">Accept an invite</h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
          The invite code is prefilled from your link. Pick a login and password. Existing accounts
          keep their login — just confirm the current password. The code works once and expires 24
          hours after it was created.
        </p>
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <OnboardingField
            id="invite-accept-code"
            label="Invite code"
            hint="Code from the invite dialog, exactly as copied."
            value={code}
            onChange={setCode}
            autoFocus
            testId="invite-accept-code"
          />
          <OnboardingField
            id="invite-accept-login"
            label="Login"
            hint="New account, or your existing Harnesys login."
            value={login}
            onChange={setLogin}
            autoComplete="username"
            testId="invite-accept-login"
          />
          <OnboardingField
            id="invite-accept-password"
            label="Password"
            hint="Must match your existing account if the login is already taken."
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="new-password"
            testId="invite-accept-password"
          />
          {error ? (
            <p className="text-destructive text-sm" data-testid="invite-accept-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={busy} data-testid="invite-accept-submit">
            {busy ? 'Accepting...' : 'Accept invite and sign in'}
          </Button>
        </form>
        <p className="mt-6 text-muted-foreground text-sm">
          Already a member?{' '}
          <Link to="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </OnboardingShell>
  );
}
