import type { FieldValue } from '@harnesys/contracts';
import type { ClientAutomation } from '@/entities/automation';

export interface AddonTriggerAgentOption {
  id: string;
  name: string;
  defaultModeId?: string | null;
}

export interface AddonTriggerDialogData {
  orgId: string;
  addonId: string;
  kind: string;
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
