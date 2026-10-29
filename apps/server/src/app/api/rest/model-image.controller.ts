import { Body, Controller, HttpCode, Param, Post } from '@harnesys/brix';
import type { z } from 'zod';
import { GenerateImageUseCase } from '../../application/model-execution/generate-image.use-case.ts';
import type { ImageGenerationResult } from '../../domain/model-execution/image.port.ts';
import { generateImageBody } from './model-image.schema.ts';

@Controller('orgs/:orgId/model-execution')
export class ModelImageController {
  constructor(private readonly generateImage: GenerateImageUseCase) {}

  @Post('image')
  @HttpCode(200)
  generate(
    @Param('orgId') orgId: string,
    @Body(generateImageBody) body: z.infer<typeof generateImageBody>,
  ): Promise<ImageGenerationResult> {
    return this.generateImage.execute({
      orgId,
      provider: body.provider,
      model: body.model,
      prompt: body.prompt,
      size: body.size,
    });
  }
}
