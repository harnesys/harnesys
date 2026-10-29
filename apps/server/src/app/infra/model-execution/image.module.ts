import { Module } from '@harnesys/brix';
import { ImagePort } from '../../domain/model-execution/image.port.ts';
import { SdkImageAdapter } from './sdk-image.adapter.ts';

@Module({
  providers: [{ provide: ImagePort, useClass: SdkImageAdapter }],
  exports: [ImagePort],
})
export class ImageModule {}
