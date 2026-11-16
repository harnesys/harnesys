import { ensureOrgLspServer } from '@/shared/api/org-lsp';
import { toast } from '@/shared/ui/toast';
import type { LspInstallCandidate } from './lsp-gap';
import { lspInstallKey, useLspInstallStore } from './lsp-install.store';

const dismissed = new Map<string, true>();
const inFlight = new Map<string, Promise<boolean>>();

export function lspInstallToastId(orgId: string, serverId: string): string {
  return `lsp-install:${orgId}:${serverId}`;
}

export function offerLspInstall(orgId: string, candidate: LspInstallCandidate): void {
  const key = lspInstallKey(orgId, candidate.serverId);
  if (dismissed.has(key)) {
    return;
  }
  toast.add({
    id: lspInstallToastId(orgId, candidate.serverId),
    title: `${candidate.label} language server`,
    description: candidate.binaryOk
      ? 'Available on this host but not enabled for this project.'
      : `Not installed. ${candidate.install}`,
    timeout: 0,
    actionProps: {
      children: candidate.binaryOk ? 'Enable' : 'Install',
      onClick: () => void runLspInstall(orgId, candidate),
    },
    onClose: () => dismissed.set(key, true),
  });
}

export function runLspInstall(orgId: string, candidate: LspInstallCandidate): Promise<boolean> {
  const key = lspInstallKey(orgId, candidate.serverId);
  const existing = inFlight.get(key);
  if (existing !== undefined) {
    return existing;
  }
  const id = lspInstallToastId(orgId, candidate.serverId);
  const verb = candidate.binaryOk ? 'Enabling' : 'Installing';
  toast.add({
    id,
    type: 'loading',
    title: `${verb} ${candidate.label}…`,
    description: candidate.command,
    timeout: 0,
    actionProps: undefined,
  });
  useLspInstallStore.getState().setInstalling(key, true);
  const promise = ensureOrgLspServer(orgId, candidate)
    .then(() => {
      useLspInstallStore.getState().markInstalled();
      toast.add({
        id,
        type: 'success',
        title: `${candidate.label} language server ${candidate.binaryOk ? 'enabled' : 'installed'}`,
        description: 'Diagnostics reconnect on the next editor request.',
        timeout: 4000,
        actionProps: undefined,
      });
      return true;
    })
    .catch((error: unknown) => {
      toast.add({
        id,
        type: 'error',
        title: 'LSP install failed',
        description: errorMessage(error),
        timeout: 0,
        actionProps: {
          children: 'Retry',
          onClick: () => void runLspInstall(orgId, candidate),
        },
      });
      return false;
    })
    .finally(() => {
      inFlight.delete(key);
      useLspInstallStore.getState().setInstalling(key, false);
    });
  inFlight.set(key, promise);
  return promise;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Unknown error';
}
