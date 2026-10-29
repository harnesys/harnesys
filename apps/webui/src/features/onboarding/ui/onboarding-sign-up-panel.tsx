import { useState } from 'react';
import { sessionLogin, sessionOwnerInit } from '@/shared/api/session';
import { Button } from '@/shared/ui/button';
import {
  SIGN_UP_LOGIN_HINT,
  SIGN_UP_LOGIN_LABEL,
  SIGN_UP_NAME_HINT,
  SIGN_UP_NAME_LABEL,
  SIGN_UP_PANEL_BODY,
  SIGN_UP_PANEL_TITLE,
  SIGN_UP_PASSWORD_HINT,
  SIGN_UP_PASSWORD_LABEL,
  SIGN_UP_SUBMIT,
} from '../model/onboarding-copy';
import { OnboardingField } from './onboarding-field';
import { OnboardingShell } from './onboarding-shell';
import { describeFailure } from './onboarding-sign-in-panel';

export function OnboardingSignUpPanel({ onReady }: { onReady: () => void }) {
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
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
      await sessionOwnerInit({
        login: login.trim(),
        name: displayName.trim() || login.trim(),
        password,
      });
      await sessionLogin(login.trim(), password);
      onReady();
    } catch (err) {
      setError(describeFailure(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <OnboardingShell testId="session-signup">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">
          {SIGN_UP_PANEL_TITLE}
        </h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">{SIGN_UP_PANEL_BODY}</p>
        <form
          className="mt-8 flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <OnboardingField
            id="session-signup-login"
            label={SIGN_UP_LOGIN_LABEL}
            hint={SIGN_UP_LOGIN_HINT}
            value={login}
            onChange={setLogin}
            autoComplete="username"
            autoFocus
            testId="session-signup-login"
          />
          <OnboardingField
            id="session-signup-name"
            label={SIGN_UP_NAME_LABEL}
            hint={SIGN_UP_NAME_HINT}
            value={displayName}
            onChange={setDisplayName}
            autoComplete="name"
            testId="session-signup-name"
          />
          <OnboardingField
            id="session-signup-password"
            label={SIGN_UP_PASSWORD_LABEL}
            hint={SIGN_UP_PASSWORD_HINT}
            value={password}
            onChange={setPassword}
            type="password"
            autoComplete="new-password"
            testId="session-signup-password"
          />
          {error ? (
            <p className="text-destructive text-sm" data-testid="session-signup-error">
              {error}
            </p>
          ) : null}
          <Button type="submit" size="lg" disabled={busy} data-testid="session-signup-submit">
            {busy ? 'Creating owner…' : SIGN_UP_SUBMIT}
          </Button>
        </form>
      </div>
    </OnboardingShell>
  );
}
