import { type ReactNode, useEffect, useState } from 'react';
import { dismissSplash } from '@/app/splash';
import { EulaConsentScreen } from '@/features/eula/ui/eula-consent-screen';
import { type EulaStatus, getEulaStatus } from '@/shared/api/eula';
import { Button } from '@/shared/ui/button';

type GateState = 'checking' | 'agreed' | 'required' | 'unreachable';

export function EulaGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<GateState>('checking');
  const [status, setStatus] = useState<EulaStatus | null>(null);
  const [_attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state === 'checking') {
      return;
    }
    dismissSplash();
  }, [state]);

  useEffect(() => {
    if (state !== 'checking') {
      return;
    }
    let cancelled = false;
    const run = async () => {
      try {
        const next = await getEulaStatus();
        if (cancelled) {
          return;
        }
        setStatus(next);
        setState(next.consent ? 'agreed' : 'required');
      } catch {
        if (!cancelled) {
          setState('unreachable');
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [state]);

  if (state === 'checking') {
    return null;
  }
  if (state === 'unreachable') {
    return (
      <div className="flex min-h-svh flex-col items-center justify-center gap-3 bg-background px-6 text-center text-foreground">
        <p className="font-medium">Cannot reach the Harnesys service</p>
        <p className="max-w-sm text-muted-foreground text-sm">
          The local service did not answer while checking the license agreement.
        </p>
        <Button
          variant="outline"
          onClick={() => {
            setAttempt((value) => value + 1);
            setState('checking');
          }}
        >
          Retry
        </Button>
      </div>
    );
  }
  if (state === 'required' && status) {
    return (
      <EulaConsentScreen
        agreementId={status.agreement.id}
        version={status.agreement.version}
        onAccepted={() => setState('agreed')}
      />
    );
  }
  return children;
}
