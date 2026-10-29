import { Injectable } from '@harnesys/brix';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { requireModel, requireProvider } from './provider.helpers.ts';

export interface DeleteProviderModelRequest {
  orgId: string;
  providerId: string;
  modelId: string;
}

@Injectable()
export class DeleteProviderModelUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
  ) {}

  execute(request: DeleteProviderModelRequest): void {
    requireProvider(this.providers, request.orgId, request.providerId);
    requireModel(this.models, request.orgId, request.providerId, request.modelId);
    this.models.delete(request.orgId, request.modelId);
  }
}
