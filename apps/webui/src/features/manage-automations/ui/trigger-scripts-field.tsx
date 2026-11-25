import {
  hasTriggerScripts,
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

export function validateTriggerScripts(scripts: TriggerScripts): string | null {
  if (!hasTriggerScripts(scripts)) {
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
  const parsed = TriggerScriptsSchema.safeParse(scripts);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'The scripts are invalid.');
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
      <StageShell
        title="Before the run"
        description="Prepare the workspace, or decide whether the run should start at all."
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
      </StageShell>
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
