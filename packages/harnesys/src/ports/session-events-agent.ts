export type AgentSessionEvents =
  | {
      type: 'agent.handoff';
      agentId: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'agent.spawned';
      agentId: string;
      spawnId: string;
      taskInput?: unknown;
      quotaSteps?: number;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'agent.completed';
      agentId: string;
      spawnId: string;
      seq?: number;
      runId?: string;
    }
  | {
      type: 'agent.failed';
      agentId: string;
      spawnId: string;
      code?: string;
      message?: string;
      seq?: number;
      runId?: string;
    };
