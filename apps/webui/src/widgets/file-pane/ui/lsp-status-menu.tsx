import { DownloadIcon, Loader2Icon, PlusIcon, RotateCwIcon } from 'lucide-react';
import type {
  LspBridgeStatus,
  LspGap,
  LspInstallCandidate,
  LspSessionEntry,
} from '@/features/lsp-bridge';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { LSP_DOT, LSP_HINT, LSP_LABEL, STATUS_SEGMENT } from './lsp-status-display';

interface LspStatusMenuProps {
  path: string;
  languageId: string;
  status: LspBridgeStatus;
  pulse: number;
  gap: LspGap | null;
  installing: boolean;
  sessions: LspSessionEntry[];
  message?: string;
  onRestart: () => void;
  onInstall: () => void;
}

export function LspStatusMenu({
  path,
  languageId,
  status,
  pulse,
  gap,
  installing,
  sessions,
  message,
  onRestart,
  onInstall,
}: LspStatusMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title="Language servers"
        data-testid="lsp-popup-trigger"
        className={STATUS_SEGMENT}
      >
        <span className="relative flex size-1.5">
          {status === 'live' && pulse > 0 ? (
            <span
              key={pulse}
              className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-ok opacity-60"
            />
          ) : null}
          <span className={cn('relative size-1.5 rounded-full', LSP_DOT[status])} />
        </span>
        {LSP_LABEL[status]}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className="w-72"
        data-testid="lsp-popup"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>This file</DropdownMenuLabel>
          <div className="flex items-center gap-1.5 px-1.5 py-1 text-xs">
            <span className={cn('size-1.5 shrink-0 rounded-full', LSP_DOT[status])} />
            <span className="min-w-0 flex-1 truncate">{path}</span>
            <span className="shrink-0 text-muted-foreground">
              {languageId} · {LSP_HINT[status]}
            </span>
            {gap?.candidate ? (
              <InstallButton
                candidate={gap.candidate}
                installing={installing}
                onInstall={onInstall}
              />
            ) : null}
            <button
              type="button"
              title="Restart language server"
              data-testid="lsp-restart"
              onClick={onRestart}
              className="shrink-0 rounded-sm p-0.5 hover:text-foreground"
            >
              <RotateCwIcon className="size-3" />
            </button>
          </div>
          {message ? (
            <div className="flex items-start gap-1.5 px-1.5 pb-1">
              <p
                className={cn(
                  'min-w-0 flex-1 text-xs',
                  status === 'error' ? 'text-destructive' : 'text-muted-foreground',
                )}
              >
                {message}
              </p>
              {gap?.candidate ? (
                <button
                  type="button"
                  data-testid="lsp-install-inline"
                  disabled={installing}
                  onClick={onInstall}
                  className="shrink-0 text-[11px] text-foreground text-underline underline-offset-2 disabled:opacity-60"
                >
                  {installLabel(gap.candidate, installing)}
                </button>
              ) : null}
            </div>
          ) : null}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Running sessions ({sessions.length})</DropdownMenuLabel>
          {sessions.length === 0 ? (
            <div className="px-1.5 py-1 text-muted-foreground text-xs">No active sessions</div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.path}
                className="flex items-center gap-1.5 px-1.5 py-1 text-xs"
                title={
                  session.message
                    ? `${session.path} — ${session.message}`
                    : `${session.path} — ${session.languageId}, ${session.status}`
                }
              >
                <span className={cn('size-1.5 shrink-0 rounded-full', LSP_DOT[session.status])} />
                <span className="min-w-0 flex-1 truncate">{session.path}</span>
                <span className="shrink-0 text-muted-foreground">{session.languageId}</span>
              </div>
            ))
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InstallButton({
  candidate,
  installing,
  onInstall,
}: {
  candidate: LspInstallCandidate;
  installing: boolean;
  onInstall: () => void;
}) {
  return (
    <button
      type="button"
      title={installTitle(candidate, installing)}
      aria-label={installTitle(candidate, installing)}
      data-testid="lsp-install"
      disabled={installing}
      onClick={onInstall}
      className="shrink-0 rounded-sm p-0.5 hover:text-foreground disabled:opacity-60"
    >
      <InstallIcon candidate={candidate} installing={installing} />
    </button>
  );
}

function InstallIcon({
  candidate,
  installing,
}: {
  candidate: LspInstallCandidate;
  installing: boolean;
}) {
  if (installing) {
    return <Loader2Icon className="size-3 animate-spin" />;
  }
  return candidate.binaryOk ? <PlusIcon className="size-3" /> : <DownloadIcon className="size-3" />;
}

function installTitle(candidate: LspInstallCandidate, installing: boolean): string {
  if (installing) {
    return candidate.binaryOk ? `Enabling ${candidate.label}…` : `Installing ${candidate.label}…`;
  }
  return `${candidate.binaryOk ? 'Enable' : 'Install'} ${candidate.label} language server`;
}

function installLabel(candidate: LspInstallCandidate, installing: boolean): string {
  if (installing) {
    return candidate.binaryOk ? 'Enabling…' : 'Installing…';
  }
  return candidate.binaryOk ? 'Enable' : 'Install';
}
