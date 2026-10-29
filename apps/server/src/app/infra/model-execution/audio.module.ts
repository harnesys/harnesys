import { Module } from '@harnesys/brix';
import { SpeechPort } from '../../domain/model-execution/speech.port.ts';
import { TranscriptionPort } from '../../domain/model-execution/transcription.port.ts';
import { VoiceCatalogPort } from '../../domain/model-execution/voice-catalog.port.ts';
import { SdkSpeechAdapter } from './sdk-speech.adapter.ts';
import { SdkTranscriptionAdapter } from './sdk-transcription.adapter.ts';
import { SdkVoiceCatalogAdapter } from './sdk-voice-catalog.adapter.ts';

@Module({
  providers: [
    { provide: SpeechPort, useClass: SdkSpeechAdapter },
    { provide: TranscriptionPort, useClass: SdkTranscriptionAdapter },
    { provide: VoiceCatalogPort, useClass: SdkVoiceCatalogAdapter },
  ],
  exports: [SpeechPort, TranscriptionPort, VoiceCatalogPort],
})
export class AudioModule {}
