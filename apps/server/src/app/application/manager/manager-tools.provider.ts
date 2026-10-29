import { Injectable, type ModuleInitHook } from '@harnesys/brix';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { ApprovalStorePort } from '../../domain/approval/approval-store.port.ts';
import { IssueBoardRepositoryPort } from '../../domain/issue/board-repository.port.ts';
import { IssueRepositoryPort } from '../../domain/issue/issue-repository.port.ts';
import { ManagerTailPort } from '../../domain/manager/manager-tail.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { UsagePort } from '../../domain/usage/usage-port.ts';
import { setManagerToolsDeps } from '../../infra/runtime/packs/manager-tools.holder.ts';
import type { OrgManagerDeps } from '../../infra/runtime/packs/org-manager.port.ts';

@Injectable()
export class ManagerToolsProvider implements ModuleInitHook {
  constructor(
    private readonly agents: AgentRegistryPort,
    private readonly threads: ThreadRepositoryPort,
    private readonly usage: UsagePort,
    private readonly approvals: ApprovalStorePort,
    private readonly issues: IssueRepositoryPort,
    private readonly boards: IssueBoardRepositoryPort,
    private readonly tail: ManagerTailPort,
    private readonly orgSettings: OrgSettingsPort,
  ) {}

  onModuleInit(): void {
    const deps: OrgManagerDeps = {
      agents: this.agents,
      threads: this.threads,
      usage: this.usage,
      approvals: this.approvals,
      issues: this.issues,
      boards: this.boards,
      tail: this.tail,
      orgSettings: this.orgSettings,
    };
    setManagerToolsDeps(deps);
  }
}
