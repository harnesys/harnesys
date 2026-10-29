import type { ReactNode } from 'react';

export function Section({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 border-border/40 border-b pt-4 pb-2 first:border-t-0 first:pt-0">
      <div className="flex h-6 items-center justify-between gap-2">
        <h2 className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          {label}
        </h2>
        <div className="flex min-w-0 items-center gap-1">
          {hint ? (
            <span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums">
              {hint}
            </span>
          ) : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}

export function SectionEmpty({ children }: { children: ReactNode }) {
  return <p className="text-[12px] text-muted-foreground leading-snug">{children}</p>;
}
