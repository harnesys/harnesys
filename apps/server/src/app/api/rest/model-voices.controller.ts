import { Controller, Get, Param, Query } from '@harnesys/brix';
import type { z } from 'zod';
import { ResolveVoicesUseCase } from '../../application/model-execution/resolve-voices.use-case.ts';
import { voicesQuery } from './model-voices.schema.ts';

@Controller('orgs/:orgId/model-execution')
export class ModelVoicesController {
  constructor(private readonly resolveVoices: ResolveVoicesUseCase) {}

  @Get('voices')
  async list(
    @Param('orgId') orgId: string,
    @Query(voicesQuery) query: z.infer<typeof voicesQuery>,
  ): Promise<{ voices: Array<{ id: string; name: string }> }> {
    const voices = await this.resolveVoices.execute({
      orgId,
      provider: query.provider,
      model: query.model,
    });
    return { voices };
  }
}
