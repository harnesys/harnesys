import { Injectable } from '@harnesys/brix';
import type { ManualPrice } from '../../domain/usage/usage-port.ts';
import { UsagePort } from '../../domain/usage/usage-port.ts';

export interface SetPriceOverrideRequest {
  orgId: string;
  modelId: string;
  inputPer1M: number;
  outputPer1M: number;
}

@Injectable()
export class SetPriceOverrideUseCase {
  constructor(private readonly usage: UsagePort) {}

  execute(request: SetPriceOverrideRequest): ManualPrice {
    const price: ManualPrice = {
      inputPer1M: request.inputPer1M,
      outputPer1M: request.outputPer1M,
    };
    this.usage.setPriceOverride(request.orgId, request.modelId, price);
    return price;
  }
}
