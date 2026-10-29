import type { CatalogItem, PresetDetail, PresetKind } from '@harnesys/contracts';
import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import type {
  ExecutionProfileRecord,
  ProfileUsage,
} from '../../domain/execution-profile/execution-profile.ts';
import type {
  ModePresetInsert,
  ModePresetPatch,
  ModePresetRecord,
} from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';
import type { LlmModel } from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort } from '../../domain/provider/llm-provider.port.ts';

export class FakePresetCatalog extends PresetCatalogPort {
  readonly items = new Map<string, PresetDetail>();

  list(): CatalogItem[] {
    return [...this.items.values()].map((detail) => detail);
  }

  get(kind: PresetKind, id: string): PresetDetail | null {
    const found = this.items.get(id);
    return found && found.kind === kind ? found : null;
  }
}

export class FakeAgents extends AgentRegistryPort {
  readonly items = new Map<string, AgentRecord>();

  list(orgId: string): AgentRecord[] {
    return [...this.items.values()].filter((record) => record.orgId === orgId);
  }

  findById(orgId: string, id: string): AgentRecord | undefined {
    return this.list(orgId).find((record) => record.id === id);
  }

  findByName(orgId: string, name: string): AgentRecord | undefined {
    return this.list(orgId).find((record) => record.name === name);
  }

  insert(rec: AgentRecord): AgentRecord {
    this.items.set(rec.id, rec);
    return rec;
  }

  update(): AgentRecord {
    throw new Error('not implemented');
  }

  delete(_orgId: string, id: string): void {
    this.items.delete(id);
  }
}

export class FakeModePresets extends ModePresetRegistryPort {
  list(): ModePresetRecord[] {
    return [];
  }

  findById(): ModePresetRecord | undefined {
    return undefined;
  }

  insert(_rec: ModePresetInsert): ModePresetRecord {
    throw new Error('not implemented');
  }

  update(_orgId: string, _id: string, _patch: ModePresetPatch): ModePresetRecord {
    throw new Error('not implemented');
  }

  delete(): void {}
  ensureSeeded(): void {}
}

export class FakeModels extends LlmModelPort {
  constructor(private readonly ids: string[]) {
    super();
  }

  list(): LlmModel[] {
    return this.ids.map(toModel);
  }

  listByProvider(): LlmModel[] {
    return this.list();
  }

  findById(_orgId: string, id: string): LlmModel | undefined {
    return this.ids.includes(id) ? toModel(id) : undefined;
  }

  findByProviderAndName(): LlmModel | undefined {
    return undefined;
  }

  insert(): LlmModel {
    throw new Error('not implemented');
  }

  update(): LlmModel {
    throw new Error('not implemented');
  }

  delete(): void {}
}

function toModel(id: string): LlmModel {
  return {
    id,
    providerId: 'provider-1',
    name: id,
    kind: 'chat',
    metadata: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

export class FakeProfiles extends ExecutionProfilePort {
  list(): ExecutionProfileRecord[] {
    return [];
  }

  findById(): ExecutionProfileRecord | undefined {
    return undefined;
  }

  findByName(): ExecutionProfileRecord | undefined {
    return undefined;
  }

  insert(): ExecutionProfileRecord {
    throw new Error('not implemented');
  }

  update(): ExecutionProfileRecord {
    throw new Error('not implemented');
  }

  setNodes(): ExecutionProfileRecord {
    throw new Error('not implemented');
  }

  removeNodeFromAll(): void {}
  getDefault(): string | undefined {
    return undefined;
  }

  setDefault(): void {}
  delete(): void {}

  ensureLocalDefault(): ExecutionProfileRecord {
    throw new Error('not implemented');
  }

  countUsage(): ProfileUsage {
    throw new Error('not implemented');
  }
}
