import { exit } from '@tauri-apps/plugin-process';
import { ShieldOffIcon } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { AgreementText } from '@/features/eula/ui/agreement-text';
import { acceptEula } from '@/shared/api/eula';
import { env } from '@/shared/config/env';
import { AppLogo } from '@/shared/ui/app-logo';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { Label } from '@/shared/ui/label';

interface EulaConsentScreenProps {
  agreementId: string;
  version: string;
  onAccepted: () => void;
}

export function EulaConsentScreen({ agreementId, version, onAccepted }: EulaConsentScreenProps) {
  const [agreed, setAgreed] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState(false);
  const [declined, setDeclined] = useState(false);

  if (declined) {
    return <DeclinedScreen onReview={() => setDeclined(false)} />;
  }

  const decline = () => {
    if (env.isTauri) {
      void exit(0);
      return;
    }
    setDeclined(true);
  };

  const accept = async () => {
    setAccepting(true);
    setAcceptError(false);
    try {
      await acceptEula(agreementId);
      onAccepted();
    } catch {
      setAcceptError(true);
      setAccepting(false);
    }
  };

  return (
    <div className="relative flex h-svh flex-col overflow-hidden bg-background text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_srgb,#d4763c_14%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:18px_18px]"
      />
      <header className="relative z-10 flex shrink-0 items-center gap-2.5 px-6 pt-6 sm:px-10">
        <AppLogo className="size-8" />
        <span className="font-semibold text-[1.05rem]">Harnesys</span>
      </header>
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-6 pb-6 sm:px-10">
        <div className="flex min-h-0 flex-1 flex-col py-6">
          <div className="flex shrink-0 items-center gap-3">
            <h1 className="font-semibold text-2xl">License Agreement</h1>
            <Badge variant="secondary">v{version}</Badge>
          </div>
          <p className="mt-1.5 shrink-0 text-muted-foreground text-sm">
            Please read and accept the agreement to use Harnesys.
          </p>
          <div className="mt-4 min-h-32 flex-1 overflow-y-auto rounded-xl border border-border/60 p-5">
            <AgreementText version={version} />
          </div>
          <div className="mt-4 flex shrink-0 flex-col gap-3">
            <div className="flex items-center gap-2.5 text-sm">
              <Checkbox
                id="eula-accept"
                checked={agreed}
                onCheckedChange={(checked) => setAgreed(checked === true)}
              />
              <Label htmlFor="eula-accept" className="cursor-pointer select-none">
                I have read and accept the License Agreement
              </Label>
            </div>
            {acceptError ? (
              <p className="text-destructive text-sm">
                Could not save your acceptance. Check that the local service is running and try
                again.
              </p>
            ) : null}
            <div className="flex justify-end gap-2.5">
              <Button variant="outline" onClick={decline}>
                Decline
              </Button>
              <Button disabled={!agreed || accepting} onClick={() => void accept()}>
                {accepting ? 'Accepting…' : 'Accept and continue'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DeclinedScreen({ onReview }: { onReview: () => void }) {
  return (
    <CenteredShell>
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl border border-border/60 bg-muted/40">
          <ShieldOffIcon className="size-6 text-muted-foreground" />
        </div>
        <h1 className="font-semibold text-xl">Application locked</h1>
        <p className="text-muted-foreground text-sm">
          You declined the License Agreement, so Harnesys stays locked. Review the agreement and
          accept it to continue.
        </p>
        <Button variant="outline" onClick={onReview}>
          Review agreement
        </Button>
      </div>
    </CenteredShell>
  );
}

function CenteredShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden bg-background px-6 text-foreground">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_srgb,#d4763c_14%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:18px_18px]"
      />
      <div className="relative z-10 flex flex-col items-center">{children}</div>
    </div>
  );
}
