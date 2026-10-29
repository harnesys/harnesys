import type { AgentHookEvent } from '@harnesys/contracts';

export type HookEventPhase = 'session' | 'prompt' | 'tool' | 'model' | 'agent' | 'compact';

export interface HookEventCatalogEntry {
  event: AgentHookEvent;
  label: string;
  phase: HookEventPhase;
  description: string;
  matcherSubject?: string;
  canBlock: boolean;
  canContext: boolean;
  canAsk: boolean;
  canStop: boolean;
}

export const HOOK_EVENT_CATALOG: readonly HookEventCatalogEntry[] = [
  {
    event: 'SessionStart',
    label: 'Session start',
    phase: 'session',
    description: 'Runs once when a run session opens, before the first model call.',
    matcherSubject: 'session source (startup, resume, clear, compact, fork)',
    canBlock: false,
    canContext: true,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'SessionEnd',
    label: 'Session end',
    phase: 'session',
    description: 'Runs when the run session closes.',
    matcherSubject: 'session end reason',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'UserPromptSubmit',
    label: 'User prompt submitted',
    phase: 'prompt',
    description: 'Runs when the user prompt is sent, can prepend context to it.',
    canBlock: false,
    canContext: true,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PreToolUse',
    label: 'Before tool call',
    phase: 'tool',
    description: 'Runs before a tool executes, can block it or rewrite its arguments.',
    matcherSubject: 'tool name',
    canBlock: true,
    canContext: false,
    canAsk: true,
    canStop: false,
  },
  {
    event: 'PostToolUse',
    label: 'After tool call',
    phase: 'tool',
    description: 'Runs after a tool succeeded, can rewrite its output.',
    matcherSubject: 'tool name',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PostToolUseFailure',
    label: 'After tool failure',
    phase: 'tool',
    description: 'Runs after a tool failed, can replace the reported error.',
    matcherSubject: 'tool name',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PostToolBatch',
    label: 'After tool batch',
    phase: 'tool',
    description: 'Runs after a batch of parallel tool calls finished.',
    matcherSubject: 'tool name',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PermissionRequest',
    label: 'Permission requested',
    phase: 'tool',
    description: 'Runs when a tool asks for permission, can block the request.',
    matcherSubject: 'tool name',
    canBlock: true,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PermissionDenied',
    label: 'Permission denied',
    phase: 'tool',
    description: 'Runs when a tool call was denied by permissions.',
    matcherSubject: 'tool name',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'Stop',
    label: 'Run stopping',
    phase: 'session',
    description: 'Runs when the agent tries to finish, can stop the run.',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: true,
  },
  {
    event: 'SubagentStart',
    label: 'Subagent started',
    phase: 'agent',
    description: 'Runs when this agent spawns a subagent.',
    matcherSubject: 'subagent type',
    canBlock: false,
    canContext: true,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'SubagentStop',
    label: 'Subagent stopped',
    phase: 'agent',
    description: 'Runs when a spawned subagent finished.',
    matcherSubject: 'subagent type',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: true,
  },
  {
    event: 'PreCompact',
    label: 'Before compaction',
    phase: 'compact',
    description: 'Runs before the thread history is compacted.',
    matcherSubject: 'compaction trigger (manual, auto)',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PostCompact',
    label: 'After compaction',
    phase: 'compact',
    description: 'Runs after the thread history was compacted.',
    matcherSubject: 'compaction trigger (manual, auto)',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'Notification',
    label: 'Notification',
    phase: 'session',
    description: 'Runs when the agent emits a notification.',
    matcherSubject: 'notification type',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PreModelCall',
    label: 'Before model call',
    phase: 'model',
    description: 'Runs before the model is called, can block the call.',
    matcherSubject: 'model name',
    canBlock: true,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'PostModelCall',
    label: 'After model call',
    phase: 'model',
    description: 'Runs after the model answered.',
    matcherSubject: 'model name',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'NodeStart',
    label: 'Graph node started',
    phase: 'session',
    description: 'Runs when a graph node starts executing.',
    matcherSubject: 'node type',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
  {
    event: 'NodeEnd',
    label: 'Graph node finished',
    phase: 'session',
    description: 'Runs when a graph node finished executing.',
    matcherSubject: 'node type',
    canBlock: false,
    canContext: false,
    canAsk: false,
    canStop: false,
  },
];

const BY_EVENT = new Map<AgentHookEvent, HookEventCatalogEntry>(
  HOOK_EVENT_CATALOG.map((entry) => [entry.event, entry]),
);

export function hookCatalogEntry(event: AgentHookEvent): HookEventCatalogEntry {
  const entry = BY_EVENT.get(event);
  if (entry === undefined) {
    throw new Error(`unknown hook event: ${event}`);
  }
  return entry;
}

export function hookMatcherApplies(event: AgentHookEvent): boolean {
  return hookCatalogEntry(event).matcherSubject !== undefined;
}
