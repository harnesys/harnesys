import type { ConnectorPublic } from '@harnesys/contracts';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { TelegramAddBotForm } from './telegram-add-bot-form';
import { TelegramBotCard } from './telegram-bot-card';

export function TelegramBotSection({
  orgId,
  connectors,
  initialThreadId,
  onChanged,
}: {
  orgId: string;
  connectors: ConnectorPublic[];
  initialThreadId?: string | null;
  onChanged: () => void;
}) {
  return (
    <div className="flex flex-col gap-4" data-testid="telegram-bots">
      {connectors.map((connector) => (
        <TelegramBotCard
          key={connector.id}
          orgId={orgId}
          connector={connector}
          initialThreadId={initialThreadId}
          onChanged={onChanged}
        />
      ))}
      <SettingsSection
        label={connectors.length > 0 ? 'Add another bot' : 'Add a bot'}
        description="Create a bot with @BotFather and paste its token. A bot is a transport: it can serve any chat and any thread in this organization."
      >
        <TelegramAddBotForm orgId={orgId} onCreated={onChanged} />
      </SettingsSection>
    </div>
  );
}
