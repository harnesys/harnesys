import { cacheHitRatio, formatTokenCount } from '@/entities/session';

interface CacheEfficiencyProps {
  cacheReadTokens: number;
  promptTokens: number;
  scope: string;
}

export function CacheEfficiency({ cacheReadTokens, promptTokens, scope }: CacheEfficiencyProps) {
  if (promptTokens <= 0) {
    return null;
  }
  const percent = Math.round(cacheHitRatio({ promptTokens, cacheReadTokens }) * 100);
  const missTokens = Math.max(0, promptTokens - cacheReadTokens);
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5"
      title={`Cache hit efficiency (${scope}): ${formatTokenCount(cacheReadTokens)} of ${formatTokenCount(promptTokens)} input tokens read from cache, ${formatTokenCount(missTokens)} missed`}
    >
      <span
        className="flex h-1 w-8 overflow-hidden rounded-full bg-foreground/15"
        aria-hidden="true"
      >
        <span className="h-full bg-status-ok" style={{ width: `${percent}%` }} />
      </span>
      <span className="font-mono text-[11px] text-muted-foreground tabular-nums">
        Cache {percent}%
      </span>
    </span>
  );
}
