import {
  hasTriggerScripts,
  type TriggerAgentMode,
  type TriggerPostWhen,
  type TriggerPreOnError,
  type TriggerScripts,
  TriggerScriptsSchema,
} from '@harnesys/contracts';
import type { ReactNode } from 'react';
import { Checkbox } from '@/shared/ui/checkbox';
import { Field, FieldDescription, FieldLabel } from '@/shared/ui/field';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { Switch } from '@/shared/ui/switch';
import { GateEditor, ScriptEditor } from './trigger-script-fields';
import { ScriptTestRow } from './trigger-script-test-row';

const PRE_ERRORS: Array<{ value: TriggerPreOnError; label: string }> = [
  { value: 'skip-run', label: 'Skip the run' },
  { value: 'run-with-note', label: 'Run and tell the agent' },
  { value: 'ignore', label: 'Ignore the failure' },
];

const POST_WHEN: Array<{ value: TriggerPostWhen; label: string }> = [
  { value: 'always', label: 'Always' },
  { value: 'success', label: 'After a successful run' },
  { value: 'failure', label: 'After a failed run' },
];

const AGENT_MODES: Array<{ value: TriggerAgentMode; label: string }> = [
  { value: 'always', label: 'On every fire' },
  { value: 'conditional', label: 'Only when the script signals' },
  { value: 'never', label: 'Never (scripts only)' },
];

const MODE_HELP: Record<TriggerAgentMode, string> = {
  always: 'Every fire starts an agent run; the scripts below wrap it.',
  conditional:
    'The before-run script is the job. The agent starts only when an escalation rule matches.',
  never: 'The before-run script is the whole job. No agent run starts.',
};

export function validateTriggerScripts(scripts: TriggerScripts): string | null {
  if (!hasTriggerScripts(scripts) && scripts.agent === 'always') {
    return null;
  }
  if (!scripts.acknowledged) {
    return 'Confirm that the scripts run on this host.';
  }
  if (scripts.pre !== undefined && scripts.pre.script.command.trim().length === 0) {
    return 'The pre-run command is required.';
  }
  if (scripts.post !== undefined && scripts.post.script.command.trim().length === 0) {
    return 'The post-run command is required.';
  }
  if (scripts.pre?.gate?.on === 'stdout' && scripts.pre.gate.value.trim().length === 0) {
    return 'The pre-run condition needs a value.';
  }
  if (scripts.pre?.gate?.on === 'json' && scripts.pre.gate.path.trim().length === 0) {
    return 'The pre-run condition needs a JSON path.';
  }
  if (scripts.agent !== 'always' && scripts.pre === undefined) {
    return 'A script is required when the agent does not run on every fire.';
  }
  if (scripts.agent === 'conditional' && !hasEscalation(scripts)) {
    return 'Choose when the agent should start.';
  }
  if (scripts.escalate?.gate?.on === 'stdout' && scripts.escalate.gate.value.trim().length === 0) {
    return 'The escalation condition needs a value.';
  }
  if (scripts.escalate?.gate?.on === 'json' && scripts.escalate.gate.path.trim().length === 0) {
    return 'The escalation condition needs a JSON path.';
  }
  const parsed = TriggerScriptsSchema.safeParse(scripts);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'The scripts are invalid.');
}

function hasEscalation(scripts: TriggerScripts): boolean {
  return (
    scripts.escalate !== undefined &&
    (scripts.escalate.onFailure || scripts.escalate.gate !== undefined)
  );
}

export function TriggerScriptsField({
  orgId,
  addonId,
  instanceId,
  scripts,
  title,
  description,
  onChange,
}: {
  orgId: string;
  addonId: string;
  instanceId: string | undefined;
  scripts: TriggerScripts;
  title?: string;
  description?: string;
  onChange: (scripts: TriggerScripts) => void;
}) {
  const pre = scripts.pre;
  const post = scripts.post;
  const mode = scripts.agent;
  const setMode = (next: TriggerAgentMode) => {
    const draft: TriggerScripts = {
      ...scripts,
      agent: next,
      escalate: next === 'conditional' ? (scripts.escalate ?? { onFailure: true }) : undefined,
    };
    if (next !== 'always' && draft.pre === undefined) {
      draft.pre = {
        script: defaultScript(),
        onError: 'skip-run',
        injectStdout: false,
        onWorkspaceMissing: 'skip-run',
      };
    }
    onChange(draft);
  };
  return (
    <div className="flex flex-col gap-3 border-border/40 border-t pt-3">
      <div className="flex flex-col gap-0.5">
        <p className="font-medium text-[11px] text-muted-foreground uppercase tracking-wide">
          {title ?? 'Scripts'}
        </p>
        <p className="text-muted-foreground text-xs">
          {description ??
            'Shell commands around the run. They execute on this host (not inside the run container) with the folder selected above as their working directory.'}
        </p>
      </div>
      <Field>
        <FieldLabel htmlFor="trigger-script-agent-mode">Run the agent</FieldLabel>
        <Select
          value={mode}
          onValueChange={(next) => {
            if (typeof next === 'string') {
              setMode(next as TriggerAgentMode);
            }
          }}
        >
          <SelectTrigger id="trigger-script-agent-mode" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {AGENT_MODES.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <FieldDescription>{MODE_HELP[mode]}</FieldDescription>
      </Field>
      <StageShell
        title={mode === 'always' ? 'Before the run' : 'The job script'}
        description={
          mode === 'always'
            ? 'Prepare the workspace, or decide whether the run should start at all.'
            : 'Runs on every fire. Its exit code and output decide what happens next.'
        }
        checked={pre !== undefined}
        onToggle={(next) =>
          onChange({
            ...scripts,
            pre: next
              ? {
                  script: defaultScript(),
                  onError: 'skip-run',
                  injectStdout: false,
                  onWorkspaceMissing: 'skip-run',
                }
              : undefined,
          })
        }
      >
        {pre === undefined ? null : (
          <>
            <ScriptEditor
              idPrefix="trigger-script-pre"
              script={pre.script}
              onChange={(script) => onChange({ ...scripts, pre: { ...pre, script } })}
            />
            {mode !== 'always' ? null : (
              <>
                <Field>
                  <FieldLabel htmlFor="trigger-script-pre-on-error">If it fails</FieldLabel>
                  <Select
                    value={pre.onError}
                    onValueChange={(next) => {
                      if (typeof next === 'string') {
                        onChange({
                          ...scripts,
                          pre: { ...pre, onError: next as TriggerPreOnError },
                        });
                      }
                    }}
                  >
                    <SelectTrigger id="trigger-script-pre-on-error" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {PRE_ERRORS.map((item) => (
                          <SelectItem key={item.value} value={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </Field>
                <GateEditor
                  gate={pre.gate}
                  onChange={(gate) => onChange({ ...scripts, pre: { ...pre, gate } })}
                />
                <div className="flex items-start gap-2 text-xs">
                  <Checkbox
                    className="mt-0.5"
                    aria-label="Add the command output to the agent prompt"
                    checked={pre.injectStdout}
                    onCheckedChange={(next) =>
                      onChange({ ...scripts, pre: { ...pre, injectStdout: Boolean(next) } })
                    }
                  />
                  <span>Add the command output to the agent prompt.</span>
                </div>
                <ScriptTestRow
                  orgId={orgId}
                  addonId={addonId}
                  instanceId={instanceId}
                  script={pre.script}
                  gate={pre.gate}
                />
              </>
            )}
            {mode === 'never' ? (
              <ScriptTestRow
                orgId={orgId}
                addonId={addonId}
                instanceId={instanceId}
                script={pre.script}
              />
            ) : null}
          </>
        )}
      </StageShell>
      {mode !== 'conditional' ? null : (
        <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-sm">Start the agent when</p>
            <p className="text-muted-foreground text-xs leading-4">
              The agent run receives the script output together with the instructions of this
              trigger.
            </p>
          </div>
          <div className="flex items-start gap-2 text-xs">
            <Checkbox
              className="mt-0.5"
              aria-label="Start the agent when the script fails"
              checked={scripts.escalate?.onFailure ?? true}
              onCheckedChange={(next) =>
                onChange({
                  ...scripts,
                  escalate: {
                    ...(scripts.escalate ?? { onFailure: false, gate: undefined }),
                    onFailure: Boolean(next),
                  },
                })
              }
            />
            <span>The script fails or times out.</span>
          </div>
          <GateEditor
            label="Escalation condition"
            emptyLabel="No extra condition"
            gate={scripts.escalate?.gate}
            onChange={(gate) =>
              onChange({
                ...scripts,
                escalate: { ...(scripts.escalate ?? { onFailure: true }), gate },
              })
            }
          />
          <ScriptTestRow
            orgId={orgId}
            addonId={addonId}
            instanceId={instanceId}
            script={pre?.script ?? defaultScript()}
            gate={scripts.escalate?.gate}
          />
        </div>
      )}
      <StageShell
        title="After the run"
        description="React to the result: notify, clean up, write a report."
        checked={post !== undefined}
        onToggle={(next) =>
          onChange({
            ...scripts,
            post: next ? { script: defaultScript(), when: 'always' } : undefined,
          })
        }
      >
        {post === undefined ? null : (
          <>
            <ScriptEditor
              idPrefix="trigger-script-post"
              script={post.script}
              onChange={(script) => onChange({ ...scripts, post: { ...post, script } })}
            />
            <Field>
              <FieldLabel htmlFor="trigger-script-post-when">Run after</FieldLabel>
              <Select
                value={post.when}
                onValueChange={(next) => {
                  if (typeof next === 'string') {
                    onChange({
                      ...scripts,
                      post: { ...post, when: next as TriggerPostWhen },
                    });
                  }
                }}
              >
                <SelectTrigger id="trigger-script-post-when" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {POST_WHEN.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldDescription>
                The post script never changes the run result; its own failure is recorded
                separately.
              </FieldDescription>
            </Field>
          </>
        )}
      </StageShell>
      {hasTriggerScripts(scripts) ? (
        <div className="flex items-start gap-2 rounded-md bg-muted/40 p-2 text-xs">
          <Checkbox
            className="mt-0.5"
            aria-label="Confirm that the scripts run on this host"
            checked={scripts.acknowledged}
            onCheckedChange={(next) => onChange({ ...scripts, acknowledged: Boolean(next) })}
          />
          <span>
            I understand these commands run on this host with my user permissions, in the folder
            selected above.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function StageShell({
  title,
  description,
  checked,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <p className="font-medium text-sm">{title}</p>
          <p className="text-muted-foreground text-xs leading-4">{description}</p>
        </div>
        <Switch
          size="sm"
          checked={checked}
          aria-label={title}
          onCheckedChange={(next) => onToggle(Boolean(next))}
        />
      </div>
      {checked ? children : null}
    </div>
  );
}

function defaultScript() {
  return { command: '', shell: 'bash' as const, timeoutS: 30 };
}
