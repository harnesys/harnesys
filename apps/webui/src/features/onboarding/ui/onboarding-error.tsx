import { Button } from '@/shared/ui/button';
import { OnboardingShell } from './onboarding-shell';

export function OnboardingError({
  message,
  onRetry,
  onSetup,
}: {
  message: string;
  onRetry: () => void;
  onSetup: () => void;
}) {
  return (
    <OnboardingShell testId="org-bootstrap-error">
      <div className="mx-auto flex w-full max-w-md flex-col gap-6 text-center">
        <div className="flex flex-col gap-2">
          <h1 className="font-semibold text-2xl tracking-[-0.03em]">
            Could not load organizations
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">{message}</p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-2">
          <Button type="button" onClick={onRetry} data-testid="org-bootstrap-retry">
            Retry
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={onSetup}
            data-testid="org-bootstrap-onboarding"
          >
            Set up organization
          </Button>
        </div>
      </div>
    </OnboardingShell>
  );
}
