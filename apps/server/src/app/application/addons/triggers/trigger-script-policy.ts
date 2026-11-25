import type {
  HookRunStatus,
  TriggerGate,
  TriggerGateVerdict,
  TriggerPostWhen,
  TriggerPre,
} from '@harnesys/contracts';

const OUTPUT_NOTE_MAX = 4000;

export type PreScriptSkipReason =
  | 'script-blocked'
  | 'script-failed'
  | 'script-timeout'
  | 'script-unavailable'
  | 'workspace-unavailable'
  | 'gate-unmatched'
  | 'denied';

export type TriggerScriptOutcome =
  | { kind: 'run'; note?: string }
  | { kind: 'skip'; reason: PreScriptSkipReason; status: HookRunStatus };

export interface ScriptResultFacts {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  aborted: boolean;
  spawnError?: string;
}

export function scriptStatusOf(result: ScriptResultFacts): HookRunStatus {
  if (result.spawnError !== undefined) {
    return 'failed';
  }
  if (result.timedOut) {
    return 'timeout';
  }
  if (result.aborted) {
    return 'skipped';
  }
  if (result.exitCode === 0) {
    return 'ok';
  }
  if (result.exitCode === 2) {
    return 'blocked';
  }
  return 'failed';
}

export function evaluateGate(gate: TriggerGate, result: ScriptResultFacts): TriggerGateVerdict {
  if (gate.on === 'exit-code') {
    return gateExitCode(gate.pass, result);
  }
  return gate.on === 'stdout' ? gateStdout(gate, result) : gateJson(gate, result);
}

function gateExitCode(pass: number[], result: ScriptResultFacts): TriggerGateVerdict {
  return result.exitCode !== null && pass.includes(result.exitCode) ? 'passed' : 'unmatched';
}

function gateStdout(
  gate: Extract<TriggerGate, { on: 'stdout' }>,
  result: ScriptResultFacts,
): TriggerGateVerdict {
  if (result.exitCode !== 0) {
    return 'unmatched';
  }
  if (gate.match === 'contains') {
    return result.stdout.includes(gate.value) ? 'passed' : 'unmatched';
  }
  try {
    return new RegExp(gate.value).test(result.stdout) ? 'passed' : 'unmatched';
  } catch {
    return 'unmatched';
  }
}

function gateJson(
  gate: Extract<TriggerGate, { on: 'json' }>,
  result: ScriptResultFacts,
): TriggerGateVerdict {
  if (result.exitCode !== 0) {
    return 'unmatched';
  }
  const parsed = parseJson(result.stdout);
  const found = parsed === undefined ? null : valueAtPath(parsed, gate.path);
  if (gate.op === 'exists') {
    return found === null ? 'unmatched' : 'passed';
  }
  if (gate.op === 'truthy') {
    return found?.value ? 'passed' : 'unmatched';
  }
  return found !== null && jsonEquals(found.value, gate.value) ? 'passed' : 'unmatched';
}

export function decidePreScript(input: {
  pre: TriggerPre;
  result: ScriptResultFacts;
  gateVerdict: TriggerGateVerdict;
}): TriggerScriptOutcome {
  const { pre, result, gateVerdict } = input;
  if (result.spawnError !== undefined) {
    return failure(pre, 'script-unavailable', 'failed', result);
  }
  if (result.timedOut) {
    return failure(pre, 'script-timeout', 'timeout', result);
  }
  if (result.aborted) {
    return { kind: 'skip', reason: 'script-failed', status: 'skipped' };
  }
  if (pre.gate?.on === 'exit-code') {
    if (gateVerdict !== 'passed') {
      return { kind: 'skip', reason: 'gate-unmatched', status: 'skipped' };
    }
    return passed(pre, result);
  }
  if (result.exitCode === 2) {
    return { kind: 'skip', reason: 'script-blocked', status: 'blocked' };
  }
  if (result.exitCode !== 0) {
    return failure(pre, 'script-failed', 'failed', result);
  }
  if (gateVerdict === 'unmatched') {
    return { kind: 'skip', reason: 'gate-unmatched', status: 'skipped' };
  }
  return passed(pre, result);
}

export function workspaceMissingOutcome(pre: TriggerPre): TriggerScriptOutcome {
  return {
    kind: 'skip',
    reason: 'workspace-unavailable',
    status: pre.onWorkspaceMissing === 'fail' ? 'failed' : 'skipped',
  };
}

export function postScriptApplies(
  when: TriggerPostWhen,
  status: 'completed' | 'failed' | 'cancelled',
): boolean {
  if (when === 'always') {
    return true;
  }
  return when === 'success' ? status === 'completed' : status !== 'completed';
}

export function preFailureNote(result: ScriptResultFacts): string {
  const exit = result.exitCode === null ? 'signal' : String(result.exitCode);
  const lines = [`Pre-run script failed (exit ${exit}).`];
  const stderr = result.stderr.trim();
  const stdout = result.stdout.trim();
  if (stderr.length > 0) {
    lines.push(`stderr:\n${clip(stderr)}`);
  }
  if (stdout.length > 0) {
    lines.push(`stdout:\n${clip(stdout)}`);
  }
  lines.push('Fix the reported problem in the workspace before doing the task.');
  return `<pre-run-failure>\n${lines.join('\n')}\n</pre-run-failure>`;
}

export function preOutputNote(stdout: string): string | undefined {
  const text = stdout.trim();
  if (text.length === 0) {
    return undefined;
  }
  return `<pre-run-output>\n${clip(text)}\n</pre-run-output>`;
}

function passed(pre: TriggerPre, result: ScriptResultFacts): TriggerScriptOutcome {
  if (!pre.injectStdout) {
    return { kind: 'run' };
  }
  const note = preOutputNote(result.stdout);
  return note === undefined ? { kind: 'run' } : { kind: 'run', note };
}

function failure(
  pre: TriggerPre,
  reason: PreScriptSkipReason,
  status: HookRunStatus,
  result: ScriptResultFacts,
): TriggerScriptOutcome {
  if (pre.onError === 'ignore') {
    return { kind: 'run' };
  }
  if (pre.onError === 'run-with-note') {
    return { kind: 'run', note: preFailureNote(result) };
  }
  return { kind: 'skip', reason, status };
}

function parseJson(stdout: string): unknown {
  const text = stdout.trim();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function valueAtPath(root: unknown, path: string): { value: unknown } | null {
  const segments = path.split('.').filter((segment) => segment.length > 0);
  let current: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return null;
      }
      current = current[index];
      continue;
    }
    if (current === null || typeof current !== 'object') {
      return null;
    }
    const record = current as Record<string, unknown>;
    if (!Object.hasOwn(record, segment)) {
      return null;
    }
    current = record[segment];
  }
  return { value: current };
}

function jsonEquals(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function clip(text: string): string {
  return text.length <= OUTPUT_NOTE_MAX ? text : text.slice(0, OUTPUT_NOTE_MAX);
}
