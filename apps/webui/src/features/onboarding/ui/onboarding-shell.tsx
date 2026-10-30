import { CheckIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { AppLogo } from '@/shared/ui/app-logo.tsx';

const STEP_RING_DONE = 'border-border bg-foreground/10 text-muted-foreground';
const STEP_RING_CURRENT = 'border-[#d4763c] bg-[#d4763c] text-background';
const STEP_RING_NEXT = 'border-border text-muted-foreground/60';

const WIDTH_CLASS = {
  narrow: 'max-w-xl',
  wide: 'max-w-5xl',
} as const;

export function OnboardingShell({
  children,
  footer,
  testId,
  steps,
  currentStep,
  width = 'narrow',
}: {
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
  steps?: readonly string[];
  currentStep?: number;
  width?: keyof typeof WIDTH_CLASS;
}) {
  return (
    <div
      className="relative flex min-h-svh flex-col overflow-hidden bg-background text-foreground"
      data-testid={testId}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,color-mix(in_srgb,#d4763c_14%,transparent),transparent_55%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.035] [background-image:radial-gradient(circle_at_1px_1px,currentColor_1px,transparent_0)] [background-size:18px_18px]"
      />
      <header className="relative z-10 flex items-center gap-2.5 px-6 pt-6 sm:px-10">
        <AppLogo className="size-8" />
        <span className="font-semibold text-[1.05rem]">Harnesys</span>
      </header>
      <div
        className={`relative z-10 mx-auto flex w-full flex-1 flex-col px-6 sm:px-10 ${WIDTH_CLASS[width]}`}
      >
        <main className="flex flex-1 flex-col justify-center py-10 lg:py-14">
          {steps && currentStep !== undefined ? (
            <OnboardingStepRail labels={steps} current={currentStep} />
          ) : null}
          {children}
        </main>
        {footer ? (
          <footer className="border-border/60 border-t py-4 text-muted-foreground text-xs">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

function stepRingClass(done: boolean, active: boolean): string {
  if (done) {
    return STEP_RING_DONE;
  }
  return active ? STEP_RING_CURRENT : STEP_RING_NEXT;
}

function stepLabelClass(done: boolean, active: boolean): string {
  if (active) {
    return 'font-medium text-foreground';
  }
  return done ? 'text-muted-foreground' : 'text-muted-foreground/50';
}

function OnboardingStepRail({ labels, current }: { labels: readonly string[]; current: number }) {
  return (
    <ol
      className="mb-8 flex items-center gap-2 overflow-x-auto whitespace-nowrap"
      data-testid="onboarding-steps"
    >
      {labels.map((label, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={label} className="flex shrink-0 items-center gap-2">
            {index > 0 ? (
              <span
                aria-hidden="true"
                className={`h-px w-6 shrink-0 sm:w-10 ${done || active ? 'bg-[#d4763c]/50' : 'bg-border'}`}
              />
            ) : null}
            <span
              aria-current={active ? 'step' : undefined}
              className={`flex size-6 shrink-0 items-center justify-center rounded-full border font-mono text-[11px] ${stepRingClass(done, active)}`}
            >
              {done ? <CheckIcon className="size-3.5" /> : index + 1}
            </span>
            <span
              className={`text-xs ${stepLabelClass(done, active)} ${active ? '' : 'hidden sm:inline'}`}
            >
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
