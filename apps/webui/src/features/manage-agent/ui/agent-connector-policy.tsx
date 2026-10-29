import type { MirrorPolicyPublic } from '@harnesys/contracts';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Switch } from '@/shared/ui/switch';

const POLICY_ROWS: ReadonlyArray<{ key: keyof MirrorPolicyPublic; label: string }> = [
  { key: 'text', label: 'Assistant text' },
  { key: 'ask', label: 'Questions and approvals' },
  { key: 'failures', label: 'Failures' },
  { key: 'files', label: 'Files' },
  { key: 'appUserEcho', label: 'Messages typed in Harnesys' },
];

export function AgentConnectorPolicy({
  policy,
  disabled,
  onChange,
}: {
  policy: MirrorPolicyPublic;
  disabled?: boolean;
  onChange: (next: MirrorPolicyPublic) => void;
}) {
  return (
    <div className="flex flex-col gap-1" data-testid="agent-connector-policy">
      {POLICY_ROWS.map((row) => (
        <Field
          key={row.key}
          orientation="horizontal"
          className="rounded-md px-2 py-2 hover:bg-muted/60"
        >
          <FieldLabel htmlFor={`connector-policy-${row.key}`} className="flex-1 font-normal">
            {row.label}
          </FieldLabel>
          <Switch
            id={`connector-policy-${row.key}`}
            checked={policy[row.key]}
            disabled={disabled}
            onCheckedChange={(checked) => {
              onChange({ ...policy, [row.key]: checked });
            }}
          />
        </Field>
      ))}
    </div>
  );
}
