import { Injectable } from '@harnesys/brix';
import { LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { requireProvider } from './provider.helpers.ts';
import { ProviderKeys } from './provider-keys.ts';

export interface DeleteProviderRequest {
  orgId: string;
  id: string;
}

@Injectable()
export class DeleteProviderUseCase {
  constructor(
    private readonly providers: LlmProviderPort,
    private readonly keys: ProviderKeys,
  ) {}

  async execute(request: DeleteProviderRequest): Promise<void> {
    requireProvider(this.providers, request.orgId, request.id);
    this.providers.delete(request.orgId, request.id);

    await this.keys.writeApiKey(request.orgId, request.id, null);
  }
}
