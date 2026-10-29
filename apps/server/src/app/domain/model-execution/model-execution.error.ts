import { DomainException } from '@harnesys/brix';

export class UnsupportedCapabilityException extends DomainException {
  constructor(kind: string, driver: string) {
    super('UNSUPPORTED_CAPABILITY', `model kind "${kind}" is not supported for driver "${driver}"`);
  }
}

export class VoiceCatalogUnsupportedException extends DomainException {
  constructor(driver: string) {
    super('VOICE_CATALOG_UNSUPPORTED', `voice catalog is not supported for driver "${driver}"`);
  }
}
