import { Volume2Icon, VolumeXIcon } from 'lucide-react';
import { useState } from 'react';
import { getActiveOrgId } from '@/shared/api/active-org';
import { getAutoRead, setAutoRead } from '@/shared/api/voice-prefs';
import { InputGroupButton } from '@/shared/ui/input-group';

export function AutoReadButton() {
  const [on, setOn] = useState(() => {
    const orgId = getActiveOrgId();
    return orgId !== null && getAutoRead(orgId);
  });
  const toggle = () => {
    const orgId = getActiveOrgId();
    if (!orgId) {
      return;
    }
    const next = !on;
    setAutoRead(orgId, next);
    setOn(next);
  };
  const Icon = on ? Volume2Icon : VolumeXIcon;
  return (
    <InputGroupButton
      size="icon-xs"
      variant="ghost"
      className={on ? 'text-primary' : undefined}
      onClick={toggle}
      aria-label="Auto-read replies"
      aria-pressed={on}
      title="Auto-read replies"
    >
      <Icon />
      <span className="sr-only">Auto-read replies</span>
    </InputGroupButton>
  );
}
