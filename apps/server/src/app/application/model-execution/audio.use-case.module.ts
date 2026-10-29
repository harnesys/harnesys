import { Module } from '@harnesys/brix';
import { AudioModule } from '../../infra/model-execution/audio.module.ts';
import { ProviderModule } from '../../infra/provider/provider.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { ResolveVoicesUseCase } from './resolve-voices.use-case.ts';
import { SynthesizeSpeechUseCase } from './synthesize-speech.use-case.ts';
import { TranscribeAudioUseCase } from './transcribe-audio.use-case.ts';

@Module({
  imports: [AudioModule, ProviderModule, SecretModule],
  providers: [ResolveVoicesUseCase, SynthesizeSpeechUseCase, TranscribeAudioUseCase],
  exports: [ResolveVoicesUseCase, SynthesizeSpeechUseCase, TranscribeAudioUseCase],
})
export class AudioUseCaseModule {}
