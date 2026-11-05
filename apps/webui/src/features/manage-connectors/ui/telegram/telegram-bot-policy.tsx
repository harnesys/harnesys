import type { ConnectorPublic, MirrorPolicyPublic } from '@harnesys/contracts';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { SettingsSave, SettingsSection, SettingsToggle } from '@/shared/ui/settings-kit';
import { toast } from '@/shared/ui/toast';
import { patchTelegramPolicy } from '../../model/connector-api';

const POLICY_ROWS: ReadonlyArray<{ key: keyof MirrorPolicyPublic; label: string; hint: string }> = [
  { key: 'text', label: 'Agent replies', hint: 'Final answers and streamed text' },
  { key: 'ask', label: 'Questions and approvals', hint: 'Buttons that unblock a run' },
  { key: 'failures', label: 'Failures', hint: 'Run errors and stops' },
  { key: 'files', label: 'Files', hint: 'Attachments produced by an agent' },
  {
    key: 'appUserEcho',
    label: 'Your messages from Harnesys',
    hint: 'Mirror prompts typed in the app into the chat',
  },
];

export function TelegramBotPolicy({
  orgId,
  connector,
  onChanged,
  busy,
}: {
  orgId: string;
  connector: ConnectorPublic;
  onChanged: () => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState<MirrorPolicyPublic>(connector.policy);
  const dirty = POLICY_ROWS.some((row) => draft[row.key] !== connector.policy[row.key]);

  const save = useMutation({
    mutationFn: () => patchTelegramPolicy(orgId, connector.id, draft),
    onSuccess: (result) => {
      setDraft(result.connector.policy);
      onChanged();
      toast.add({ title: 'Mirroring updated' });
    },
    onError: (error: unknown) => {
      toast.add({
        title: 'Could not update mirroring',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    },
  });

  return (
    <SettingsSection
      label="What goes to Telegram"
      description="Only agent output leaves Harnesys. Everything starts on, so turn off what this chat does not need."
      actions={
        <SettingsSave
          dirty={dirty}
          pending={save.isPending || busy}
          onSave={() => save.mutate()}
          onDiscard={() => setDraft(connector.policy)}
          testId={`telegram-policy-${connector.id}`}
        />
      }
    >
      <div className="flex flex-col">
        {POLICY_ROWS.map((row) => (
          <SettingsToggle
            key={row.key}
            id={`telegram-policy-${connector.id}-${row.key}`}
            label={row.label}
            description={row.hint}
            checked={draft[row.key]}
            disabled={busy || save.isPending}
            onCheckedChange={(checked) => setDraft({ ...draft, [row.key]: checked })}
          />
        ))}
      </div>
    </SettingsSection>
  );
}
