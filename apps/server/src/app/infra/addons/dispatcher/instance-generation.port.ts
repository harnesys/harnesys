import { Injectable } from '@harnesys/brix';

export abstract class InstanceGenerationPort {
  abstract current(orgId: string, addonId: string): number | null;
}

@Injectable()
export class NoopInstanceGeneration extends InstanceGenerationPort {
  current(): number | null {
    return null;
  }
}
