import type { ReactNode } from 'react';
import { AppLogo } from '@/shared/ui/app-logo.tsx';

export function OnboardingShell({
  children,
  footer,
  testId,
}: {
  children: ReactNode;
  footer?: ReactNode;
  testId?: string;
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
      <main className="relative z-10 flex flex-1 flex-col justify-center px-6 py-10 sm:px-10 lg:py-14">
        {children}
      </main>
      {footer ? (
        <footer className="relative z-10 border-border/60 border-t px-6 py-4 text-muted-foreground text-xs sm:px-10">
          {footer}
        </footer>
      ) : null}
    </div>
  );
}
