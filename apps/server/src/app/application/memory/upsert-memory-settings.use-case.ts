import { Injectable } from '@harnesys/brix';
import { MemorySettingsValidationException } from '../../domain/agent/agent-memory.error.ts';
import { OrgMemorySettingsPort } from '../../domain/agent/agent-memory.port.ts';
import { LlmModelPort } from '../../domain/provider/llm-provider.port.ts';
import {
  GetMemoryStatusUseCase,
  type MemoryEmbeddingsStatus,
} from './get-memory-status.use-case.ts';

export interface UpsertMemorySettingsRequest {
  orgId: string;
  embedModelId?: string | null;
  decisionModelId?: string | null;
}

@Injectable()
export class UpsertMemorySettingsUseCase {
  constructor(
    private readonly models: LlmModelPort,
    private readonly settings: OrgMemorySettingsPort,
    private readonly status: GetMemoryStatusUseCase,
  ) {}

  async execute(request: UpsertMemorySettingsRequest): Promise<MemoryEmbeddingsStatus> {
    if (request.embedModelId !== undefined) {
      const modelId = await this.resolvePinnedModelId(request.orgId, request.embedModelId, 'embed');
      await this.settings.setEmbedModelId(request.orgId, modelId ?? null);
    }
    if (request.decisionModelId !== undefined) {
      const modelId = await this.resolvePinnedModelId(
        request.orgId,
        request.decisionModelId,
        'decision',
      );
      await this.settings.setDecisionModelId(request.orgId, modelId ?? null);
    }
    return this.status.execute(request.orgId);
  }

  private async resolvePinnedModelId(
    orgId: string,
    rawModelId: string | null,
    kind: string,
  ): Promise<string | undefined> {
    const modelId = rawModelId?.trim() ?? '';
    if (modelId === '') {
      return undefined;
    }
    const record = this.models.findById(orgId, modelId);
    if (!record) {
      throw new MemorySettingsValidationException(`model not found: ${modelId}`);
    }
    if (record.kind !== kind) {
      throw new MemorySettingsValidationException(
        `model ${record.name} is not a ${kind} model (kind "${record.kind}")`,
      );
    }
    return record.id;
  }
}
