import { Injectable } from '@harnesys/brix';
import { UpdateThreadBindingUseCase } from '../../application/threads/update-thread-binding.use-case.ts';
import {
  type TriggerWorkspaceInput,
  TriggerWorkspacePort,
} from '../../domain/thread/trigger-workspace.port.ts';

@Injectable()
export class TriggerWorkspaceAdapter extends TriggerWorkspacePort {
  constructor(private readonly bindings: UpdateThreadBindingUseCase) {
    super();
  }

  apply(input: TriggerWorkspaceInput): boolean {
    return this.bindings.applyTriggerWorkspace({
      orgId: input.orgId,
      threadId: input.threadId,
      workspace: input.workspace,
    });
  }
}
