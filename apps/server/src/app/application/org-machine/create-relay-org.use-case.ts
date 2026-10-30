import { Injectable, Logger } from '@harnesys/brix';
import type { MachineOrgEntry } from '@harnesys/contracts';
import { ExecutionProfilePort } from '../../domain/execution-profile/execution-profile.port.ts';
import { MembershipRepository } from '../../domain/identity/membership-repository.port.ts';
import { ROLE_PRESETS } from '../../domain/identity/role-presets.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgNameRequiredException } from '../../domain/org/org.error.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { PresetCatalogPort } from '../../domain/presets/preset-catalog.port.ts';
import { CreateAgentFromPresetUseCase } from '../agents/create-agent-from-preset.use-case.ts';
import { EnsureWorkspaceUseCase } from '../source/ensure-workspace.use-case.ts';

const DEFAULT_AGENT_PRESET_ID = 'harnesys/assistant';

export interface CreateRelayOrgInput {
  name: string;
  userId: string;
  workspacePath?: string;
}

@Injectable()
export class CreateRelayOrgUseCase {
  private readonly log: Logger;

  constructor(
    private readonly store: OrgMachineStore,
    private readonly orgDb: OrgDbPort,
    private readonly ensureWorkspace: EnsureWorkspaceUseCase,
    private readonly profiles: ExecutionProfilePort,
    private readonly machineConfig: MachineConfigPort,
    private readonly memberships: MembershipRepository,
    private readonly catalog: PresetCatalogPort,
    private readonly createAgentFromPreset: CreateAgentFromPresetUseCase,
    logger: Logger,
  ) {
    this.log = logger.child('create-relay-org');
  }

  execute(input: CreateRelayOrgInput): MachineOrgEntry {
    const name = input.name.trim();
    if (!name) {
      throw new OrgNameRequiredException();
    }
    const orgId = crypto.randomUUID();
    this.orgDb.bootstrap(orgId, name);
    this.ensureWorkspace.execute(orgId, { localPath: input.workspacePath });
    const host = this.machineConfig.get();
    this.profiles.ensureLocalDefault(orgId, host.id);
    const entry: MachineOrgEntry = { orgId, name, description: '', role: 'relay' };
    this.store.upsert(entry);
    if (this.store.getActive() === null) {
      this.store.setActive(orgId);
    }
    this.memberships.upsert({
      userId: input.userId,
      orgId,
      capabilities: [...ROLE_PRESETS.owner],
      updatedAt: new Date().toISOString(),
    });
    this.seedDefaultAgent(orgId);
    return entry;
  }

  private seedDefaultAgent(orgId: string): void {
    const detail = this.catalog.get('agent', DEFAULT_AGENT_PRESET_ID);
    if (detail?.kind !== 'agent') {
      return;
    }
    try {
      const created = this.createAgentFromPreset.execute({
        orgId,
        body: { presetId: DEFAULT_AGENT_PRESET_ID },
      });
      this.log.info({ orgId, agentId: created.id }, 'default agent seeded');
    } catch (err) {
      this.log.warn({ orgId, err: String(err) }, 'default agent seeding skipped');
    }
  }
}
