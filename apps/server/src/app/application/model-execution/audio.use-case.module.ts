import { Module } from '@harnesys/brix';
import { ResolveVoicesUseCase } from './resolve-voices.use-case.ts';
import { SynthesizeSpeechUseCase } from './synthesize-speech.use-case.ts';
import { TranscribeAudioUseCase } from './transcribe-audio.use-case.ts';

@Module({
  providers: [ResolveVoicesUseCase, SynthesizeSpeechUseCase, TranscribeAudioUseCase],
  exports: [ResolveVoicesUseCase, SynthesizeSpeechUseCase, TranscribeAudioUseCase],
})
export class AudioUseCaseModule {}
