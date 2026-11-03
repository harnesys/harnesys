export type SessionEventType =
  | 'user'
  | 'text-delta'
  | 'reasoning-delta'
  | 'reasoning-start'
  | 'reasoning-end'
  | 'tool'
  | 'source'
  | 'file'
  | 'ask'
  | 'hitl.answer'
  | 'run.started'
  | 'model.usage'
  | 'model.stats'
  | 'model.retry'
  | 'compaction'
  | 'run.completed'
  | 'run.cancelled'
  | 'run.failed'
  | 'run.resumed'
  | 'done'
  | 'error'
  | 'agent.handoff'
  | 'agent.spawned'
  | 'agent.completed'
  | 'agent.failed'
  | 'map.started'
  | 'map.item.started'
  | 'map.item.completed'
  | 'map.item.failed'
  | 'map.completed'
  | 'wait.started'
  | 'wait.resumed'
  | 'placement.decided'
  | 'hook'
  | 'memory';

export interface SessionEventScope {
  threadSeq?: number;
  conversational?: boolean;
  author?: { provider: string; providerUserId: string; displayName: string };
  agentId?: string;
  agentName?: string;
  originConnectorId?: string;
}
