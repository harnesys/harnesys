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
}): ReactNode {
  return (
    <section className="flex flex-col gap-1.5 border-border/40 border-b pb-3 last:border-b-0">
      <div className="flex h-5 items-center justify-between gap-2">
        <h3 className="font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
          {label}
        </h3>
        <div className="flex items-center gap-1">
          {hint ? (
            <span className="font-mono text-[10px] text-muted-foreground/70">{hint}</span>
          ) : null}
          {action}
        </div>
      </div>
      {children}
    </section>
  );
}
