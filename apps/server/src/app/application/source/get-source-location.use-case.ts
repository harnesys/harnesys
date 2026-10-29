import { Injectable } from '@harnesys/brix';
import type { SourceLocationResponse } from '@harnesys/contracts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';

export interface GetSourceLocationInput {
  orgId: string;
  sourceId: string;
  hostId?: string;
}

@Injectable()
export class GetSourceLocationUseCase {
  constructor(
    private readonly sourceLocation: SourceLocationPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly machineConfig: MachineConfigPort,
  ) {}

  execute(input: GetSourceLocationInput): SourceLocationResponse {
    const hostId = input.hostId ?? this.machineConfig.get().id;
    const location = this.sourceLocation.resolve({
      orgId: input.orgId,
      sourceId: input.sourceId,
      hostId,
    });
    const materialization = this.materializations.find(input.orgId, input.sourceId, hostId);
    return {
      absoluteRoot: location.absoluteRoot,
      state: materialization?.state ?? 'ready',
      revision: materialization?.revision ?? 0,
    };
  }
}
