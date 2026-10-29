import { cn } from '@/shared/lib/utils';
import type { ShellCommandView } from '../model/shell-command';

const VERDICT_TONE = {
  allow: 'text-emerald-600 dark:text-emerald-400',
  ask: 'text-amber-600 dark:text-amber-400',
  deny: 'text-destructive',
} as const;

export function ShellCommandBlock({ view }: { view: ShellCommandView }) {
  if (!view.command && view.segments.length === 0) {
    return <p className="text-[11px] text-muted-foreground">No command captured.</p>;
  }
  if (!view.command || view.segments.length === 0) {
    return (
      <pre className="max-h-36 overflow-auto whitespace-pre-wrap rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[12px] leading-relaxed">
        {view.command}
      </pre>
    );
  }
  return (
    <div className="max-h-36 overflow-auto rounded-md bg-muted/50 px-2.5 py-2 font-mono text-[12px] leading-relaxed">
      {view.segments.map((segment, index) => (
        <div
          key={index}
          className={cn(segment.verdict ? VERDICT_TONE[segment.verdict] : undefined)}
        >
          {segment.text}
        </div>
      ))}
    </div>
  );
}
