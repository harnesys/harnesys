import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';

export function OnboardingField({
  id,
  label,
  hint,
  value,
  onChange,
  placeholder,
  testId,
  type,
  autoComplete,
  autoFocus,
}: {
  id: string;
  label: string;
  hint: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  testId: string;
  type?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type={type}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        data-testid={testId}
      />
      <p className="text-muted-foreground text-xs">{hint}</p>
    </div>
  );
}
