import {
  DEFAULT_TOOL_OUTPUT_HEAD_CHARS,
  DEFAULT_TOOL_OUTPUT_MAX_CHARS,
  DEFAULT_TOOL_OUTPUT_TAIL_CHARS,
} from '@harnesys/studio-shared';
import { type Control, Controller } from 'react-hook-form';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import { type AgentFieldsInput, type AgentFieldsOutput } from '../model/agent-fields';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;
const HINT_CLASS = 'text-[11px] text-muted-foreground leading-snug';
type ContextNumberField =
  | 'ctxLengthCutContinuations'
  | 'providerRetryAttempts'
  | 'ctxSpawnHeadChars'
  | 'ctxSpawnTailChars'
  | 'toolOutputMaxChars'
  | 'toolOutputHeadChars'
  | 'toolOutputTailChars';
function ContextNumber({
  control,
  name,
  label,
  description,
  placeholder,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  name: ContextNumberField;
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
function UsageAnchorToggle({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <Controller
      control={control}
      name="ctxUsageAnchor"
      render={({ field }) => (
        <Field>
          <FieldLabel htmlFor={`${idPrefix}-ctxUsageAnchor`}>
            Anchor estimates on measured usage
          </FieldLabel>
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
          <FieldDescription className={HINT_CLASS}>
            Estimate context from the provider's measured token usage instead of text alone. Turn
            off when usage reporting is unreliable.
          </FieldDescription>
        </Field>
      )}
    />
  );
}
function RedactSecretsToggle({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <Controller
      control={control}
      name="toolOutputRedactSecrets"
      render={({ field }) => (
        <Field className="gap-1.5">
          <FieldLabel htmlFor={`${idPrefix}-toolOutputRedactSecrets`}>
            Redact secrets in spilled output
          </FieldLabel>
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
          <FieldDescription className={HINT_CLASS}>
            Masks known secret values before the result is cut and written to the file.
          </FieldDescription>
        </Field>
      )}
    />
  );
}
export function AgentContextFields({
  control,
  idPrefix = 'agent',
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix?: string;
  onCommit?: () => void;
}) {
  return (
    <>
      <FieldSet className="gap-2.5">
        <FieldLegend variant="label" className="text-muted-foreground text-xs">
          Spawn results
        </FieldLegend>
        <div className="grid grid-cols-2 gap-2.5">
          <ContextNumber
            control={control}
            name="ctxSpawnHeadChars"
            label="Keep head, chars (0 = unlimited)"
            description="Characters of each subagent result kept from the start. 0 = unlimited. Default 12000. The full result is saved to a thread file."
            placeholder="12000"
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
          <ContextNumber
            control={control}
            name="ctxSpawnTailChars"
            label="Keep tail, chars"
            description="Characters of each subagent result kept from the end. Default 4000. The full result is saved to a thread file."
            placeholder="4000"
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
        </div>
      </FieldSet>
      <FieldSet className="gap-2.5" data-testid={`${idPrefix}-tool-output-fields`}>
        <FieldLegend variant="label" className="text-muted-foreground text-xs">
          Tool output
        </FieldLegend>
        <FieldDescription className={HINT_CLASS}>
          Long tool results are cut to head + tail and the full text is written to a thread file;
          the model reads it back only when it needs the omitted middle.
        </FieldDescription>
        <div className="grid grid-cols-2 gap-2.5">
          <ContextNumber
            control={control}
            name="toolOutputMaxChars"
            label="Spill after (chars)"
            description="Tool results longer than this are cut to head + tail. Blank = 30000 chars."
            placeholder={String(DEFAULT_TOOL_OUTPUT_MAX_CHARS)}
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
          <ContextNumber
            control={control}
            name="toolOutputHeadChars"
            label="Keep head"
            description="Characters kept from the start of a spilled result. Blank = 8000 chars."
            placeholder={String(DEFAULT_TOOL_OUTPUT_HEAD_CHARS)}
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
          <ContextNumber
            control={control}
            name="toolOutputTailChars"
            label="Keep tail"
            description="Characters kept from the end of a spilled result. Blank = 8000 chars."
            placeholder={String(DEFAULT_TOOL_OUTPUT_TAIL_CHARS)}
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
        </div>
        <RedactSecretsToggle control={control} idPrefix={idPrefix} onCommit={onCommit} />
      </FieldSet>
      <FieldSet className="gap-2.5">
        <FieldLegend variant="label" className="text-muted-foreground text-xs">
          Estimation & retries
        </FieldLegend>
        <UsageAnchorToggle control={control} idPrefix={idPrefix} onCommit={onCommit} />
        <div className="grid grid-cols-2 gap-2.5">
          <ContextNumber
            control={control}
            name="ctxLengthCutContinuations"
            label="Length-cut continuations (0 = off)"
            description="Retries with a continuation message when output is cut by the token limit. 0 stops immediately. Default 2."
            placeholder="2"
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
          <ContextNumber
            control={control}
            name="providerRetryAttempts"
            label="Provider retry attempts"
            description="Retries for transient provider errors (429, 5xx). 1 = no retries; blank = the full backoff schedule (6)."
            placeholder="6"
            idPrefix={idPrefix}
            onCommit={onCommit}
          />
        </div>
      </FieldSet>
    </>
  );
}
