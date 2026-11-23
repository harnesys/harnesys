import { cn } from '@/shared/lib/utils';

export function SourceControlPatch({ patch }: { patch: string }) {
  const lines = patch.split('\n');
  return (
    <div className="w-max min-w-full whitespace-pre px-3 py-2 font-mono text-[11px] leading-[1.5]">
      {lines.map((line, index) => (
        <div key={`${index}-${line.slice(0, 24)}`} className={cn(lineColor(line), 'px-1')}>
          {line || ' '}
        </div>
      ))}
    </div>
  );
}

function lineColor(line: string): string {
  if (line.startsWith('diff --git') || line.startsWith('index ')) {
    return 'text-muted-foreground';
  }
  if (line.startsWith('+++') || line.startsWith('---')) {
    return 'text-muted-foreground';
  }
  if (line.startsWith('@@')) {
    return 'text-status-info';
  }
  if (line.startsWith('+')) {
    return 'bg-status-ok/10 text-status-ok';
  }
  if (line.startsWith('-')) {
    return 'bg-destructive/10 text-destructive';
  }
  return 'text-foreground/80';
}
