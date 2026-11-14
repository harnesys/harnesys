import type { FieldValue } from '@harnesys/contracts';
import { useQueryClient } from '@tanstack/react-query';
import type { Agent } from '@/entities/agent';
import type { ClientAutomation } from '@/entities/automation';
import { deskAutomationsQueryKey } from '@/features/desk';
import {
  createOrgAddonTrigger,
  deleteOrgAddonTrigger,
  orgAddonDetailQueryKey,
  patchOrgAddonTrigger,
} from '@/shared/api/addons';

export interface AddonTriggerDialogData {
  orgId: string;
  addonId: string;
  kind: string;
  agents: Agent[];
  automation: ClientAutomation | null;
}

export type AddonTriggerDialogResult = { deleted: true } | { deleted: false };

export interface AddonTriggerDraft {
  label: string;
  agentId: string;
  threadId: string;
  modeId: string;
  instructions: string;
  config: Record<string, FieldValue>;
}

export interface AddonTriggerBody {
  triggerId: string;
  label: string;
  config: Record<string, FieldValue>;
  instructions: string;
  target: { threadId: string; agentId: string; modeId: string };
  enabled: boolean;
}

export function useAddonTriggerActions(
  orgId: string,
  addonId: string,
  automation: ClientAutomation | null,
): {
  save: (body: AddonTriggerBody, threadId: string) => Promise<void>;
  remove: () => Promise<boolean>;
  invalidate: () => Promise<void>;
} {
  const queryClient = useQueryClient();
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: orgAddonDetailQueryKey(orgId, addonId) }),
      queryClient.invalidateQueries({ queryKey: deskAutomationsQueryKey(orgId) }),
    ]);
  };
  const save = async (body: AddonTriggerBody, threadId: string) => {
    const payload = { ...body, target: { ...body.target, threadId } };
    if (automation) {
      await patchOrgAddonTrigger(orgId, addonId, automation.id, payload);
    } else {
      await createOrgAddonTrigger(orgId, addonId, payload);
    }
    await invalidate();
  };
  const remove = async (): Promise<boolean> => {
    if (!automation) {
      return false;
    }
    await deleteOrgAddonTrigger(orgId, addonId, automation.id);
    await invalidate();
    return true;
  };
  return { save, remove, invalidate };
}
