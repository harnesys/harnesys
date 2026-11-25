import type { MessageQuote } from '@harnesys/contracts';
import type { ThreadAttachment } from '@harnesys/studio-shared';
import { sendMessage } from '@/features/send-message';
import { uploadThreadAttachment } from '@/shared/api';
import type { ComposerMode } from './composer-mode';
export interface UploadAndSendOptions {
  threadId: string;
  content: string;
  quote?: MessageQuote;
  effort: string | undefined;
  files: File[];
  mode: ComposerMode;
  skills: string[];
  onFailure?: () => void;
}
export async function uploadAndSend(options: UploadAndSendOptions): Promise<void> {
  const { threadId, content, quote, effort, files, mode, skills, onFailure } = options;
  const uploaded: ThreadAttachment[] = [];
  for (const file of files) {
    uploaded.push(await uploadThreadAttachment(threadId, file));
  }
  await sendMessage({
    threadId,
    content,
    quote,
    effort,
    attachments: uploaded,
    mode,
    skills,
    onFailure,
  });
}
export function filesFromClipboard(data: DataTransfer): File[] {
  const fromFiles = Array.from(data.files);
  if (fromFiles.length > 0) {
    return fromFiles;
  }
  return Array.from(data.items)
    .filter((item) => item.kind === 'file')
    .flatMap((item) => {
      const file = item.getAsFile();
      return file ? [file] : [];
    });
}
