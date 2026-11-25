import type { TriggerGate, TriggerScript, TriggerScriptTestResponse } from '@harnesys/contracts';
import { useState } from 'react';
import { testOrgAddonTriggerScript } from '@/shared/api/addon-trigger-scripts';
import { Button } from '@/shared/ui/button';

interface TestState {
  busy: boolean;
  result?: TriggerScriptTestResponse;
  error?: string;
}

export function ScriptTestRow({
  orgId,
  addonId,
  instanceId,
  script,
  gate,
}: {
  orgId: string;
  addonId: string;
  instanceId: string | undefined;
  script: TriggerScript;
  gate?: TriggerGate;
}) {
  const [state, setState] = useState<TestState>({ busy: false });
  if (instanceId === undefined) {
    return null;
  }
  const run = async () => {
    setState({ busy: true });
    try {
      const result = await testOrgAddonTriggerScript(orgId, addonId, instanceId, {
        script,
        ...(gate === undefined ? {} : { gate }),
      });
      setState({ busy: false, result });
    } catch (error) {
      setState({
        busy: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={state.busy || script.command.trim().length === 0}
          onClick={() => void run()}
        >
          {state.busy ? 'Running…' : 'Test'}
        </Button>
        <span className="text-muted-foreground text-xs">Runs in the selected workspace now.</span>
      </div>
      {state.error === undefined ? null : <p className="text-destructive text-xs">{state.error}</p>}
      {state.result === undefined ? null : <TestResult result={state.result} />}
    </div>
  );
}

function TestResult({ result }: { result: TriggerScriptTestResponse }) {
  const output = [
    `${result.status} · exit ${result.exitCode ?? 'signal'} · ${result.durationMs} ms`,
    result.gateVerdict === 'unmatched' ? 'condition not met' : null,
    result.stdout.trim().length > 0 ? result.stdout : null,
    result.stderr.trim().length > 0 ? result.stderr : null,
  ]
    .filter((line): line is string => line !== null)
    .join('\n');
  return (
    <pre className="max-h-48 overflow-auto rounded-md bg-muted/60 p-2 font-mono text-[11px] leading-4">
      {output}
    </pre>
  );
}
