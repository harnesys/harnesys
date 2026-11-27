import { mkdirSync } from 'node:fs';
import { Inject, Injectable, Logger } from '@harnesys/brix';
import { resolveRunEnvironment } from '../../application/threads/resolve-run-environment.ts';
import { AgentRegistryPort } from '../../domain/agent/agent-registry.port.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { RepositoryWorktreePort } from '../../domain/source/repository-worktree.port.ts';
import { SourceLocationPort } from '../../domain/source/source-location.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { resolveRuntimePrimary } from '../../domain/thread/prepare-runtime-input.ts';
import { type ResolveRunCwdInput, RunCwdResolverPort } from '../../domain/thread/run-cwd.port.ts';
import { ThreadAgentRepositoryPort } from '../../domain/thread/thread-agent-repository.port.ts';
import { ThreadRepositoryPort } from '../../domain/thread/thread-repository.port.ts';
import { isDirectory } from '../runtime/prepare-org-target-parts.ts';

@Injectable()
export class RunCwdResolverAdapter extends RunCwdResolverPort {
  private readonly logger: Logger;

  constructor(
    private readonly threads: ThreadRepositoryPort,
    private readonly threadAgents: ThreadAgentRepositoryPort,
    private readonly agents: AgentRegistryPort,
    private readonly sources: SourceRegistryPort,
    private readonly worktrees: RepositoryWorktreePort,
    private readonly layout: HostFsLayoutPort,
    private readonly machineConfig: MachineConfigPort,
    private readonly sourceLocation: SourceLocationPort,
    @Inject(Logger) logger: Logger,
  ) {
    super();
    this.logger = logger.child('run-cwd');
  }

  override resolve(input: ResolveRunCwdInput): string | null {
    const thread = this.threads.findById(input.orgId, input.threadId);
    if (!thread) {
      return null;
    }
    const agentId = this.threadAgents.listByThread(input.orgId, input.threadId)[0]?.agentId;
    if (!agentId) {
      return null;
    }
    const hostId = this.machineConfig.get().id;
    try {
      const environment = resolveRunEnvironment(
        {
          orgId: input.orgId,
          threads: this.threads,
          agents: this.agents,
          sources: this.sources,
          worktrees: this.worktrees,
          layout: this.layout,
          localHostId: hostId,
        },
        { threadId: input.threadId, agentId, issue: thread.kind === 'issue' },
      );
      const primary = resolveRuntimePrimary(
        {
          orgId: input.orgId,
          threadId: input.threadId,
          layout: this.layout,
          localHostId: hostId,
          sourceLocation: this.sourceLocation,
        },
        { environment },
      );
      if (primary.primaryKind === 'sandbox') {
        mkdirSync(primary.threadSandbox, { recursive: true, mode: 0o700 });
        return primary.primaryDirectory;
      }
      if (
        environment.subpath !== undefined &&
        (primary.primaryKind === 'source' || primary.primaryKind === 'worktree') &&
        !isDirectory(primary.primaryDirectory)
      ) {
        mkdirSync(primary.primaryDirectory, { recursive: true });
      }
      return isDirectory(primary.primaryDirectory) ? primary.primaryDirectory : null;
    } catch (error) {
      this.logger.warn(
        {
          orgId: input.orgId,
          threadId: input.threadId,
          error: error instanceof Error ? error.message : String(error),
        },
        'run cwd resolution failed',
      );
      return null;
    }
  }
}
