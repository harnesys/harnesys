import type { ToolHandler } from '@harnesys/sdk';
import { chatTools } from './tools-chat.ts';
import { mediaTools } from './tools-media.ts';
import { readTools } from './tools-read.ts';
import { sendTools } from './tools-send.ts';

export const telegramAccountTools: Record<string, ToolHandler> = {
  ...readTools,
  ...sendTools,
  ...mediaTools,
  ...chatTools,
};
