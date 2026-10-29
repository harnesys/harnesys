import type { MirrorPolicy } from './constants.ts';
import { appEchoText } from './echo.ts';
import { outboundAction } from './mirror-policy.ts';

export interface ProjectEventInput {
  type: string;
  text?: string;
  message?: string;
  origin?: string;
  connectorId?: string;
  askId?: string;
  source?: string;
  schema?: unknown;
  prompt?: string;
  tool?: { name: string; input: unknown };
}

export interface ProjectionDelivery {
  lastText?: string | null;
}

export type ProjectionPlan =
  | { type: 'skip' }
  | { type: 'draft'; text: string }
  | { type: 'finalize-text'; text: string }
  | {
      type: 'ask';
      interruptId: string;
      text: string;
      buttons: Array<{ label: string; value: string }>;
    }
  | { type: 'failed'; text: string }
  | { type: 'file' }
  | { type: 'echo'; text: string };

const APPROVE_DENY = [
  { label: 'Approve', value: 'approve' },
  { label: 'Deny', value: 'deny' },
] as const;

const SHELL_DECISIONS = [
  { label: 'Once', value: 'approve_once' },
  { label: 'Always', value: 'always' },
  { label: 'Deny', value: 'deny' },
] as const;

export function planProjection(
  policy: MirrorPolicy,
  event: ProjectEventInput,
  delivery: ProjectionDelivery | null,
): ProjectionPlan {
  if (event.type === 'run.completed') {
    return policy.text
      ? { type: 'finalize-text', text: event.text ?? delivery?.lastText ?? '' }
      : { type: 'skip' };
  }

  const action = outboundAction(policy, {
    type: event.type,
    origin: event.origin,
    connectorId: event.connectorId,
  });
  if (action === 'skip') {
    return { type: 'skip' };
  }
  return planForAction(action, event);
}

function planForAction(
  action: ReturnType<typeof outboundAction>,
  event: ProjectEventInput,
): ProjectionPlan {
  if (event.type === 'user') {
    return { type: 'echo', text: appEchoText(event.text ?? '') };
  }
  if (action === 'ask' && event.type === 'ask') {
    return {
      type: 'ask',
      interruptId: event.askId ?? '',
      text: event.prompt ?? '',
      buttons: askButtons(event),
    };
  }
  if (action === 'failed') {
    return { type: 'failed', text: `Run failed: ${event.message ?? ''}` };
  }
  if (action === 'file') {
    return { type: 'file' };
  }
  if (action === 'text' && (event.type === 'text-delta' || event.type === 'text')) {
    return { type: 'draft', text: event.text ?? '' };
  }
  return { type: 'skip' };
}

function askButtons(event: ProjectEventInput): Array<{ label: string; value: string }> {
  if (event.source === 'ask_user') {
    const values = enumValuesOf(event.schema);
    if (values.length > 0) {
      return values.map((value) => ({ label: value, value }));
    }
  }
  if (event.tool?.name === 'shell') {
    return SHELL_DECISIONS.map((button) => ({ ...button }));
  }
  return APPROVE_DENY.map((button) => ({ ...button }));
}

function enumValuesOf(schema: unknown): string[] {
  const rec = asRecord(schema);
  if (rec === null) {
    return [];
  }
  if (Array.isArray(rec.enum)) {
    return rec.enum.filter((value): value is string => typeof value === 'string');
  }
  if (Array.isArray(rec.options)) {
    return rec.options
      .map((item) => {
        const row = asRecord(item);
        return row !== null && typeof row.id === 'string' ? row.id : null;
      })
      .filter((id): id is string => id !== null);
  }
  return optionIdsEnum(rec.properties);
}

function optionIdsEnum(properties: unknown): string[] {
  const props = asRecord(properties);
  const optionIds = props ? asRecord(props.optionIds) : null;
  const items = optionIds ? asRecord(optionIds.items) : null;
  if (items !== null && Array.isArray(items.enum)) {
    return items.enum.filter((value): value is string => typeof value === 'string');
  }
  return [];
}

function asRecord(input: unknown): Record<string, unknown> | null {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }
  return input as Record<string, unknown>;
}
