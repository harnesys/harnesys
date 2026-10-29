import { Injectable } from '@harnesys/brix';
import type {
  AgentHook,
  AgentHookEffect,
  HookDiagnostic,
  HookRunStatus,
  HookTestRequest,
  HookTestResponse,
} from '@harnesys/contracts';
import type { HookPayload, HookRuntimeCtx, PermissionMap } from 'harnesys';
import { callModel, hookGateStatus, runHookHandler } from 'harnesys';
import { AgentValidationException } from '../../domain/agent/agent.error.ts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { createOrgModelsPort } from '../../infra/runtime/org-models.port.ts';
import { requireAgent } from '../agents/agent.helpers.ts';
import { validateAgentHooks } from '../agents/agent-hooks.validation.ts';

export interface TestAgentHookRequest {
  orgId: string;
  agentId: string;
  body: HookTestRequest;
}

const DRY_RUN_TIMEOUT_S = 10;
const DRY_RUN_MAX_TIMEOUT_S = 60;
const OUTPUT_MAX = 4000;

@Injectable()
export class TestAgentHookUseCase {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly sources: SourceRegistryPort,
    private readonly sourceLocation: SourceLocationPort,
  ) {}

  async execute(request: TestAgentHookRequest): Promise<HookTestResponse> {
    const agent = requireAgent(this.agents, request.orgId, request.agentId);
    const hook = request.body.hook;
    this.validate(hook, agent, request);
    const gate = hookGateStatus(hook.handler, permissionsOf(agent.config));
    if (gate.status === 'denied') {
      return {
        status: 'denied',
        durationMs: 0,
        effects: [],
        diagnostics: [
          {
            level: 'warning',
            code: 'hook_denied',
            message: gate.reason ?? 'hook is not allowed by agent permissions',
          },
        ],
      };
    }
    const cwd = this.resolveCwd(request.orgId);
    const payload = dryRunPayload(hook, agent, cwd);
    const ctx = this.hookCtx(request.orgId, agent, cwd);
    const timeoutS = Math.min(
      hook.timeoutS ?? DRY_RUN_TIMEOUT_S,
      DRY_RUN_MAX_TIMEOUT_S,
      DRY_RUN_TIMEOUT_S,
    );
    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutS * 1000);
    try {
      const result = await runHookHandler(hook.handler, payload, ctx, {
        pluginRoot: cwd,
        pluginData: cwd,
        projectDir: cwd,
        signal: controller.signal,
      });
      const durationMs = Date.now() - startedAt;
      return {
        status: statusOf(result.effects, result.diagnostics),
        durationMs,
        ...(result.output !== undefined ? { output: result.output.slice(0, OUTPUT_MAX) } : {}),
        effects: result.effects,
        diagnostics: result.diagnostics.map(toDiagnostic),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private resolveCwd(orgId: string): string {
    const managed = this.sources.findManagedWorkspace(orgId);
    if (managed) {
      try {
        return this.sourceLocation.resolve({
          orgId,
          sourceId: managed.id,
          hostId: this.machineConfig.get().id,
        }).absoluteRoot;
      } catch {
        return this.layout.orgWorkspacePath(orgId);
      }
    }
    return this.layout.orgWorkspacePath(orgId);
  }

  private validate(hook: AgentHook, agent: AgentRecord, request: TestAgentHookRequest): void {
    const result = validateAgentHooks([hook], {
      agentId: request.agentId,
      mcpServers: agent.mcpServers,
      agentIds: this.agents.list(request.orgId).map((item) => item.id),
    });
    if (!result.ok) {
      throw new AgentValidationException('invalid agent hook', { issues: result.issues });
    }
  }

  private hookCtx(orgId: string, agent: AgentRecord, cwd: string): HookRuntimeCtx {
    const models = createOrgModelsPort(orgId, this.providers, this.models, this.secrets);
    return {
      cwd,
      projectDir: cwd,
      envBase: { PATH: process.env.PATH ?? '' },
      promptModel: async (prompt: string, model?: string): Promise<string> => {
        const coords = this.resolveCoords(orgId, agent, model);
        const binding = await models.get(coords.provider, coords.model);
        const stream = callModel({
          binding,
          prompt: '',
          messages: [{ role: 'user', content: prompt }],
          toolNames: [],
          signalOrRegistry: undefined,
        });
        let text = '';
        for await (const chunk of stream) {
          if (chunk.type === 'completed') {
            text = chunk.text ?? '';
          }
        }
        return text;
      },
    };
  }

  private resolveCoords(
    orgId: string,
    agent: AgentRecord,
    model: string | undefined,
  ): { provider: string; model: string } {
    const trimmed = model?.trim() ?? '';
    if (trimmed.includes('/')) {
      const slash = trimmed.indexOf('/');
      return { provider: trimmed.slice(0, slash), model: trimmed.slice(slash + 1) };
    }
    const record = this.models.findById(orgId, agent.modelId);
    const provider =
      record === undefined ? undefined : this.providers.findById(orgId, record.providerId);
    if (record === undefined || provider === undefined) {
      throw new AgentValidationException('agent model is not resolvable for dry run');
    }
    return { provider: provider.name, model: trimmed === '' ? record.name : trimmed };
  }
}

function dryRunPayload(hook: AgentHook, agent: AgentRecord, cwd: string): HookPayload {
  return {
    event: hook.event,
    session_id: '',
    run_id: '',
    agent_id: agent.id,
    thread_id: '',
    cwd,
    permission_mode: '',
    source: 'startup',
    trigger: 'manual',
    ...(hook.matcher !== undefined ? { tool_name: hook.matcher } : {}),
  };
}

function permissionsOf(config: Record<string, unknown>): PermissionMap | undefined {
  const raw = config.permissionsJson ?? config.permissions;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const out: PermissionMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (value === 'allow' || value === 'ask' || value === 'deny') {
      out[key] = value;
    }
  }
  return out;
}

function statusOf(effects: AgentHookEffect[], diagnostics: HookDiagnostic[]): HookRunStatus {
  if (effects.some((effect) => effect.kind === 'block')) {
    return 'blocked';
  }
  const first = diagnostics[0];
  if (first !== undefined) {
    return first.code === 'hook_timeout' ? 'timeout' : 'failed';
  }
  return 'ok';
}

function toDiagnostic(diagnostic: {
  level: string;
  code: string;
  message: string;
}): HookDiagnostic {
  return {
    level: diagnostic.level === 'error' ? 'error' : 'warning',
    code: diagnostic.code,
    message: diagnostic.message,
  };
}
