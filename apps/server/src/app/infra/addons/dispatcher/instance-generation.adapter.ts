import { Injectable } from '@harnesys/brix';
import { InstanceRegistry } from '../supervisor/instance-registry.ts';
import { InstanceGenerationPort } from './instance-generation.port.ts';

@Injectable()
export class InstanceRegistryGenerationAdapter extends InstanceGenerationPort {
  constructor(private readonly registry: InstanceRegistry) {
    super();
  }

  override current(orgId: string, addonId: string): number | null {
    const record = this.registry.get(orgId, addonId);
    return record ? record.generation : null;
  }
}
