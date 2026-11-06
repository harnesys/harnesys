import { dialog } from '@/shared/services/overlay';
import { TelegramFeedConfigDialog } from '../ui/telegram-feed-config-dialog';
import type { TelegramFeedDialogData, TelegramFeedDialogResult } from './telegram-feed-draft';

export type {
  TelegramFeedDialogData,
  TelegramFeedDialogResult,
} from './telegram-feed-draft';

export function openTelegramFeedConfigDialog(
  data: TelegramFeedDialogData,
): Promise<TelegramFeedDialogResult | null> {
  return dialog.open(TelegramFeedConfigDialog, {
    title: data.automation ? `Configure ${data.automation.label}` : 'New Telegram feed',
    description: 'Wake an agent when a new post from the picked channels passes the filter.',
    className: 'sm:max-w-2xl',
    testId: 'telegram-feed-config-dialog',
    data,
  });
}
