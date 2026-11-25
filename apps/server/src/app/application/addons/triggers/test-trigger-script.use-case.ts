import { Inject, Injectable, Logger } from '@harnesys/brix';
import type { TriggerScriptTestRequest, TriggerScriptTestResponse } from '@harnesys/contracts';
import { AddonException } from '../../../domain/addons/errors.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { RunTriggerScriptsUseCase } from './run-trigger-scripts.use-case.ts';
import { evaluateGate, scriptStatusOf } from './trigger-script-policy.ts';
import { TriggerScriptProcessPort } from './trigger-script-process.port.ts';

const OUTPUT_MAX = 4000;

export interface TestTriggerScriptInput {
  orgId: string;
  addonId: string;
  instanceId: string;
  body: TriggerScriptTestRequest;
}

@Injectable()
export class TestTriggerScriptUseCase {
  private readonly logger: Logger;

  constructor(
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly scripts: RunTriggerScriptsUseCase,
    private readonly process: TriggerScriptProcessPort,
    @Inject(Logger) logger: Logger,
  ) {
    this.logger = logger.child('addon-trigger-script-test');
  }

  async execute(input: TestTriggerScriptInput): Promise<TriggerScriptTestResponse> {
    const instance = this.triggers.find(input.orgId, input.instanceId);
    if (instance === null || instance.addonId !== input.addonId) {
      throw new AddonException('not_found', 404, `Trigger instance not found: ${input.instanceId}`);
    }
    const threadId = threadIdOf(instance.targetJson);
    if (threadId === null) {
      throw new AddonException('invalid_params', 422, 'trigger has no target thread');
    }
    const cwd = this.scripts.resolveCwd({ orgId: input.orgId, threadId });
    if (cwd === null) {
      throw new AddonException('invalid_params', 422, 'trigger workspace is not available');
    }
    const firedAt = new Date().toISOString();
    const result = await this.process.run({
      script: input.body.script,
      cwd,
      stdin: JSON.stringify({
        kind: 'trigger-script',
        stage: 'pre',
        triggerId: instance.triggerId,
        threadId,
        workspace: cwd,
        firedAt,
        test: true,
      }),
      env: {
        HARNESYS_STAGE: 'pre',
        HARNESYS_WORKSPACE: cwd,
        HARNESYS_TRIGGER_ID: instance.triggerId,
      },
    });
    const gateVerdict = input.body.gate ? evaluateGate(input.body.gate, result) : 'not-applied';
    const status = gateVerdict === 'unmatched' ? 'skipped' : scriptStatusOf(result);
    this.logger.debug(
      { orgId: input.orgId, instanceId: input.instanceId, status, cwd },
      'trigger script test finished',
    );
    return {
      status,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      cwd,
      gateVerdict,
      stdout: result.stdout.slice(0, OUTPUT_MAX),
      stderr: result.stderr.slice(0, OUTPUT_MAX),
    };
  }
}

function threadIdOf(targetJson: string): string | null {
  try {
    const parsed: unknown = JSON.parse(targetJson);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    const threadId = (parsed as Record<string, unknown>).threadId;
    return typeof threadId === 'string' && threadId.length > 0 ? threadId : null;
  } catch {
    return null;
  }
}
