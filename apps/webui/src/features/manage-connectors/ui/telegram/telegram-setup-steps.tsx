import type { ConnectorPublic } from '@harnesys/contracts';
import { CheckIcon } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { SettingsSection } from '@/shared/ui/settings-kit';

interface Step {
  label: string;
  done: boolean;
  hint: string;
}

export function TelegramSetupSteps({ connectors }: { connectors: ConnectorPublic[] }) {
  const bindings = connectors.flatMap((connector) => connector.bindings);
  const steps: Step[] = [
    {
      label: 'Add a bot',
      done: connectors.length > 0,
      hint: 'Create a bot with @BotFather and paste its token below.',
    },
    {
      label: 'Let the bot see a chat',
      done: bindings.length > 0,
      hint: 'Open a pair link and send /start, or add the bot to a group or channel and use Refresh.',
    },
    {
      label: 'Connect the chat to a thread',
      done: bindings.some((binding) => binding.threadId !== null),
      hint: 'In the chat list below, pick a thread for each chat. Agents answer there.',
    },
  ];
  const current = steps.findIndex((step) => !step.done);

  return (
    <SettingsSection
      label="Set up"
      description="A bot is a transport. Chats are discovered from Telegram, then each one is connected to a thread that decides who answers."
      testId="telegram-setup"
    >
      <ol className="flex flex-col gap-1.5">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={cn(
              'flex items-start gap-2.5 rounded-md px-2 py-1.5',
              index === current && 'bg-muted/50',
            )}
          >
            <span
              className={cn(
                'mt-px flex size-4 shrink-0 items-center justify-center rounded-full border font-mono text-[9px]',
                step.done
                  ? 'border-status-ok/40 bg-status-ok/15 text-status-ok'
                  : 'border-border text-muted-foreground',
              )}
              aria-hidden
            >
              {step.done ? <CheckIcon className="size-2.5" /> : index + 1}
            </span>
            <div className="flex min-w-0 flex-col">
              <span className={cn('text-[13px]', step.done && 'text-muted-foreground')}>
                {step.label}
              </span>
              {index === current ? (
                <span className="text-[11px] text-muted-foreground leading-4">{step.hint}</span>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </SettingsSection>
  );
}
