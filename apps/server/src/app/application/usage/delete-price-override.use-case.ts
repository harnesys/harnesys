import { Injectable } from '@harnesys/brix';
import { UsagePort } from '../../domain/usage/usage-port.ts';

@Injectable()
export class DeletePriceOverrideUseCase {
  constructor(private readonly usage: UsagePort) {}

  execute(input: { orgId: string; modelId: string }): boolean {
    return this.usage.deletePriceOverride(input.orgId, input.modelId);
  }
}
