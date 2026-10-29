import type { MachineOrgEntry } from '@harnesys/studio-shared';
import type { ReactNode } from 'react';
import { OnboardingShell } from '@/features/onboarding';
import { cn } from '@/shared/lib/utils';
import { buttonVariants } from '@/shared/ui/button';

export function RelayLinkPanel({
  entry,
  onPairAnother,
}: {
  entry: MachineOrgEntry;
  onPairAnother: () => void;
}) {
  const relayUrl = entry.relayUrl ?? '#';
  return (
    <OnboardingShell testId="relay-link">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="font-semibold text-2xl tracking-[-0.03em] sm:text-3xl">{entry.name}</h1>
        <p className="mt-3 text-muted-foreground text-sm leading-relaxed">
          This machine is a worker node. It does not serve the organization desk — all projects,
          threads and runs live on the relay.
        </p>
        <div className="mt-8 flex flex-col gap-3 rounded-lg border bg-card/60 p-4">
          <Row label="Role">
            <span className="font-mono text-xs" data-testid="relay-link-node-role">
              {entry.role}
            </span>
          </Row>
          <Row label="Node status">
            <span className="text-xs" data-testid="relay-link-node-status">
              paired, serves the relay only
            </span>
          </Row>
          <Row label="Relay">
            <a
              href={relayUrl}
              className="text-xs underline-offset-4 hover:underline"
              data-testid="relay-link-url"
            >
              {relayUrl}
            </a>
          </Row>
        </div>
        <div className="mt-6 flex flex-wrap gap-2">
          <a className={cn(buttonVariants())} href={relayUrl} data-testid="relay-link-open">
            Open desk on relay
          </a>
          <button
            type="button"
            className={cn(buttonVariants({ variant: 'outline' }))}
            onClick={onPairAnother}
            data-testid="relay-link-pair-another"
          >
            Pair another organization
          </button>
        </div>
      </div>
    </OnboardingShell>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground text-xs">{label}</span>
      {children}
    </div>
  );
}
