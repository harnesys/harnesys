import type { AgentPatch, AgentRecord } from '../../domain/agent/agent.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import type { ModePresetPatch, ModePresetRecord } from '../../domain/mode-presets/mode-preset.ts';
import { ModePresetRegistryPort } from '../../domain/mode-presets/mode-preset-registry.port.ts';

export class AgentsStub extends AgentRegistryPort {
  agent: AgentRecord | undefined;
  readonly updates: AgentPatch[] = [];

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

  update(_orgId: string, _id: string, patch: AgentPatch): AgentRecord {
    if (!this.agent) {
      throw new Error('missing agent');
    }
    this.updates.push(patch);
    this.agent = { ...this.agent, ...patch };
    return this.agent;
  }

  delete(): void {
    this.agent = undefined;
  }
}

export class ModesStub extends ModePresetRegistryPort {
  preset: ModePresetRecord | undefined;
  readonly updates: ModePresetPatch[] = [];

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
    this.updates.push(patch);
    this.preset = { ...this.preset, ...patch };
    return this.preset;
  }

  delete(): void {
    this.preset = undefined;
  }

  ensureSeeded(): void {}
}
