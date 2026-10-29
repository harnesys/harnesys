import type { AgentDefinition } from '../domain/agent-definition.ts';
import type { Attachment } from '../domain/attachment.ts';
import type { Event } from '../domain/snapshot.ts';
import type { Logger } from '../ports/logger.ts';
import type { ToolDefinition } from '../ports/tools.ts';
import { resolveAgentIdentity } from './agent-identity.ts';
import { compileOrThrow } from './compile.ts';
import type { GraphOpts } from './graph.ts';
import { abandonForeignSnapshot, decisionTextOf } from './graph-snap.ts';
import { createHookBus } from './hooks/bus.ts';
import type { HookEmitCtx } from './hooks/emit-hook.ts';
import { createHookRuntimeCtx } from './hooks/runtime-ctx.ts';
import type { PackRunMap } from './packs/pack-run.ts';
import type { RunEngineDeps, RunTargetOpts } from './run-engine-types.ts';
import { createLoadToolsTool } from './tools/create-load-tools-tool.ts';
import { LOAD_TOOLS_NAME } from './tools/exposure.ts';

interface HitlAnswer {
  interruptId: string;
  payload?: unknown;
  rejected?: boolean;
  note?: string;
}
function composeRunEnv(binDirs: string[] | undefined): Record<string, string> | undefined {
  if (binDirs === undefined || binDirs.length === 0) {
    return undefined;
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }
  const processPath = env.PATH ?? '';
  env.PATH = [...binDirs, processPath].filter((part) => part !== '').join(':');
  return env;
}
function hookEnvBase(runEnv: Record<string, string> | undefined): Record<string, string> {
  return runEnv?.PATH !== undefined ? { PATH: runEnv.PATH } : {};
}
interface UserInput {
  text: string;
  attachments?: Attachment[];
  origin?: string;
  effort?: string;
}
async function findLastAnswer(deps: RunEngineDeps, runId: string): Promise<HitlAnswer | null> {
  const history = await deps.events.tail(runId, 0);
  let last: HitlAnswer | null = null;
  for (const event of history) {
    if (event.type === 'hitl.answer') {
      last = {
        interruptId: event.interruptId,
        payload: event.payload,
        rejected: event.rejected,
        note: event.note,
      };
    }
  }
  return last;
}
async function findFirstUser(deps: RunEngineDeps, runId: string): Promise<UserInput | null> {
  const history = await deps.events.tail(runId, 0);
  for (const event of history) {
    if (event.type === 'user') {
      return {
        text: event.text,
        attachments: event.attachments,
        origin: event.origin,
        effort: event.effort,
      };
    }
  }
  return null;
}
function withMessageEffort(agent: AgentDefinition, effort: string | undefined): AgentDefinition {
  if (!effort || !agent.model) {
    return agent;
  }
  return {
    ...agent,
    model: { ...agent.model, effort },
  };
}
export interface PrepareExecuteGraphOptsArgs {
  deps: RunEngineDeps;
  opts: RunTargetOpts;
  runId: string;
  signal: AbortSignal;
  hookCache: Map<string, HookEmitCtx>;
  runLogger: Logger;
  childJournal: (spawnId: string, ev: Event) => void;
}
export async function prepareExecuteGraphOpts(
  args: PrepareExecuteGraphOptsArgs,
): Promise<GraphOpts> {
  const { deps, opts, runId, signal, hookCache, runLogger, childJournal } = args;
  const answer = await findLastAnswer(deps, runId);
  if (answer === null) {
    const snap = await opts.state.load();
    const foreign =
      snap !== null && snap.runId !== runId ? await findLastAnswer(deps, snap.runId) : null;
    await abandonForeignSnapshot(opts.state, runId, decisionTextOf(foreign));
  }
  const snap = await opts.state.load();
  const firstUser = await findFirstUser(deps, runId);
  const user = answer === null ? firstUser : null;
  const agent = withMessageEffort(opts.agent, firstUser?.effort);
  const plan = compileOrThrow(agent);
  const startNodeId = answer === null ? undefined : snap?.cursor.interrupt?.nodeId;
  let runRegistry: Map<string, ToolDefinition>;
  let packOutputs: PackRunMap;
  if (opts.capabilitySet !== undefined) {
    runRegistry = new Map();
    for (const [name, entry] of opts.capabilitySet.registry) {
      runRegistry.set(name, { ...entry.def, exposure: entry.exposure });
    }
    packOutputs = opts.capabilitySet.packOutputs;
    const discover = opts.universe?.discoverTool;
    if (discover !== undefined) {
      runRegistry.set(LOAD_TOOLS_NAME, createLoadToolsTool(runRegistry, { discover }));
    }
  } else {
    const identity = resolveAgentIdentity(agent, {
      baseRegistry: deps.toolRegistry,
      registrations: opts.packs ?? deps.packRegistrations ?? [],
      fsSkills: opts.skills ?? deps.skills,
      logger: runLogger,
    });
    runRegistry = identity.toolRegistry;
    packOutputs = identity.packOutputs;
  }
  const cwd = opts.paths?.cwd ?? '';
  const runEnv = composeRunEnv(opts.binDirs);
  const graphOpts: GraphOpts = {
    agent,
    input: answer === null ? (user ?? snap?.initialInput ?? null) : null,
    inputRecorded: answer === null && user !== null,
    state: opts.state,
    permissions: opts.permissions,
    paths: opts.paths,
    models: deps.models,
    toolRegistry: runRegistry,
    plan,
    toolMessages: deps.toolMessages,
    mergeState: deps.mergeState,
    signal,
    startNodeId,
    notes: opts.notes,
    skills: opts.skills ?? deps.skills,
    packOutputs,
    universe: opts.universe,
    env: runEnv,
    process: opts.process,
    fileAccess: opts.fileAccess,
    fileAccessFor: opts.fileAccessFor,
    runtime: opts.runtime,
    ...(opts.steerMessages ? { steerMessages: opts.steerMessages } : {}),
    ...(opts.ackSteerMessages ? { ackSteerMessages: opts.ackSteerMessages } : {}),
    agents: deps.agents,
    outputHint: startNodeId === undefined ? undefined : (snap?.cursor.interrupt?.output ?? null),
    rejected: answer?.rejected === true,
    resumePayload: answer?.payload,
    resumeInterruptId: answer?.interruptId,
    ...(answer?.note !== undefined ? { resumeNote: answer.note } : {}),
    childJournal,
    ...(deps.childRunner ? { childRunner: deps.childRunner } : {}),
    logger: runLogger,
    ...(opts.channelNote ? { channelNote: opts.channelNote } : {}),
  };
  let hooksEmit = opts.hooksEmit;
  if (hooksEmit === undefined) {
    const cached = hookCache.get(runId);
    if (cached !== undefined) {
      hooksEmit = cached;
    } else {
      const bindings = [...(deps.hooks ?? []), ...(opts.hooks ?? [])];
      if (bindings.length > 0) {
        hooksEmit = {
          bus: createHookBus({
            bindings,
            ctx: createHookRuntimeCtx({
              deps,
              agent,
              runRegistry,
              cwd,
              envBase: hookEnvBase(runEnv),
              signal,
              parent: graphOpts,
              ...(opts.hookReport ? { report: opts.hookReport } : {}),
            }),
          }),
          sessionId: opts.state.sessionId,
          runId,
          agentId: agent.id,
          threadId: opts.state.sessionId,
          cwd,
          permissionMode: '',
        };
        hookCache.set(runId, hooksEmit);
      }
    }
  }
  graphOpts.hooks = hooksEmit;
  return graphOpts;
}
