import type { AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { type HostConfig, MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import type { ModePresetPatch, ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';
import type {
  LlmModel,
  LlmModelInsert,
  LlmModelPatch,
  LlmProvider,
  LlmProviderInsert,
  LlmProviderPatch,
} from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import type {
  ResolvedSourceLocation,
  ResolveSourceLocationInput,
} from '../../domain/source/source-location.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import type { SourceRecord } from '../../domain/source/source-registry.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import type { ThreadActiveRun, ThreadRecord } from '../../domain/thread/thread.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';

export function notUsed(): never {
  throw new Error('not used');
}

export class StubMachineConfig extends MachineConfigPort {
  get(): HostConfig {
    return { id: 'host-1', name: 'host', listen: '', token: '' };
  }

  set(): void {}
}

export class MemoryThreads extends ThreadRepositoryPort {
  thread: ThreadRecord | undefined;

  listByOrg(): ThreadRecord[] {
    return [];
  }

  listActiveRuns(): ThreadActiveRun[] {
    return [];
  }

  findActiveRun(): ThreadActiveRun | undefined {
    return undefined;
  }

  findById(): ThreadRecord | undefined {
    return this.thread;
  }

  insert(rec: ThreadRecord): ThreadRecord {
    this.thread = rec;
    return rec;
  }

  patch(): ThreadRecord {
    return notUsed();
  }

  markRead(): ThreadRecord {
    return notUsed();
  }

  updateTitle(): ThreadRecord {
    return notUsed();
  }

  touch(): void {}

  delete(): void {}

  deleteByAgent(): void {}

  listByIssue(): ThreadRecord[] {
    return [];
  }

  findByIssueAndAgent(): ThreadRecord | undefined {
    return undefined;
  }

  threadIdsWithRuns(): Set<string> {
    return new Set();
  }
}

export class MemoryAgents extends AgentRegistryPort {
  agent: AgentRecord | undefined;

  list(): AgentRecord[] {
    return this.agent ? [this.agent] : [];
  }

  findById(): AgentRecord | undefined {
    return this.agent;
  }

  findByName(): AgentRecord | undefined {
    return this.agent;
  }

  insert(rec: AgentRecord): AgentRecord {
    this.agent = rec;
    return rec;
  }

  update(_orgId: string, _id: string, patch: Partial<AgentRecord>): AgentRecord {
    if (!this.agent) {
      throw new Error('missing agent');
    }
    this.agent = { ...this.agent, ...patch };
    return this.agent;
  }

  delete(): void {
    this.agent = undefined;
  }
}

export class MemoryModes extends ModePresetRegistryPort {
  preset: ModePresetRecord | undefined;

  list(): ModePresetRecord[] {
    return this.preset ? [this.preset] : [];
  }

  findById(): ModePresetRecord | undefined {
    return this.preset;
  }

  insert(rec: ModePresetRecord): ModePresetRecord {
    this.preset = rec;
    return rec;
  }

  update(_orgId: string, _id: string, patch: ModePresetPatch): ModePresetRecord {
    if (!this.preset) {
      throw new Error('missing preset');
    }
    this.preset = { ...this.preset, ...patch };
    return this.preset;
  }

  delete(): void {
    this.preset = undefined;
  }

  ensureSeeded(): void {}
}

export class StubSources extends SourceRegistryPort {
  list(): SourceRecord[] {
    return [];
  }

  findById(): SourceRecord | null {
    return null;
  }

  findManagedWorkspace(): SourceRecord | null {
    return null;
  }

  insert(): void {}

  updateVisibility(): void {}

  updateName(): void {}

  updateDistribution(): void {}

  updateVcs(): void {}

  updateAvailability(): void {}

  updateLspJson(): void {}

  remove(): void {}
}

export class StubSourceLocation extends SourceLocationPort {
  constructor(private readonly root: string) {
    super();
  }

  resolve(input: ResolveSourceLocationInput): ResolvedSourceLocation {
    return { sourceId: input.sourceId, hostId: input.hostId, absoluteRoot: this.root };
  }
}

export class MemoryProviders extends LlmProviderPort {
  provider: LlmProvider | undefined = {
    id: 'provider-1',
    orgId: 'org-1',
    name: 'test-provider',
    driver: 'test',
    apiUrl: null,
    apiKey: null,
    headers: {},
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };

  list(): LlmProvider[] {
    return this.provider ? [this.provider] : [];
  }

  findById(): LlmProvider | undefined {
    return this.provider;
  }

  findByName(): LlmProvider | undefined {
    return this.provider;
  }

  insert(rec: LlmProviderInsert): LlmProvider {
    this.provider = rec;
    return rec;
  }

  update(_orgId: string, _id: string, patch: LlmProviderPatch): LlmProvider {
    if (!this.provider) {
      throw new Error('missing provider');
    }
    this.provider = { ...this.provider, ...patch };
    return this.provider;
  }

  delete(): void {
    this.provider = undefined;
  }
}

export class MemoryModels extends LlmModelPort {
  model: LlmModel | undefined = {
    id: 'model-1',
    providerId: 'provider-1',
    name: 'test-model',
    kind: 'chat',
    metadata: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };

  listByProvider(): LlmModel[] {
    return this.model ? [this.model] : [];
  }

  findById(): LlmModel | undefined {
    return this.model;
  }

  findByProviderAndName(): LlmModel | undefined {
    return this.model;
  }

  insert(_orgId: string, rec: LlmModelInsert): LlmModel {
    this.model = rec;
    return rec;
  }

  update(_orgId: string, _id: string, patch: LlmModelPatch): LlmModel {
    if (!this.model) {
      throw new Error('missing model');
    }
    this.model = { ...this.model, ...patch };
    return this.model;
  }

  delete(): void {
    this.model = undefined;
  }
}
