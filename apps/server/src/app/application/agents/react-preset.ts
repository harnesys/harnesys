export interface ReactGraph {
  nodes: Record<string, unknown>;
  edges: Array<Record<string, unknown>>;
}

const THINK_NODE = {
  type: 'llm:generate',
  prompt: 'main',
  messages: '$state.messages',
};

const REACT_NODES: Record<string, unknown> = {
  start: { type: 'core:start' },
  think: THINK_NODE,
  act: {
    type: 'tool:call',
    calls: '$output.toolCalls',
    concurrency: 'parallel',
  },
  spawn: {
    type: 'control:spawn',
    calls: '$state.spawns',
    concurrency: 'parallel',
    barrier: { policy: 'all' },
  },
  handoff: {
    type: 'control:handoff',
    agentId: '$state.handoffAgentId',
    input: '$input',
  },
  end: { type: 'core:end' },
};

const REACT_EDGES: Array<Record<string, unknown>> = [
  { from: 'start', to: 'think' },
  { from: 'think', to: 'act', when: '$output.finishReason = "tool-calls"' },
  { from: 'think', to: 'end', when: '$output.finishReason = "stop"' },
  { from: 'think', to: 'end' },
  { from: 'act', to: 'spawn', when: 'exists($state.spawns) && length($state.spawns) > 0' },
  { from: 'act', to: 'handoff', when: 'exists($state.handoffAgentId)' },
  { from: 'act', to: 'think' },
  { from: 'spawn', to: 'handoff', when: 'exists($state.handoffAgentId)' },
  { from: 'spawn', to: 'think' },
  { from: 'handoff', to: 'end' },
];

export const DEFAULT_REACT_BUDGET = { maxSteps: 50, policy: 'ask' as const };

export function buildReactGraph(): ReactGraph {
  return {
    nodes: { ...REACT_NODES },
    edges: [...REACT_EDGES],
  };
}
