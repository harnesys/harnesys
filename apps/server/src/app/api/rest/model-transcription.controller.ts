import { Body, Controller, Param, Post } from '@harnesys/brix';
import type { z } from 'zod';
import { TranscribeAudioUseCase } from '../../application/model-execution/transcribe-audio.use-case.ts';
import { transcriptionBody } from './model-transcription.schema.ts';

@Controller('orgs/:orgId/model-execution')
export class ModelTranscriptionController {
  constructor(private readonly transcribeAudio: TranscribeAudioUseCase) {}

  @Post('transcription')
  async transcribe(
    @Param('orgId') orgId: string,
    @Body(transcriptionBody) body: z.infer<typeof transcriptionBody>,
  ): Promise<{ text: string; durationInSeconds?: number }> {
    const result = await this.transcribeAudio.execute({
      orgId,
      provider: body.provider,
      model: body.model,
      audioBase64: body.audioBase64,
      mimeType: body.mimeType,
    });
    return { text: result.text, durationInSeconds: result.durationInSeconds };
  }
}
