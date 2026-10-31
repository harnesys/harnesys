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
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;
type ToolOutputField = 'toolOutputMaxChars' | 'toolOutputHeadChars' | 'toolOutputTailChars';
const HINT_CLASS = 'text-[11px] text-muted-foreground leading-snug';
const FIELDS: {
  name: ToolOutputField;
  label: string;
  placeholder: string;
  description: string;
}[] = [
  {
    name: 'toolOutputMaxChars',
    label: 'Spill after (chars)',
    placeholder: String(DEFAULT_TOOL_OUTPUT_MAX_CHARS),
    description: 'Tool results longer than this are cut to head + tail. Blank = 30000 chars.',
  },
  {
    name: 'toolOutputHeadChars',
    label: 'Keep head',
    placeholder: String(DEFAULT_TOOL_OUTPUT_HEAD_CHARS),
    description: 'Characters kept from the start of a spilled result. Blank = 8000 chars.',
  },
  {
    name: 'toolOutputTailChars',
    label: 'Keep tail',
    placeholder: String(DEFAULT_TOOL_OUTPUT_TAIL_CHARS),
    description: 'Characters kept from the end of a spilled result. Blank = 8000 chars.',
  },
];
export function AgentToolOutputFields({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <FieldSet className="gap-2" data-testid={`${idPrefix}-tool-output-fields`}>
      <FieldLegend variant="label" className="text-muted-foreground text-xs">
        Tool output
      </FieldLegend>
      <FieldDescription className={HINT_CLASS}>
        Long tool results are cut to head + tail and the full text is written to a thread file, so
        the model can read it back with the file tools.
      </FieldDescription>
      <FieldGroup className="grid grid-cols-3 gap-2">
        {FIELDS.map((item) => (
          <Controller
            key={item.name}
            control={control}
            name={item.name}
            render={({ field, fieldState }) => (
              <Field className="gap-1.5" data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={`${idPrefix}-${item.name}`}>{item.label}</FieldLabel>
                <Input
                  id={`${idPrefix}-${item.name}`}
                  inputMode="numeric"
                  placeholder={item.placeholder}
                  aria-invalid={fieldState.invalid || undefined}
                  value={field.value}
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
                />
                <FieldDescription className={HINT_CLASS}>{item.description}</FieldDescription>
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        ))}
      </FieldGroup>
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
    </FieldSet>
  );
}
