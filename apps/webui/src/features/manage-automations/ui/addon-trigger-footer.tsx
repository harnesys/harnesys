import { PauseIcon, PlayIcon } from 'lucide-react';
import type { ClientAutomation } from '@/entities/automation';
import { Button } from '@/shared/ui/button';
import { DialogFooter } from '@/shared/ui/dialog';

export interface AddonTriggerFooterProps {
  automation: ClientAutomation | null;
  installed: boolean;
  active: boolean;
  canSave: boolean;
  onRemove: () => void;
  onToggle: () => void;
  onCancel: () => void;
  onSave: () => void;
}

export function AddonTriggerFooter({
  automation,
  installed,
  active,
  canSave,
  onRemove,
  onToggle,
  onCancel,
  onSave,
}: AddonTriggerFooterProps) {
  return (
    <DialogFooter>
      {automation ? (
        <Button
          type="button"
          variant="ghost"
          className="mr-auto text-destructive hover:text-destructive"
          onClick={onRemove}
          disabled={!installed}
        >
          Delete
        </Button>
      ) : null}
      {automation ? (
        <Button
          type="button"
          variant="outline"
          onClick={onToggle}
          disabled={!installed}
          data-testid="addon-trigger-toggle-status"
        >
          {active ? <PauseIcon /> : <PlayIcon />}
          {active ? 'Pause' : 'Resume'}
        </Button>
      ) : null}
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="button" onClick={onSave} disabled={!canSave}>
        {automation ? 'Save' : 'Create automation'}
      </Button>
    </DialogFooter>
  );
}
