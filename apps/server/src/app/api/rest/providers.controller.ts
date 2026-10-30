import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@harnesys/brix';
import type {
  ImportProvidersSummary,
  ProviderExportBundle,
  ProviderModelPublic,
  ProviderPublic,
} from '@harnesys/studio-shared';
import type { DiscoveredModel } from 'harnesys';
import type { z } from 'zod';
import { CreateProviderUseCase } from '../../application/providers/create-provider.use-case.ts';
import { CreateProviderModelUseCase } from '../../application/providers/create-provider-model.use-case.ts';
import { DeleteProviderUseCase } from '../../application/providers/delete-provider.use-case.ts';
import { DeleteProviderModelUseCase } from '../../application/providers/delete-provider-model.use-case.ts';
import { DiscoverProviderModelsUseCase } from '../../application/providers/discover-provider-models.use-case.ts';
import { ExportProvidersUseCase } from '../../application/providers/export-providers.use-case.ts';
import { GetProviderUseCase } from '../../application/providers/get-provider.use-case.ts';
import { ImportProvidersUseCase } from '../../application/providers/import-providers.use-case.ts';
import { ListProvidersUseCase } from '../../application/providers/list-providers.use-case.ts';
import type { OllamaModelInfo } from '../../application/providers/ollama-model-info.use-case.ts';
import { OllamaModelInfoUseCase } from '../../application/providers/ollama-model-info.use-case.ts';
import { UpdateProviderUseCase } from '../../application/providers/update-provider.use-case.ts';
import { UpdateProviderModelUseCase } from '../../application/providers/update-provider-model.use-case.ts';
import {
  createProviderBody,
  createProviderModelBody,
  importProvidersBody,
  ollamaInfoBody,
  updateProviderBody,
  updateProviderModelBody,
} from './provider.body.ts';

@Controller('orgs/:orgId/providers')
export class ProvidersController {
  constructor(
    private readonly listProviders: ListProvidersUseCase,
    private readonly getProvider: GetProviderUseCase,
    private readonly createProvider: CreateProviderUseCase,
    private readonly updateProvider: UpdateProviderUseCase,
    private readonly deleteProvider: DeleteProviderUseCase,
    private readonly exportProviders: ExportProvidersUseCase,
    private readonly importProviders: ImportProvidersUseCase,
    private readonly discoverModels: DiscoverProviderModelsUseCase,
    private readonly createModel: CreateProviderModelUseCase,
    private readonly updateModel: UpdateProviderModelUseCase,
    private readonly deleteModel: DeleteProviderModelUseCase,
    private readonly ollamaModelInfo: OllamaModelInfoUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): Promise<ProviderPublic[]> {
    return this.listProviders.execute({ orgId });
  }

  @Post()
  @HttpCode(201)
  create(
    @Param('orgId') orgId: string,
    @Body(createProviderBody) body: z.infer<typeof createProviderBody>,
  ): Promise<ProviderPublic> {
    return this.createProvider.execute({
      orgId,
      name: body.name,
      driver: body.driver,
      apiUrl: body.apiUrl ?? undefined,
      apiKey: body.apiKey ?? undefined,
      apiKeySecretName: body.apiKeySecretName ?? undefined,
      enabled: body.enabled,
    });
  }

  @Get('export')
  export(@Param('orgId') orgId: string): Promise<ProviderExportBundle> {
    return this.exportProviders.execute({ orgId });
  }

  @Post('import')
  import(
    @Param('orgId') orgId: string,
    @Body(importProvidersBody) body: z.infer<typeof importProvidersBody>,
  ): Promise<ImportProvidersSummary> {
    return this.importProviders.execute({ orgId, providers: body.providers });
  }

  @Get(':id')
  get(@Param('orgId') orgId: string, @Param('id') id: string): Promise<ProviderPublic> {
    return this.getProvider.execute({ orgId, id });
  }

  @Patch(':id')
  update(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(updateProviderBody) body: z.infer<typeof updateProviderBody>,
  ): Promise<ProviderPublic> {
    return this.updateProvider.execute({ orgId, id, ...body });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@Param('orgId') orgId: string, @Param('id') id: string): Promise<void> {
    await this.deleteProvider.execute({ orgId, id });
  }

  @Post(':id/discover')
  async discover(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
  ): Promise<{ found: DiscoveredModel[] }> {
    const found = await this.discoverModels.execute({ orgId, id });
    return { found };
  }

  @Post(':id/ollama-info')
  ollamaInfo(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(ollamaInfoBody) body: z.infer<typeof ollamaInfoBody>,
  ): Promise<OllamaModelInfo> {
    return this.ollamaModelInfo.execute({ orgId, providerId: id, name: body.name });
  }

  @Post(':id/models')
  @HttpCode(201)
  createModelHandler(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Body(createProviderModelBody) body: z.infer<typeof createProviderModelBody>,
  ): ProviderModelPublic {
    return this.createModel.execute({
      orgId,
      providerId: id,
      name: body.name,
      kind: body.kind,
      metadata: body.metadata,
    });
  }

  @Patch(':id/models/:modelId')
  updateModelHandler(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('modelId') modelId: string,
    @Body(updateProviderModelBody) body: z.infer<typeof updateProviderModelBody>,
  ): ProviderModelPublic {
    return this.updateModel.execute({
      orgId,
      providerId: id,
      modelId,
      name: body.name,
      kind: body.kind,
      metadata: body.metadata,
    });
  }

  @Delete(':id/models/:modelId')
  @HttpCode(204)
  deleteModelHandler(
    @Param('orgId') orgId: string,
    @Param('id') id: string,
    @Param('modelId') modelId: string,
  ): void {
    this.deleteModel.execute({ orgId, providerId: id, modelId });
  }
}
