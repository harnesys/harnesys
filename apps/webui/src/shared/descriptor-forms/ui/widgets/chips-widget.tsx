import { Input } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';
import { parseCommaList, serializeCommaList } from '../../model/comma-list';
import { type FormWidgetProps, fieldControlId } from '../widget-registry';
import { useFieldOptions } from './use-field-options';

/**
 * Selectable toggle chips for a multi-valued option field. The value stays a
 * comma-separated string, so the stored config and the text fallback match.
 * Tokens outside the option list are preserved; without options the widget
 * degrades to a plain input.
 */
export function ChipsWidget({ field, value, disabled, onChange, values, addon }: FormWidgetProps) {
  const { options } = useFieldOptions(field, values, addon);
  const selected = new Set(parseCommaList(value));
  if (options.length === 0) {
    return (
      <Input
        id={fieldControlId(field.key)}
        placeholder={field.placeholder}
        disabled={disabled}
        value={typeof value === 'string' ? value : ''}
        onChange={(event) => onChange(event.target.value)}
        data-testid={fieldControlId(field.key)}
      />
    );
  }
  const toggle = (optionValue: string): void => {
    const next = new Set(selected);
    if (next.has(optionValue)) {
      next.delete(optionValue);
    } else {
      next.add(optionValue);
    }
    const known = options.filter((option) => next.has(option.value)).map((option) => option.value);
    const optionValues = new Set(options.map((option) => option.value));
    const unknown = parseCommaList(value).filter((item) => !optionValues.has(item));
    onChange(serializeCommaList([...known, ...unknown]));
  };
  return (
    <fieldset
      id={fieldControlId(field.key)}
      aria-label={field.label}
      className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
      data-testid={fieldControlId(field.key)}
    >
      {options.map((option) => (
        <Toggle
          key={option.value}
          variant="outline"
          size="sm"
          className="rounded-full"
          pressed={selected.has(option.value)}
          disabled={disabled}
          onPressedChange={() => toggle(option.value)}
          data-testid={`${fieldControlId(field.key)}-${option.value}`}
        >
          {option.label}
        </Toggle>
      ))}
    </fieldset>
  );
}
