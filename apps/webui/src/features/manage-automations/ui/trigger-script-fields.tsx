import type { TriggerGate, TriggerScript, TriggerScriptShell } from '@harnesys/contracts';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';

const SHELLS: Array<{ value: TriggerScriptShell; label: string }> = [
  { value: 'bash', label: 'bash' },
  { value: 'zsh', label: 'zsh' },
  { value: 'sh', label: 'sh' },
  { value: 'powershell', label: 'powershell' },
];

type GateKind = 'none' | 'stdout-contains' | 'stdout-regex' | 'json-truthy' | 'exit-code';

const GATES: Array<{ value: GateKind; label: string }> = [
  { value: 'none', label: 'Always run' },
  { value: 'stdout-contains', label: 'Output contains' },
  { value: 'stdout-regex', label: 'Output matches regex' },
  { value: 'json-truthy', label: 'JSON field is truthy' },
  { value: 'exit-code', label: 'Exit code is one of' },
];

export function ScriptEditor({
  idPrefix,
  script,
  onChange,
}: {
  idPrefix: string;
  script: TriggerScript;
  onChange: (script: TriggerScript) => void;
}) {
  return (
    <>
      <Field>
        <FieldLabel htmlFor={`${idPrefix}-command`}>Command</FieldLabel>
        <Textarea
          id={`${idPrefix}-command`}
          value={script.command}
          onChange={(event) => onChange({ ...script, command: event.target.value })}
          placeholder="git pull --ff-only"
          className="min-h-16 font-mono text-xs"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-shell`}>Shell</FieldLabel>
          <Select
            value={script.shell}
            onValueChange={(next) => {
              if (typeof next === 'string') {
                onChange({ ...script, shell: next as TriggerScriptShell });
              }
            }}
          >
            <SelectTrigger id={`${idPrefix}-shell`} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {SHELLS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-timeout`}>Timeout (seconds)</FieldLabel>
          <Input
            id={`${idPrefix}-timeout`}
            type="number"
            min={1}
            max={600}
            value={script.timeoutS}
            onChange={(event) => onChange({ ...script, timeoutS: timeoutOf(event.target.value) })}
          />
        </Field>
      </div>
    </>
  );
}

export function GateEditor({
  gate,
  onChange,
  label = 'Run condition',
  emptyLabel = 'Always run',
}: {
  gate: TriggerGate | undefined;
  onChange: (gate: TriggerGate | undefined) => void;
  label?: string;
  emptyLabel?: string;
}) {
  const kind = gateKindOf(gate);
  return (
    <Field>
      <FieldLabel htmlFor="trigger-script-gate">{label}</FieldLabel>
      <Select
        value={kind}
        onValueChange={(next) => {
          if (typeof next === 'string') {
            onChange(gateOfKind(next as GateKind, gate));
          }
        }}
      >
        <SelectTrigger id="trigger-script-gate" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {GATES.map((item) => (
              <SelectItem key={item.value} value={item.value}>
                {item.value === 'none' ? emptyLabel : item.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
      {kind === 'stdout-contains' || kind === 'stdout-regex' ? (
        <Input
          value={gate?.on === 'stdout' ? gate.value : ''}
          onChange={(event) => {
            if (gate?.on === 'stdout') {
              onChange({ ...gate, value: event.target.value });
            }
          }}
          placeholder="CHANGES"
          className="font-mono text-xs"
        />
      ) : null}
      {kind === 'json-truthy' ? (
        <Input
          value={gate?.on === 'json' ? gate.path : ''}
          onChange={(event) => {
            if (gate?.on === 'json') {
              onChange({ ...gate, path: event.target.value });
            }
          }}
          placeholder="result.ready"
          className="font-mono text-xs"
        />
      ) : null}
      {kind === 'exit-code' ? (
        <Input
          value={gate?.on === 'exit-code' ? gate.pass.join(', ') : '0'}
          onChange={(event) => {
            if (gate?.on === 'exit-code') {
              onChange({ ...gate, pass: exitCodesOf(event.target.value) });
            }
          }}
          placeholder="0, 3"
          className="font-mono text-xs"
        />
      ) : null}
      <FieldDescription>
        The run starts only when the command succeeds and this condition holds.
      </FieldDescription>
    </Field>
  );
}

function timeoutOf(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return 30;
  }
  return Math.min(600, Math.max(1, parsed));
}

function exitCodesOf(value: string): number[] {
  const codes = value
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((code) => Number.isInteger(code) && code >= 0 && code <= 255);
  return codes.length > 0 ? [...new Set(codes)] : [0];
}

function gateKindOf(gate: TriggerGate | undefined): GateKind {
  if (gate === undefined) {
    return 'none';
  }
  if (gate.on === 'exit-code') {
    return 'exit-code';
  }
  if (gate.on === 'json') {
    return 'json-truthy';
  }
  return gate.match === 'regex' ? 'stdout-regex' : 'stdout-contains';
}

function gateOfKind(kind: GateKind, current: TriggerGate | undefined): TriggerGate | undefined {
  if (kind === 'none') {
    return undefined;
  }
  if (kind === 'exit-code') {
    return { on: 'exit-code', pass: current?.on === 'exit-code' ? current.pass : [0] };
  }
  if (kind === 'json-truthy') {
    return { on: 'json', path: current?.on === 'json' ? current.path : '', op: 'truthy' };
  }
  return {
    on: 'stdout',
    match: kind === 'stdout-regex' ? 'regex' : 'contains',
    value: current?.on === 'stdout' ? current.value : '',
  };
}
