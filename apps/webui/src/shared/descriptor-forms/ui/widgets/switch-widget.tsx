import { Switch } from '@/shared/ui/switch';
import { type FormWidgetProps, fieldControlId } from '../widget-registry';

/** Boolean field as an on/off switch instead of a checkbox. */
export function SwitchWidget({ field, value, disabled, onChange }: FormWidgetProps) {
  const displayed = value === undefined ? field.default : value;
  return (
    <div className="flex pt-1">
      <Switch
        id={fieldControlId(field.key)}
        checked={displayed === true || displayed === 'true'}
        disabled={disabled}
        onCheckedChange={(checked) => onChange(checked === true)}
        data-testid={fieldControlId(field.key)}
      />
    </div>
  );
}
