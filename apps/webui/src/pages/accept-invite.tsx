import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { OnboardingShell } from '@/features/onboarding';
import { OnboardingField } from '@/features/onboarding/ui/onboarding-field';
import { ApiError } from '@/shared/api/client';
import { type AcceptedMemberInvite, acceptMemberInvite } from '@/shared/api/members';
import { sessionLogin } from '@/shared/api/session';
import { studioPath } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';

function describeFailure(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 410) {
      return 'Invite is unknown, expired, or already used';
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
  const [code, setCode] = useState(searchParams.get('code') ?? '');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <OnboardingShell testId="invite-accept">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">Accept an invite</h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
          Paste the invite code from your organization owner, pick a login and password. Existing
          accounts keep their login — just confirm the current password. The code works once and
          expires 24 hours after it was created.
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
