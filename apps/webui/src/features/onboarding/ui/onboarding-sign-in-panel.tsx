import { useState } from 'react';
import { type SessionFailure, sessionLogin } from '@/shared/api/session';
import { Button } from '@/shared/ui/button';
import {
  SIGN_IN_LOGIN_HINT,
  SIGN_IN_LOGIN_LABEL,
  SIGN_IN_PANEL_BODY,
  SIGN_IN_PANEL_TITLE,
  SIGN_IN_PASSWORD_HINT,
  SIGN_IN_PASSWORD_LABEL,
  SIGN_IN_SUBMIT,
} from '../model/onboarding-copy';
import { OnboardingField } from './onboarding-field';
import { OnboardingShell } from './onboarding-shell';

export function OnboardingSignInPanel({ onReady }: { onReady: () => void }) {
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!login.trim() || !password) {
      setError('Login and password are required');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await sessionLogin(login.trim(), password);
      onReady();
    } catch (err) {
      setError(describeFailure(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell testId="session-login">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
          {SIGN_IN_PANEL_TITLE}
        </h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{SIGN_IN_PANEL_BODY}</p>
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <OnboardingField
            id="session-login-input"
            label={SIGN_IN_LOGIN_LABEL}
            hint={SIGN_IN_LOGIN_HINT}
            value={login}
            onChange={setLogin}
            autoComplete="username"
            autoFocus
            testId="session-login-input"
          />
          <OnboardingField
            id="session-login-password"
            label={SIGN_IN_PASSWORD_LABEL}
            hint={SIGN_IN_PASSWORD_HINT}
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="current-password"
            testId="session-login-password"
          />
          {error ? (
            <p className="text-destructive text-sm" data-testid="session-login-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={busy} data-testid="session-login-submit">
            {busy ? 'Signing in…' : SIGN_IN_SUBMIT}
          </Button>
        </form>
      </div>
    </OnboardingShell>
  );
}

export function describeFailure(err: unknown): string {
  if (err && typeof err === 'object' && 'errorCode' in err) {
    const failure = err as Pick<SessionFailure, 'errorCode' | 'message' | 'retryAfterSec'>;
    if (failure.errorCode === 'INVALID_CREDENTIALS') {
      return 'Invalid login or password';
    }
    if (failure.errorCode === 'ACCOUNT_LOCKED') {
      return failure.retryAfterSec
        ? `Account locked — retry in ${failure.retryAfterSec}s`
        : 'Account locked — try again later';
    }
    if (failure.errorCode === 'FORBIDDEN') {
      return 'Owner setup is only available from the machine running Harnesys';
    }
    return `${failure.errorCode}: ${failure.message}`;
  }
  return err instanceof Error ? err.message : 'Login failed';
}
