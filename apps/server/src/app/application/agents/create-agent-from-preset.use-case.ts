import { Injectable } from '@harnesys/brix';
import type { AgentPresetBody, AgentPublic, CreateAgentFromPresetBody } from '@harnesys/contracts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { PresetNotFoundException } from '../../domain/presets/preset.error.ts';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';
import { uniqueAgentName } from './agent.helpers.ts';
import { CreateAgentUseCase } from './create-agent.use-case.ts';
import { DEFAULT_REACT_BUDGET } from './react-preset.ts';

const PRESET_DELEGATES: Record<string, readonly string[]> = {
  'harnesys/assistant': ['harnesys/explorer', 'harnesys/general'],
  'harnesys/orchestrator': ['harnesys/explorer', 'harnesys/general'],
};

export interface CreateAgentFromPresetRequest {
  orgId: string;
  body: CreateAgentFromPresetBody;
}

@Injectable()
export class CreateAgentFromPresetUseCase {
  constructor(
    private readonly catalog: PresetCatalogPort,
    private readonly agents: AgentRegistryPort,
    private readonly createAgent: CreateAgentUseCase,
  ) {}

  execute(request: CreateAgentFromPresetRequest): AgentPublic {
    const preset = this.loadPreset(request.body.presetId);

    const parentId = request.body.parentId ?? null;
    const created = this.createAgent.execute({
      orgId: request.orgId,
      body: this.buildBody(request.orgId, preset, parentId, request.body),
    });

    if (parentId) {
      return created;
    }

    const childPresetIds = PRESET_DELEGATES[request.body.presetId] ?? [];
    if (childPresetIds.length === 0) {
      return created;
    }

    try {
      for (const childPresetId of childPresetIds) {
        const childPreset = this.loadPreset(childPresetId);
        this.createAgent.execute({
          orgId: request.orgId,
          body: this.buildBody(request.orgId, childPreset, created.id, {
            presetId: childPresetId,
            modelId: request.body.modelId,
          }),
        });
      }
    } catch (err) {
      for (const child of this.agents.list(request.orgId)) {
        if (child.parentId === created.id) {
          this.agents.delete(request.orgId, child.id);
        }
      }
      this.agents.delete(request.orgId, created.id);
      throw err;
    }

    return created;
  }

  private loadPreset(presetId: string): AgentPresetBody {
    const detail = this.catalog.get('agent', presetId);
    if (detail?.kind !== 'agent') {
      throw new PresetNotFoundException(presetId);
    }
    return detail.body;
  }

  private buildBody(
    orgId: string,
    preset: AgentPresetBody,
    parentId: string | null,
    request: CreateAgentFromPresetBody,
  ) {
    const name = uniqueAgentName(
      this.agents,
      orgId,
      parentId ? preset.name : request.name?.trim() || preset.name,
    );
    const modelId = request.modelId?.trim() || 'stub';
    const budget = preset.budget ?? DEFAULT_REACT_BUDGET;
    return {
      name,
      role: preset.role,
      instructions: preset.instructions,
      modelId,
      level: parentId ? ('delegate' as const) : ('top' as const),
      parentId,
      skills: preset.skills ?? [],
      mcpServers: preset.mcpServers ?? [],
      config: {
        ...(preset.graph !== undefined ? { graphJson: preset.graph } : {}),
        budgetJson: budget,
        ...(preset.capabilities !== undefined ? { capabilitiesJson: preset.capabilities } : {}),
        ...(preset.permissions !== undefined ? { permissionsJson: preset.permissions } : {}),
      },
    };
  }
}
