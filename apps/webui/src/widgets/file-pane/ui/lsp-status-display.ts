import type { LspBridgeStatus } from '@/features/lsp-bridge';

export const LSP_DOT: Record<LspBridgeStatus, string> = {
  live: 'bg-status-ok',
  starting: 'bg-status-warn',
  error: 'bg-red-500',
  off: 'bg-muted-foreground/50',
};

export const LSP_LABEL: Record<LspBridgeStatus, string> = {
  live: 'LSP',
  starting: 'LSP...',
  error: 'LSP error',
  off: 'LSP off',
};

export const LSP_HINT: Record<LspBridgeStatus, string> = {
  live: 'Connected',
  starting: 'Connecting...',
  error: 'Server start failed',
  off: 'No server for this file',
};

export const STATUS_SEGMENT = 'flex shrink-0 items-center gap-1 px-1 hover:text-foreground';
