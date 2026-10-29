import type { AgentHook, HookRunStatus, HookTestResponse } from '@harnesys/contracts';
import { PlayIcon } from 'lucide-react';
import { useState } from 'react';
import { testAgentHook } from '@/shared/api';
import { Button } from '@/shared/ui/button';
import { RowSection } from '@/shared/ui/capability-rows';

type TestState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; result: HookTestResponse }
  | { kind: 'error'; message: string };

const STATUS_LABELS: Record<HookRunStatus, string> = {
  ok: 'ok',
  blocked: 'blocked',
  failed: 'failed',
  timeout: 'timeout',
  skipped: 'skipped',
  denied: 'denied by permissions',
};

export function HookTestPanel({
  orgId,
  agentId,
  hook,
}: {
  orgId: string;
  agentId: string;
  hook: AgentHook;
}) {
  const [state, setState] = useState<TestState>({ kind: 'idle' });
  async function run(): Promise<void> {
    setState({ kind: 'running' });
    try {
      const result = await testAgentHook(orgId, agentId, hook);
      setState({ kind: 'done', result });
    } catch (error) {
      setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
    }
  }
  return (
    <RowSection label="Test run">
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={run}
            disabled={state.kind === 'running'}
          >
            <PlayIcon />
            {state.kind === 'running' ? 'Running…' : 'Run hook'}
          </Button>
          {state.kind === 'done' ? (
            <span className="text-muted-foreground text-xs">
              {STATUS_LABELS[state.result.status]} · {state.result.durationMs} ms
            </span>
          ) : null}
        </div>
        {state.kind === 'error' ? (
          <p className="text-destructive text-xs">{state.message}</p>
        ) : null}
        {state.kind === 'done' ? <TestResult result={state.result} /> : null}
      </div>
    </RowSection>
  );
}

function TestResult({ result }: { result: HookTestResponse }) {
  return (
    <div className="flex flex-col gap-1">
      {result.output !== undefined && result.output !== '' ? (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-muted p-2 font-mono text-[11px]">
          {result.output}
        </pre>
      ) : null}
      {result.effects.length > 0 ? (
        <p className="text-muted-foreground text-xs">
          effects: {result.effects.map((effect) => effect.kind).join(', ')}
        </p>
      ) : null}
      {result.diagnostics.map((diagnostic) => (
        <p
          key={`${diagnostic.code}-${diagnostic.message}`}
          className="text-muted-foreground text-xs"
        >
          {diagnostic.code}: {diagnostic.message}
        </p>
      ))}
    </div>
  );
}
