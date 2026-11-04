import type { ConnectorPublic } from '@harnesys/contracts';
import { SettingsSection } from '@/shared/ui/settings-kit';
import { TelegramAddBotForm } from './telegram-add-bot-form';
import { TelegramBotCard } from './telegram-bot-card';
import type { PairInfo } from './telegram-status';

export function TelegramBotSection({
  orgId,
  connectors,
  pairByConnector,
  initialThreadId,
  onChanged,
}: {
  orgId: string;
  connectors: ConnectorPublic[];
  pairByConnector: Record<string, PairInfo>;
  initialThreadId?: string | null;
  onChanged: () => void;
}) {
  return (
    <SettingsSection
      label="Bots"
      description="One bot can serve several chats. Its token is stored encrypted on this machine."
    >
      <div className="flex flex-col gap-3">
        <TelegramAddBotForm orgId={orgId} onCreated={onChanged} />
        {connectors.map((connector) => (
          <TelegramBotCard
            key={connector.id}
            orgId={orgId}
            connector={connector}
            initialPair={pairByConnector[connector.id] ?? null}
            initialThreadId={initialThreadId}
            onChanged={onChanged}
          />
        ))}
      </div>
    </SettingsSection>
  );
}
