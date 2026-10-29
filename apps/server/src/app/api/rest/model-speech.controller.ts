import { Body, Controller, Param, Post } from '@harnesys/brix';
import type { z } from 'zod';
import { SynthesizeSpeechUseCase } from '../../application/model-execution/synthesize-speech.use-case.ts';
import { speechBody } from './model-speech.schema.ts';

@Controller('orgs/:orgId/model-execution')
export class ModelSpeechController {
  constructor(private readonly synthesizeSpeech: SynthesizeSpeechUseCase) {}

  @Post('speech')
  async synthesize(
    @Param('orgId') orgId: string,
    @Body(speechBody) body: z.infer<typeof speechBody>,
  ): Promise<Response> {
    const result = await this.synthesizeSpeech.execute({
      orgId,
      provider: body.provider,
      model: body.model,
      text: body.text,
      voice: body.voice,
    });
    return new Response(result.audio, {
      headers: { 'content-type': result.mimeType },
    });
  }
}
