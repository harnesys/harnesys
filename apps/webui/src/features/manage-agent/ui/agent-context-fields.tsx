import { type Control, Controller } from 'react-hook-form';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { type AgentFieldsInput, type AgentFieldsOutput } from '../model/agent-fields';
import { AgentToolOutputFields } from './agent-tool-output-fields';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;
const HINT_CLASS = 'text-[11px] text-muted-foreground leading-snug';
function ContextTuningToggle({
  control,
  name,
  label,
  description,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  name: 'ctxUsageAnchor';
  label: string;
  description: string;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-${name}`}>{label}</FieldLabel>
          <ToggleGroup
            variant="segment"
            value={[field.value ? 'on' : 'off']}
            onValueChange={(value) => {
              field.onChange(value[0] === 'on');
              onCommit?.();
            }}
          >
            <ToggleGroupItem value="off">Off</ToggleGroupItem>
            <ToggleGroupItem value="on">On</ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription className={HINT_CLASS}>{description}</FieldDescription>
        </Field>
      )}
    />
  );
}
function ContextTuningNumber({
  control,
  name,
  label,
  description,
  placeholder,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  name:
    | 'providerRetryAttempts'
    | 'ctxLengthCutContinuations'
    | 'ctxSpawnHeadChars'
    | 'ctxSpawnTailChars';
  label: string;
  description: string;
  placeholder: string;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={`${idPrefix}-${name}`}>{label}</FieldLabel>
          <Input
            id={`${idPrefix}-${name}`}
            inputMode="numeric"
            placeholder={placeholder}
            aria-invalid={fieldState.invalid || undefined}
            value={typeof field.value === 'string' ? field.value : ''}
            onChange={field.onChange}
            onBlur={() => {
              field.onBlur();
              onCommit?.();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.currentTarget.blur();
              }
            }}
            name={field.name}
            ref={field.ref}
          />
          <FieldDescription className={HINT_CLASS}>{description}</FieldDescription>
          {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
        </Field>
      )}
    />
  );
}
export function AgentContextTuningFields({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <FieldSet className="gap-2.5">
        <FieldLegend variant="label" className="text-muted-foreground text-xs">
          Context tuning
        </FieldLegend>
        <FieldGroup className="gap-2.5">
          <ContextTuningToggle
            control={control}
            name="ctxUsageAnchor"
            label="Anchor estimates on measured usage"
            description="Estimate context from the provider's measured token usage instead of text alone. Turn off when usage reporting is unreliable."
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <ContextTuningNumber
              control={control}
              name="ctxLengthCutContinuations"
              label="Length-cut continuations (0 = off)"
              description="Retries with a continuation message when output is cut by the token limit. 0 stops immediately. Default 2."
              placeholder="2"
              idPrefix={idPrefix}
              onCommit={onCommit}
            />
            <ContextTuningNumber
              control={control}
              name="providerRetryAttempts"
              label="Provider retry attempts"
              description="Retries for transient provider errors (429, 5xx). 1 = no retries; blank = the full backoff schedule (6)."
              placeholder="6"
              idPrefix={idPrefix}
              onCommit={onCommit}
            />
            <ContextTuningNumber
              control={control}
              name="ctxSpawnHeadChars"
              label="Spawn result head, chars (0 = unlimited)"
              description="Characters of each subagent result kept from the start. 0 = unlimited. Default 12000. The full result is saved to a thread file."
              placeholder="12000"
              idPrefix={idPrefix}
              onCommit={onCommit}
            />
            <ContextTuningNumber
              control={control}
              name="ctxSpawnTailChars"
              label="Spawn result tail, chars"
              description="Characters of each subagent result kept from the end. Default 4000. The full result is saved to a thread file."
              placeholder="4000"
              idPrefix={idPrefix}
              onCommit={onCommit}
            />
          </div>
        </FieldGroup>
      </FieldSet>
      <AgentToolOutputFields control={control} idPrefix={idPrefix} onCommit={onCommit} />
    </div>
  );
}
