import { Module } from '@harnesys/brix';
import { TextGenerationPort } from '../../domain/model-execution/text.port.ts';
import { SdkTextAdapter } from './sdk-text.adapter.ts';

@Module({
  global: true,
  providers: [{ provide: TextGenerationPort, useClass: SdkTextAdapter }],
  exports: [TextGenerationPort],
})
export class TextModule {}
