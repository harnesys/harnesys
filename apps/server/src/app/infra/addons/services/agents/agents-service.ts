import { Injectable } from '@harnesys/brix';
import type {
  HostCallContext,
  HostMethodSpec,
  HostServiceModule,
} from '../../../../domain/addons/host-service.ts';
import { AgentRegistryPort } from '../../../../domain/agent/agent-registry.port.ts';
import { serviceMethod } from '../method.ts';

/** Read-only view of the workspace agents for addon forms and routing cards. */
@Injectable()
export class AgentsHostService implements HostServiceModule {
  readonly namespace = 'agents';
  readonly methods: readonly HostMethodSpec[];

  constructor(private readonly agents: AgentRegistryPort) {
    this.methods = [serviceMethod('agents.list', undefined, (ctx) => this.list(ctx))];
  }

  private async list(ctx: HostCallContext): Promise<{
    agents: Array<{ id: string; name: string; status?: string }>;
  }> {
    return {
      agents: this.agents.list(ctx.orgId).map((agent) => ({
        id: agent.id,
        name: agent.name,
        status: agent.status,
      })),
    };
  }
}
