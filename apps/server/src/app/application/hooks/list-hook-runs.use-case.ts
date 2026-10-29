import { Injectable } from '@harnesys/brix';
import type { HookRunListResponse } from '@harnesys/contracts';
import { HookRunStorePort, hookRunLimitOf } from '../../domain/agent/hook-run-store.port.ts';

export interface ListHookRunsRequest {
  orgId: string;
  agentId: string;
  limit?: number;
}

@Injectable()
export class ListHookRunsUseCase {
  constructor(private readonly hookRuns: HookRunStorePort) {}

  execute(request: ListHookRunsRequest): HookRunListResponse {
    return {
      items: this.hookRuns.list(request.orgId, request.agentId, hookRunLimitOf(request.limit)),
    };
  }
}
