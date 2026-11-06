import { SendIcon } from 'lucide-react';
import { toast } from '@/shared/ui/toast';
import type { AutomationConfigInput, WebuiIntegrationDescriptor } from '../types';
import { deleteRule } from './api';
import { openTelegramFeedConfigDialog } from './model/telegram-feed-dialog';
import { TelegramAccountSettings } from './ui/telegram-account-settings';

async function openFeedConfig(input: AutomationConfigInput): Promise<void> {
  const result = await openTelegramFeedConfigDialog({
    orgId: input.scopeId,
    agents: input.agents,
    automation: input.automation,
  });
  if (result?.deleted && input.automation) {
    try {
      await deleteRule(input.scopeId, input.automation.id);
    } catch (error) {
      toast.add({
        title: 'Could not delete the rule',
        description: error instanceof Error ? error.message : 'Request failed',
      });
    }
  }
}

export const telegramUi: WebuiIntegrationDescriptor = {
  id: 'telegram',
  title: 'Telegram',
  icon: SendIcon,
  connectorProvider: 'telegram',
  settings: TelegramAccountSettings,
  automationKinds: {
    'telegram.feed': {
      label: 'Telegram feed',
      description: 'New Telegram posts, filtered',
      openConfig: openFeedConfig,
    },
  },
};
