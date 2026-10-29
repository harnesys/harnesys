import { type Control, Controller } from 'react-hook-form';
import { Field, FieldError, FieldGroup, FieldLabel, FieldSet } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/shared/ui/toggle-group';
import type { AgentFieldsInput, AgentFieldsOutput } from '../model/agent-fields';

type AgentFieldsControl = Control<AgentFieldsInput, unknown, AgentFieldsOutput>;
type BudgetField = 'budgetMaxSteps' | 'budgetMaxTokens' | 'budgetDeadlineSec' | 'budgetUsdDaily';
type BudgetKnobField = 'budgetWarnAtSteps' | 'budgetExtendPercent';
const FIELDS: {
  name: BudgetField;
  label: string;
}[] = [
  { name: 'budgetMaxSteps', label: 'Max steps' },
  { name: 'budgetMaxTokens', label: 'Max tokens' },
  { name: 'budgetDeadlineSec', label: 'Deadline, sec' },
  { name: 'budgetUsdDaily', label: 'Daily USD' },
];
const KNOBS: {
  name: BudgetKnobField;
  label: string;
  placeholder: string;
}[] = [
  { name: 'budgetWarnAtSteps', label: 'Warn at steps left', placeholder: '3' },
  { name: 'budgetExtendPercent', label: 'Extend by, %', placeholder: '25' },
];
export function AgentBudgetFields({
  control,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  idPrefix: string;
  onCommit?: () => void;
}) {
  return (
    <FieldSet className="gap-2" data-testid={`${idPrefix}-budget-fields`}>
      <FieldGroup className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {FIELDS.map((item) => (
          <Controller
            key={item.name}
            control={control}
            name={item.name}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={`${idPrefix}-${item.name}`}>{item.label}</FieldLabel>
                <Input
                  id={`${idPrefix}-${item.name}`}
                  inputMode="numeric"
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
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        ))}
      </FieldGroup>
      <Controller
        control={control}
        name="budgetPolicy"
        render={({ field }) => (
          <Field>
            <FieldLabel>On limit</FieldLabel>
            <ToggleGroup
              variant="segment"
              value={[field.value]}
              onValueChange={(value) => {
                const next = value[0];
                if (next === 'ask' || next === 'error') {
                  field.onChange(next);
                }
              }}
            >
              <ToggleGroupItem value="ask">Ask</ToggleGroupItem>
              <ToggleGroupItem value="error">Error</ToggleGroupItem>
            </ToggleGroup>
          </Field>
        )}
      />
      <FieldGroup className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {KNOBS.map((item) => (
          <Controller
            key={item.name}
            control={control}
            name={item.name}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={`${idPrefix}-${item.name}`}>{item.label}</FieldLabel>
                <Input
                  id={`${idPrefix}-${item.name}`}
                  inputMode="numeric"
                  placeholder={item.placeholder}
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
                {fieldState.error ? <FieldError>{fieldState.error.message}</FieldError> : null}
              </Field>
            )}
          />
        ))}
        <Controller
          control={control}
          name="budgetCloseOnExhaustion"
          render={({ field }) => (
            <Field>
              <FieldLabel>Close on limit</FieldLabel>
              <ToggleGroup
                variant="segment"
                value={[field.value ? 'on' : 'off']}
                onValueChange={(value) => {
                  field.onChange(value[0] === 'on');
                }}
              >
                <ToggleGroupItem value="off">Park</ToggleGroupItem>
                <ToggleGroupItem value="on">Report</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
        <Controller
          control={control}
          name="budgetSpawnMode"
          render={({ field }) => (
            <Field>
              <FieldLabel>Children budget</FieldLabel>
              <ToggleGroup
                variant="segment"
                value={[field.value]}
                onValueChange={(value) => {
                  const next = value[0];
                  if (next === 'pool' || next === 'inherit') {
                    field.onChange(next);
                  }
                }}
              >
                <ToggleGroupItem value="pool">Shared</ToggleGroupItem>
                <ToggleGroupItem value="inherit">Inherit</ToggleGroupItem>
              </ToggleGroup>
            </Field>
          )}
        />
      </FieldGroup>
    </FieldSet>
  );
}
