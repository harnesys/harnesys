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
const HINT_CLASS = 'text-[11px] text-muted-foreground leading-snug';
type BudgetField = 'budgetMaxSteps' | 'budgetMaxTokens' | 'budgetDeadlineSec' | 'budgetUsdDaily';
type BudgetKnobField = 'budgetWarnAtSteps' | 'budgetExtendPercent';
const FIELDS: {
  name: BudgetField;
  label: string;
  description: string;
}[] = [
  {
    name: 'budgetMaxSteps',
    label: 'Max steps',
    description: 'Hard cap on turns in a single run. Blank = no cap.',
  },
  {
    name: 'budgetMaxTokens',
    label: 'Max tokens',
    description: 'Token cap for a single run, input and output combined. Blank = no cap.',
  },
  {
    name: 'budgetDeadlineSec',
    label: 'Deadline, sec',
    description: 'Wall-clock limit for a single run. Blank = no deadline.',
  },
  {
    name: 'budgetUsdDaily',
    label: 'Daily USD',
    description: 'Spending cap per day for this agent. Blank = no cap.',
  },
];
const KNOBS: {
  name: BudgetKnobField;
  label: string;
  placeholder: string;
  description: string;
}[] = [
  {
    name: 'budgetWarnAtSteps',
    label: 'Warn at steps left',
    placeholder: '3',
    description: 'Notify the user when this many steps remain. Blank = no warning.',
  },
  {
    name: 'budgetExtendPercent',
    label: 'Extend by, %',
    placeholder: '25',
    description: 'Extend the budget by this percent when the user approves. Blank = no extension.',
  },
];
function BudgetInput({
  control,
  name,
  label,
  description,
  placeholder,
  idPrefix,
  onCommit,
}: {
  control: AgentFieldsControl;
  name: BudgetField | BudgetKnobField;
  label: string;
  description: string;
  placeholder?: string;
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
    <>
      <FieldSet className="gap-2.5" data-testid={`${idPrefix}-budget-fields`}>
        <FieldLegend variant="label" className="text-muted-foreground text-xs">
          Single run
        </FieldLegend>
        <FieldGroup className="grid grid-cols-2 gap-2.5">
          {FIELDS.map((item) => (
            <BudgetInput
              key={item.name}
              control={control}
              name={item.name}
              label={item.label}
              description={item.description}
              idPrefix={idPrefix}
              onCommit={onCommit}
            />
          ))}
        </FieldGroup>
      </FieldSet>
      <FieldSet className="gap-2.5">
        <FieldLegend variant="label" className="text-muted-foreground text-xs">
          On limit
        </FieldLegend>
        <Controller
          control={control}
          name="budgetPolicy"
          render={({ field }) => (
            <Field className="gap-1.5">
              <FieldLabel>When a limit is hit</FieldLabel>
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
              <FieldDescription className={HINT_CLASS}>
                Ask pauses the run and requests approval to continue; Error fails the run
                immediately.
              </FieldDescription>
            </Field>
          )}
        />
        <FieldGroup className="grid grid-cols-2 gap-2.5">
          {KNOBS.map((item) => (
            <BudgetInput
              key={item.name}
              control={control}
              name={item.name}
              label={item.label}
              placeholder={item.placeholder}
              description={item.description}
              idPrefix={idPrefix}
              onCommit={onCommit}
            />
          ))}
          <Controller
            control={control}
            name="budgetCloseOnExhaustion"
            render={({ field }) => (
              <Field className="gap-1.5">
                <FieldLabel>On exhaustion</FieldLabel>
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
                <FieldDescription className={HINT_CLASS}>
                  Report closes the run with a final summary; Park leaves it waiting.
                </FieldDescription>
              </Field>
            )}
          />
          <Controller
            control={control}
            name="budgetSpawnMode"
            render={({ field }) => (
              <Field className="gap-1.5">
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
                <FieldDescription className={HINT_CLASS}>
                  Shared pools one budget across all subagents; Inherit gives each child its own
                  full budget.
                </FieldDescription>
              </Field>
            )}
          />
        </FieldGroup>
      </FieldSet>
    </>
  );
}
