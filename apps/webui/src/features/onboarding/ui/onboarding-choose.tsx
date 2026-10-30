import {
  CHOOSE_CREATE_CTA,
  CHOOSE_CREATE_HINT,
  CHOOSE_JOIN_CTA,
  CHOOSE_JOIN_HINT,
  ONBOARDING_FOOTER,
  ONBOARDING_STEPS,
  ONBOARDING_SUB,
  ONBOARDING_TITLE,
} from '../model/onboarding-copy';
import { OnboardingShell } from './onboarding-shell';

export function OnboardingChoose({
  onCreate,
  onJoin,
}: {
  onCreate: () => void;
  onJoin: () => void;
}) {
  return (
    <OnboardingShell testId="first-run-gate" width="wide" footer={<p>{ONBOARDING_FOOTER}</p>}>
      <div className="mx-auto grid w-full max-w-6xl gap-12 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start lg:gap-16">
        <section className="flex flex-col gap-5">
          <h1 className="max-w-[22ch] font-semibold text-3xl tracking-[-0.03em] sm:text-4xl sm:leading-[1.1]">
            {ONBOARDING_TITLE}
          </h1>
          <p className="max-w-xl text-muted-foreground text-sm leading-relaxed">{ONBOARDING_SUB}</p>
          <ol className="mt-2 flex max-w-xl flex-col gap-4 border-border/70 border-l pl-5">
            {ONBOARDING_STEPS.map((step, index) => (
              <li key={step.title} className="relative">
                <span
                  aria-hidden="true"
                  className="absolute top-0.5 -left-[1.55rem] flex size-5 items-center justify-center rounded-full bg-background font-mono text-[10px] text-muted-foreground ring-1 ring-border"
                >
                  {index + 1}
                </span>
                <p className="font-medium text-sm leading-snug">{step.title}</p>
                <p className="mt-1 text-muted-foreground text-xs leading-relaxed">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="flex flex-col gap-3 lg:pt-1">
          <button
            type="button"
            onClick={onCreate}
            data-testid="gate-create"
            className="flex w-full flex-col gap-2 rounded-2xl border border-[#d4763c]/40 bg-[linear-gradient(180deg,color-mix(in_srgb,#d4763c_16%,var(--card)),var(--card))] p-5 text-left transition-[border-color] hover:border-[#d4763c]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4763c]/60"
          >
            <span className="font-semibold text-[1.05rem] tracking-[-0.02em]">
              {CHOOSE_CREATE_CTA}
            </span>
            <span className="text-muted-foreground text-sm leading-relaxed">
              {CHOOSE_CREATE_HINT}
            </span>
          </button>

          <button
            type="button"
            onClick={onJoin}
            data-testid="gate-join"
            className="flex w-full flex-col gap-2 rounded-2xl border border-border bg-card/80 p-5 text-left transition-[border-color,background-color] hover:border-foreground/25 hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="font-medium text-sm">{CHOOSE_JOIN_CTA}</span>
            <span className="text-muted-foreground text-xs leading-relaxed">
              {CHOOSE_JOIN_HINT}
            </span>
          </button>
        </section>
      </div>
    </OnboardingShell>
  );
}
