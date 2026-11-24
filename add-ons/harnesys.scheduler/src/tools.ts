import { isAbsolute } from 'node:path';
import type {
  AddonContext,
  AddonTriggerTarget,
  AddonTriggerWorkspace,
  ToolHandler,
} from '@harnesys/sdk';
import { AddonError } from '@harnesys/sdk';
import { isValidCron } from './cron.ts';
import type { MissPolicy } from './planner.ts';
import { listSchedules, type ScheduleRow } from './store.ts';
import { orgTimezone } from './trigger.ts';

const MISS_POLICIES: readonly MissPolicy[] = ['catch-up', 'skip', 'escalate'];

function str(input: Record<string, unknown>, key: string): string {
  const value = input[key];
  if (typeof value !== 'string' || value.length === 0) {
    throw new AddonError('invalid_params', { detail: `${key} is required` });
  }
  return value;
}

function optionalMissPolicy(input: Record<string, unknown>): MissPolicy | undefined {
  const raw = input.miss_policy;
  if (raw === undefined) {
    return undefined;
  }
  if (typeof raw === 'string' && MISS_POLICIES.includes(raw as MissPolicy)) {
    return raw as MissPolicy;
  }
  throw new AddonError('invalid_params', {
    detail: 'miss_policy must be one of: catch-up, skip, escalate',
  });
}

function optionalText(input: Record<string, unknown>, key: string): string | undefined {
  const value = input[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function optionalWorkspace(input: Record<string, unknown>): AddonTriggerWorkspace | undefined {
  const path = optionalText(input, 'workspace');
  if (path === undefined) {
    return undefined;
  }
  if (!isAbsolute(path)) {
    throw new AddonError('invalid_params', {
      detail: `workspace must be an absolute folder path: ${path}`,
    });
  }
  return { kind: 'folder', path };
}

function instructionsOf(input: Record<string, unknown>): string | undefined {
  return optionalText(input, 'instructions') ?? optionalText(input, 'detail');
}

async function resolveTargetAgent(
  input: Record<string, unknown>,
  ctx: AddonContext,
): Promise<string> {
  const explicitId = optionalText(input, 'agentId');
  const name = optionalText(input, 'agent');
  if (!explicitId && !name) {
    const caller = ctx.meta.agentId;
    if (caller) {
      return caller;
    }
    throw new AddonError('invalid_params', {
      detail: 'agentId or agent is required when the tool call has no agent context',
    });
  }
  const agents = await ctx.agents.list();
  const target = explicitId ?? name ?? '';
  const byId = explicitId ? agents.find((agent) => agent.id === explicitId) : undefined;
  if (byId) {
    return byId.id;
  }
  const byName = agents.filter(
    (agent) => agent.name.trim().toLowerCase() === target.trim().toLowerCase(),
  );
  if (byName.length > 1) {
    throw new AddonError('invalid_params', {
      detail: `multiple agents match "${target}", pass agentId instead`,
    });
  }
  const single = byName[0];
  if (single) {
    return single.id;
  }
  throw new AddonError('not_found', { detail: `agent not found: ${target}` });
}

async function resolveTarget(
  input: Record<string, unknown>,
  ctx: AddonContext,
  workspace: AddonTriggerWorkspace | undefined,
): Promise<AddonTriggerTarget> {
  const agentId = await resolveTargetAgent(input, ctx);
  const providedThreadId = optionalText(input, 'threadId');
  const threadId = await resolveThreadId(input, ctx, agentId, providedThreadId);
  return { threadId, agentId, ...(workspace === undefined ? {} : { workspace }) };
}

async function resolveThreadId(
  input: Record<string, unknown>,
  ctx: AddonContext,
  agentId: string,
  providedThreadId: string | undefined,
): Promise<string> {
  if (providedThreadId) {
    return providedThreadId;
  }
  const callerThreadId = ctx.meta.threadId;
  if (agentId === ctx.meta.agentId && callerThreadId) {
    return callerThreadId;
  }
  const title = optionalText(input, 'name') ?? 'Scheduled run';
  const created = await ctx.threads.create({ agentId, title });
  return created.threadId;
}

async function resolveSchedule(
  ctx: AddonContext,
  input: Record<string, unknown>,
): Promise<ScheduleRow> {
  const key = str(input, 'schedule');
  const row = (await listSchedules(ctx)).find(
    (candidate) => candidate.instanceId === key || candidate.name === key,
  );
  if (!row) {
    throw new AddonError('not_found', { detail: `schedule not found: ${key}` });
  }
  return row;
}

const list: ToolHandler = async (_input, ctx: AddonContext) => {
  const rows = await listSchedules(ctx);
  return rows.map((row) => ({
    instanceId: row.instanceId,
    name: row.name,
    cron: row.cron,
    instructions: row.instructions || row.detail,
    missPolicy: row.missPolicy,
    status: row.status,
    nextRunAt: row.nextRunAt,
    lastFiredAt: row.lastFiredAt,
    error: row.error,
    threadId: row.target.threadId,
    agentId: row.target.agentId,
  }));
};

const pause: ToolHandler = async (input, ctx: AddonContext) => {
  const row = await resolveSchedule(ctx, input);
  await ctx.triggers.update({ instanceId: row.instanceId, enabled: false });
  return { ok: true, instanceId: row.instanceId, status: 'paused' };
};

const resume: ToolHandler = async (input, ctx: AddonContext) => {
  const row = await resolveSchedule(ctx, input);
  await ctx.triggers.update({ instanceId: row.instanceId, enabled: true });
  const next = await readBack(ctx, row.instanceId);
  if (next.status === 'failed') {
    throw new AddonError('invalid_params', { detail: `invalid cron: ${row.cron}` });
  }
  return next;
};

async function readBack(ctx: AddonContext, instanceId: string): Promise<Record<string, unknown>> {
  const row = (await listSchedules(ctx)).find((candidate) => candidate.instanceId === instanceId);
  if (!row) {
    return { instanceId };
  }
  return {
    instanceId: row.instanceId,
    name: row.name,
    cron: row.cron,
    instructions: row.instructions || row.detail,
    missPolicy: row.missPolicy,
    status: row.status,
    nextRunAt: row.nextRunAt,
    threadId: row.target.threadId,
  };
}

const set: ToolHandler = async (input, ctx: AddonContext) => {
  const timezone = await orgTimezone(ctx);
  const cron = optionalText(input, 'cron');
  if (cron !== undefined && !isValidCron(cron, timezone)) {
    throw new AddonError('invalid_params', { detail: `invalid cron: ${cron}` });
  }
  if (typeof input.schedule === 'string' && input.schedule.length > 0) {
    return await updateSchedule(ctx, input, cron);
  }
  if (cron === undefined) {
    throw new AddonError('invalid_params', { detail: 'cron is required to create a schedule' });
  }
  return await createSchedule(ctx, input, cron);
};

async function createSchedule(
  ctx: AddonContext,
  input: Record<string, unknown>,
  cron: string,
): Promise<Record<string, unknown>> {
  const missPolicy = optionalMissPolicy(input);
  const name = optionalText(input, 'name');
  const instructions = instructionsOf(input);
  const target = await resolveTarget(input, ctx, optionalWorkspace(input));
  const { instanceId } = await ctx.triggers.create({
    kind: 'scheduler.cron',
    label: name ?? cron,
    config: {
      cron,
      ...(missPolicy !== undefined ? { miss_policy: missPolicy } : {}),
      ...(name !== undefined ? { name } : {}),
    },
    ...(instructions === undefined ? {} : { instructions }),
    target,
  });
  return await readBack(ctx, instanceId);
}

async function updateSchedule(
  ctx: AddonContext,
  input: Record<string, unknown>,
  cron: string | undefined,
): Promise<Record<string, unknown>> {
  const row = await resolveSchedule(ctx, input);
  const missPolicy = optionalMissPolicy(input);
  const name = optionalText(input, 'name');
  const instructions = instructionsOf(input);
  const workspace = optionalWorkspace(input);
  const rebind =
    input.agentId !== undefined || input.agent !== undefined || input.threadId !== undefined;
  const target = await resolveRebindTarget(input, ctx, row, workspace, rebind);
  await ctx.triggers.update({
    instanceId: row.instanceId,
    ...(name !== undefined && name !== row.name ? { label: name } : {}),
    config: {
      cron: cron ?? row.cron,
      miss_policy: missPolicy ?? row.missPolicy,
      name: name ?? row.name,
    },
    ...(instructions === undefined ? {} : { instructions }),
    ...(target !== undefined ? { target } : {}),
  });
  return await readBack(ctx, row.instanceId);
}

async function resolveRebindTarget(
  input: Record<string, unknown>,
  ctx: AddonContext,
  row: ScheduleRow,
  workspace: AddonTriggerWorkspace | undefined,
  rebind: boolean,
): Promise<AddonTriggerTarget | undefined> {
  if (rebind) {
    return resolveTarget(input, ctx, workspace);
  }
  return workspace === undefined ? undefined : { ...row.target, workspace };
}

export const schedulerTools: Record<string, ToolHandler> = { list, pause, resume, set };
