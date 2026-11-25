import { Injectable } from '@harnesys/brix';
import type { TriggerScriptRunList } from '@harnesys/contracts';
import { AddonException } from '../../../domain/addons/errors.ts';
import { TriggerInstanceRepositoryPort } from '../../../domain/addons/ports/trigger-instance-repository.port.ts';
import { TriggerScriptRunRepositoryPort } from '../../../domain/addons/ports/trigger-script-run-repository.port.ts';

export interface ListTriggerScriptRunsInput {
  orgId: string;
  addonId: string;
  instanceId: string;
  limit: number;
}

@Injectable()
export class ListTriggerScriptRunsUseCase {
  constructor(
    private readonly triggers: TriggerInstanceRepositoryPort,
    private readonly runs: TriggerScriptRunRepositoryPort,
  ) {}

  execute(input: ListTriggerScriptRunsInput): TriggerScriptRunList {
    const instance = this.triggers.find(input.orgId, input.instanceId);
    if (instance === null || instance.addonId !== input.addonId) {
      throw new AddonException('not_found', 404, `Trigger instance not found: ${input.instanceId}`);
    }
    const rows = this.runs.list(input.orgId, input.instanceId, input.limit);
    return {
      items: rows.map((row) => ({
        id: row.id,
        instanceId: row.instanceId,
        addonId: row.addonId,
        stage: row.stage,
        runId: row.runId,
        status: row.status,
        exitCode: row.exitCode,
        durationMs: row.durationMs,
        cwd: row.cwd,
        gateVerdict: row.gateVerdict,
        summary: row.summary,
        stdout: row.stdout,
        stderr: row.stderr,
        createdAt: row.createdAt,
      })),
    };
  }
}
