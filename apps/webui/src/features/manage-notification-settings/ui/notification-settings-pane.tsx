import { useState } from 'react';
import {
  type ApprovalChimeScheme,
  getApprovalChimeScheme,
  isApprovalChimeMuted,
  previewApprovalChime,
  setApprovalChimeMuted,
  setApprovalChimeScheme,
} from '@/features/desk';
import { Button } from '@/shared/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { SettingsField, SettingsSection, SettingsToggle } from '@/shared/ui/settings-kit';

interface SchemeOption {
  value: ApprovalChimeScheme;
  label: string;
}

const schemeOptions: SchemeOption[] = [
  { value: 'chime', label: 'Chime' },
  { value: 'ding', label: 'Ding' },
  { value: 'alert', label: 'Alert' },
  { value: 'ping', label: 'Ping' },
];

export function NotificationSettingsPane() {
  const [muted, setMuted] = useState(isApprovalChimeMuted);
  const [scheme, setScheme] = useState(getApprovalChimeScheme);

  return (
    <div className="flex w-full flex-col gap-8" data-testid="notification-settings-pane">
      <SettingsSection
        label="Approval requests"
        description="Sound played when an agent pauses for your approval."
      >
        <SettingsToggle
          id="notification-approval-sound"
          label="Approval request sound"
          description="Play a short tone when an approval is requested."
          checked={!muted}
          onCheckedChange={(checked) => {
            setApprovalChimeMuted(!checked);
            setMuted(!checked);
          }}
          testId="notification-approval-sound"
        />
        <SettingsField
          label="Sound scheme"
          description="Tone pattern used for the approval request sound."
          htmlFor="notification-sound-scheme"
        >
          <Select
            items={schemeOptions}
            value={scheme}
            onValueChange={(next) => {
              if (isChimeScheme(next)) {
                setApprovalChimeScheme(next);
                setScheme(next);
              }
            }}
          >
            <SelectTrigger id="notification-sound-scheme" size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="start" className="w-full">
              {schemeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsField
          label="Test sound"
          description="Play the selected scheme now, even when muted."
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={previewApprovalChime}
            data-testid="notification-sound-test"
          >
            Test sound
          </Button>
        </SettingsField>
      </SettingsSection>
    </div>
  );
}

function isChimeScheme(value: string | null): value is ApprovalChimeScheme {
  return value === 'chime' || value === 'ding' || value === 'alert' || value === 'ping';
}
