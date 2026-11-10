import { Injectable } from '@harnesys/brix';
import type { PackRegistration } from 'harnesys';
import { PackRegistryPort } from '../../../domain/capabilities/pack-registry.port.ts';
import { CORE_PACKS } from './core-packs.ts';

@Injectable()
export class CorePackRegistryAdapter extends PackRegistryPort {
  private readonly byName = new Map<string, PackRegistration>();

  constructor() {
    super();
    for (const entry of CORE_PACKS) {
      this.byName.set(entry.name, entry.register());
    }
  }

  override register(name: string, registration: PackRegistration): void {
    this.byName.set(name, registration);
  }

  override registrations(): PackRegistration[] {
    return [...this.byName.values()];
  }

  override find(name: string): PackRegistration | undefined {
    return this.byName.get(name);
  }
}
