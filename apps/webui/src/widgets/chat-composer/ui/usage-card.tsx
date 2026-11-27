import {
  cacheMissTokens,
  formatDuration,
  formatTokenCount,
  type MessageUsage,
  textOutputTokens,
  tokensLeft,
  tokensUsed,
  type UsageRollup,
} from '@/entities/session';
import { useDeskStore } from '@/features/desk';
import type { ModelToolStats } from '../model/model-context';
import { CacheEfficiency } from './cache-efficiency';
import { ContextBreakdown } from './context-breakdown';

interface UsageCardProps {
  last: MessageUsage | null;
  run: UsageRollup | null;
  thread: UsageRollup | null;
  subagents?: UsageRollup | null;
  stats?: ModelToolStats | null;
  window?: number;
}
export function UsageCard({
  last,
  run,
  thread,
  subagents,
  stats,
  window: windowProp = 0,
}: UsageCardProps) {
  const window = last?.contextTokens || windowProp;
  const used = last ? tokensUsed(last) : 0;
  let left = 0;
  if (window > 0) {
    left = Math.max(0, window - used);
  } else if (last) {
    left = tokensLeft(last);
  }
  const percent = window > 0 ? Math.round(Math.min(1, used / window) * 100) : 0;
  return (
    <div className="flex flex-col gap-3" data-testid="usage-card">
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <p className="font-medium text-sm">
            Context
            <span className="ml-1.5 font-mono font-normal text-muted-foreground text-xs">
              {formatTokenCount(used)} / {window > 0 ? formatTokenCount(window) : '—'}
            </span>
          </p>
          <CacheEfficiency
            cacheReadTokens={last?.cacheReadTokens ?? 0}
            cacheWriteTokens={last?.cacheWriteTokens ?? 0}
            promptTokens={used}
            scope="last request"
          />
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-live"
            style={{ width: `${window > 0 ? Math.max(percent, 2) : 0}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[11px] text-muted-foreground">
          <span
            title={
              window > 0
                ? undefined
                : 'Model metadata has no context window; set it in project settings'
            }
          >
            {window > 0 ? `${percent}% used` : 'Window unknown'}
          </span>
          <span>{window > 0 ? `${formatTokenCount(left)} remaining` : last?.model || '—'}</span>
        </div>
        <RequestsLink />
      </div>

      {stats?.plan ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Breakdown
          </p>
          <ContextBreakdown plan={stats.plan} window={window} />
        </div>
      ) : null}

      {stats && stats.tools > 0 ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Tools
          </p>
          <StatRow label="Direct" value={String(stats.tools - stats.deferredPending)} />
          {stats.deferredPending > 0 ? (
            <StatRow label="Deferred" value={String(stats.deferredPending)} />
          ) : null}
        </div>
      ) : null}

      {last && (last.promptTokens > 0 || last.generatedTokens > 0) ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Last step
          </p>
          <LastStepRows usage={last} />
        </div>
      ) : null}

      <RollupSections run={run} thread={thread} subagents={subagents} />
    </div>
  );
}

function RollupSections({
  run,
  thread,
  subagents,
}: {
  run: UsageRollup | null;
  thread: UsageRollup | null;
  subagents: UsageRollup | null | undefined;
}) {
  return (
    <>
      {run && run.calls > 0 ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            This run
          </p>
          <RollupRows rollup={run} />
        </div>
      ) : null}

      {thread && thread.calls > 0 ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Thread
          </p>
          <RollupRows rollup={thread} />
        </div>
      ) : null}

      {subagents && subagents.calls > 0 ? (
        <div className="border-t pt-2">
          <p className="mb-1.5 font-mono text-[10px] text-muted-foreground uppercase tracking-[0.12em]">
            Subagents
          </p>
          <RollupRows rollup={subagents} />
        </div>
      ) : null}
    </>
  );
}
function LastStepRows({ usage }: { usage: MessageUsage }) {
  const cacheRead = usage.cacheReadTokens ?? 0;
  const cacheWrite = usage.cacheWriteTokens ?? 0;
  const reasoning = usage.reasoningTokens ?? 0;
  const cacheMiss = cacheMissTokens(usage);
  return (
    <>
      <StatRow label="Input (Cache Miss)" value={`${formatTokenCount(cacheMiss)} tok`} />
      <StatRow label="Cache Hit" value={`${formatTokenCount(cacheRead)} tok`} />
      {cacheWrite > 0 ? (
        <StatRow label="Cache Write" value={`${formatTokenCount(cacheWrite)} tok`} />
      ) : null}
      <StatRow label="Output (Text)" value={`${formatTokenCount(textOutputTokens(usage))} tok`} />
      {reasoning > 0 ? (
        <StatRow label="Reasoning" value={`${formatTokenCount(reasoning)} tok`} />
      ) : null}
    </>
  );
}
function RollupRows({ rollup }: { rollup: UsageRollup }) {
  const cacheMiss = cacheMissTokens(rollup);
  return (
    <>
      {rollup.steps > 1 ? <StatRow label="Steps" value={String(rollup.steps)} /> : null}
      <StatRow label="Input (Cache Miss)" value={`${formatTokenCount(cacheMiss)} tok`} />
      {rollup.cacheReadTokens > 0 ? (
        <StatRow label="Cache Hit" value={`${formatTokenCount(rollup.cacheReadTokens)} tok`} />
      ) : null}
      {rollup.cacheWriteTokens > 0 ? (
        <StatRow label="Cache Write" value={`${formatTokenCount(rollup.cacheWriteTokens)} tok`} />
      ) : null}
      <StatRow label="Output (Text)" value={`${formatTokenCount(textOutputTokens(rollup))} tok`} />
      {rollup.reasoningTokens > 0 ? (
        <StatRow label="Reasoning" value={`${formatTokenCount(rollup.reasoningTokens)} tok`} />
      ) : null}
      <StatRow label="Model time" value={formatDuration(rollup.durationMs)} />
      <StatRow label="Cost" value={rollup.priced > 0 ? `$${rollup.costUsd.toFixed(4)}` : '—'} />
    </>
  );
}
function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-0.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
function RequestsLink() {
  const setInspectorTab = useDeskStore((state) => state.setInspectorTab);
  const setInspectorOpen = useDeskStore((state) => state.setInspectorOpen);
  return (
    <button
      type="button"
      className="mt-1 self-start font-mono text-[10px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
      onClick={() => {
        setInspectorTab('requests');
        setInspectorOpen(true);
      }}
    >
      View model requests →
    </button>
  );
}
