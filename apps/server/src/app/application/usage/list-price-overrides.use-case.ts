import { Injectable } from '@harnesys/brix';
import type { PriceOverride } from '../../domain/usage/usage-port.ts';
import { UsagePort } from '../../domain/usage/usage-port.ts';

@Injectable()
export class ListPriceOverridesUseCase {
  constructor(private readonly usage: UsagePort) {}

  execute(input: { orgId: string }): PriceOverride[] {
    return this.usage.listPriceOverrides(input.orgId);
  }
}
