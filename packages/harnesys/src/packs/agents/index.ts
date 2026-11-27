import { definePack } from '../../domain/pack.ts';
import type { AgentsCatalogPort } from '../../ports/agents-catalog.ts';
import { createAgentLifecycleTools } from './create-agent-lifecycle-tools.ts';
import { createAgentsHandoffTool } from './create-agents-handoff-tool.ts';
import { createAgentsTools } from './create-agents-tools.ts';
import { createAgentsRunControlTools } from './run-control-tools.ts';
export interface AgentsCapabilityPorts {
  agents: AgentsCatalogPort;
}
export interface AgentsPackSpec {
  ownDelegatesOnly?: boolean;
}
export const agentsCapability = definePack<AgentsCapabilityPorts, AgentsPackSpec>({
  name: 'agents',
  version: '1.0.0',
  description:
    'Agent catalog: agents_list / agents_create / agents_create_subagent / agents_spawn / agents_handoff / agents_update / agents_delete',
  icon: 'agents',
  specSchema: {
    type: 'object',
    properties: {
      ownDelegatesOnly: {
        type: 'boolean',
        description:
          'Limit agents_update to delegates created by the calling agent (delete is always own-delegates-only).',
      },
    },
    additionalProperties: false,
  },
  meta: {
    tools: [
      {
        name: 'agents_list',
        description:
          'List agents in this project (id, name, role, instructions, packs, model). Optional role/name filters; role is not unique. packs lists enabled source assignments per agent; tool availability derives from those sources, not from a stored tool-name list. Prefer reuse via agents_list before agents_create. Spawned children are one-shot with no interactive user: judge fit by packs/model before agents_spawn.',
      },
      {
        name: 'agents_create',
        description:
          'Create an agent in this project. Returns { id, name }. Before creating, load_skill("agent-creator") for graphs, packs, budget, and HITL. Omit graph to let the host build a default ReAct graph; when budget is omitted the host stores { maxSteps: 50, policy: "ask" }. budget.policy is ask|error. Call agents_list first to reuse an existing agent when possible.',
      },
      {
        name: 'agents_create_subagent',
        description:
          'Create a one-shot delegate under the calling agent. Returns { id, name }. The delegate is a spawn target, cannot ask the user, and cannot enable the agents pack; use agents_create for a standalone project agent.',
      },
      {
        name: 'agents_spawn',
        description:
          'Queue one-shot subcontracts: the graph then runs control:spawn. calls is [{ agentId, input, budget?, permissions?, background? }]. input is usually { messages: [{ role: "user", content: "<task>" }] }. Children cannot ask questions back (permission/approval/input tools are denied in child context); pre-approve gates with per-call permissions, or provide everything upfront. background: true starts the child fire-and-forget — the call returns immediately and the child keeps running after this run ends; its report arrives as a message in this thread when it settles. Track the fleet with agents_status (board), drill into one child by spawnId, collect outputs with agents_wait, steer with agents_send, stop with agents_stop. agentId accepts an exact id, a unique id prefix (8+ chars), or a name — unknown/ambiguous targets fail here with the agent list. Prefer agents_list (reuse) before agents_create. This is not the tool name control:spawn.',
      },
      {
        name: 'agents_wait',
        description:
          'Wait for background subagents of this thread (started with agents_spawn background: true) to settle and collect their statuses and outputs.',
      },
      {
        name: 'agents_status',
        description:
          'Board of background subagents: no spawnId = cheap dashboard (counts + one row per child), spawnId = one child detail (tail/error/effects), output: true adds its final output.',
      },
      {
        name: 'agents_send',
        description:
          'Steer a running background subagent with a text message applied at its next safe point.',
      },
      {
        name: 'agents_stop',
        description: 'Stop a running background subagent.',
      },
      {
        name: 'agents_handoff',
        description:
          'Pass this thread to another agent (current speaker changes, origin stays). The graph then runs control:handoff. agentId from agents_list or agents_create. This is not the tool name control:handoff. Top-level agents only; delegates must be run via agents_spawn.',
      },
      {
        name: 'agents_update',
        description:
          'Patch name/role/instructions/budget/permissions of an agent (scope: whole org by default, own delegates only with pack spec ownDelegatesOnly); graph and packs are owner-only (tools removed; use sources). permissions replaces the stored op → allow|ask|deny map and always asks the user for approval; passing it inside config fails. budget replaces the stored budget (omitted fields drop out): maxSteps/maxTokens/deadlineMs (integers >= 1) and policy ask|error, same shape as agents_create, at least one field required. Returns { agentId }. agentId accepts an exact id, a unique id prefix (8+ chars), or a name.',
      },
      {
        name: 'agents_delete',
        description:
          'Remove your own delegate that is not running anywhere; project UI manages top-level agents. Returns { removed, name }. agentId accepts an exact id, a unique id prefix (8+ chars), or a name.',
      },
    ],
    skills: [],
    hasSettings: false,
  },
  create: (ctx) => ({
    tools: (() => {
      const params = {
        agents: ctx.ports.agents,
        resolveScope: () => ctx.scope,
        ownDelegatesOnly: ctx.spec.ownDelegatesOnly === true,
      };
      return [
        ...createAgentsTools(params),
        createAgentsHandoffTool(params),
        ...createAgentLifecycleTools(params),
        ...createAgentsRunControlTools(),
      ];
    })(),
    notes: () => [
      {
        tag: 'agent-tools',
        text:
          'Check the existing roster before creating an agent and reuse a suitable agent when possible. Spawned delegates are one-shot and cannot ask the user questions; include their complete bounded task and needed context in the spawn request. ' +
          'A delegate can be pre-approved with permissions on the spawn call or its definition, but never past a gate its parent holds as deny. Verify the returned result before relying on it. Use agents_handoff only to transfer a top-level thread to another top-level agent.',
      },
    ],
  }),
});
