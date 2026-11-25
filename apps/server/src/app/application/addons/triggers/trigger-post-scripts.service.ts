import {
  Inject,
  Injectable,
  Logger,
  type ModuleDestroyHook,
  type ModuleInitHook,
} from '@harnesys/brix';
import { TriggerScriptRunRepositoryPort } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';
import {
  ThreadEventsPort,
  type ThreadRunEvent,
} from '../../../domain/thread/thread-events.port.ts';
import { RunTriggerScriptsUseCase, type TriggerRunStatus } from './run-trigger-scripts.use-case.ts';

@Injectable()
export class TriggerPostScriptsService implements ModuleInitHook, ModuleDestroyHook {
  private readonly logger: Logger;
  private unsubscribe: (() => void) | null = null;

  constructor(
    private readonly events: ThreadEventsPort,
    private readonly runs: TriggerScriptRunRepositoryPort,
    private readonly scripts: RunTriggerScriptsUseCase,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addon-trigger-post-scripts');
  }

  onModuleInit(): void {
    this.unsubscribe = this.events.subscribe((orgId, event) => this.onRunEvent(orgId, event));
  }

  onModuleDestroy(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  private onRunEvent(orgId: string, event: ThreadRunEvent): void {
    const terminal = terminalOf(event);
    if (terminal === null) {
      return;
    }
    const pending = this.runs.takePending(orgId, terminal.runId);
    if (pending === null) {
      return;
    }
    void this.scripts.runPost({ pending, runStatus: terminal.status }).catch((error: unknown) => {
      this.logger.warn(
        {
          orgId,
          instanceId: pending.instanceId,
          runId: pending.runId,
          error: error instanceof Error ? error.message : String(error),
        },
        'post trigger script crashed',
      );
    });
  }
}

function terminalOf(event: ThreadRunEvent): { runId: string; status: TriggerRunStatus } | null {
  if (event.type === 'finished') {
    return { runId: event.runId, status: event.status };
  }
  return event.type === 'failed' ? { runId: event.runId, status: 'failed' } : null;
}
