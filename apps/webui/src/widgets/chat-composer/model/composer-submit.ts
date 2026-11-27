import type { MessageQuote } from '@harnesys/contracts';
import { ApiError } from '@/shared/api';
import { toast } from '@/shared/ui/toast';
import type { ComposerPayload } from './composer-doc';
import type { ComposerMode } from './composer-mode';
import { uploadAndSend } from './composer-send';
import { runSlashCommand } from './run-slash-command';
import type { SlashCommand } from './slash-commands';
export interface ComposerSubmitOptions {
  payload: ComposerPayload;
  files: File[];
  threadId: string;
  quote?: MessageQuote;
  effort: string | undefined;
  mode: ComposerMode;
  disabled: boolean;
  setSending(value: boolean): void;
  clear(): void;
  clearQuote?: () => void;
  restoreQuote?: () => void;
}
export function submitComposer(options: ComposerSubmitOptions): void {
  const content = options.payload.text;
  if ((!content && options.files.length === 0) || options.disabled) {
    return;
  }
  const files = options.files;
  options.setSending(true);
  options.clearQuote?.();
  void uploadAndSend({
    threadId: options.threadId,
    content,
    ...(options.quote ? { quote: options.quote } : {}),
    effort: options.effort,
    files,
    mode: options.mode,
    skills: options.payload.skills,
  })
    .then(() => {
      options.clear();
    })
    .catch((error) => {
      const message = error instanceof ApiError ? error.message : 'Send failed';
      toast.add({ title: 'Could not send', description: message });
      options.restoreQuote?.();
    })
    .finally(() => {
      options.setSending(false);
    });
}
export async function executeComposerSlash(
  command: SlashCommand,
  options: Pick<ComposerSubmitOptions, 'threadId' | 'disabled' | 'setSending'>,
): Promise<void> {
  if (options.disabled) {
    return;
  }
  options.setSending(true);
  try {
    const message = await runSlashCommand(command, options.threadId);
    if (message) {
      toast.add({ title: message });
    }
  } catch (error) {
    const description = error instanceof Error ? error.message : 'Command failed';
    toast.add({ title: `/${command.name}`, description });
  } finally {
    options.setSending(false);
  }
}
