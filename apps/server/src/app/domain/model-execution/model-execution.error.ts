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

export interface ModelProviderFailure {
  driver: string;
  model: string;
  status?: number;
  body?: string;
}

export class ModelProviderException extends DomainException {
  constructor(failure: ModelProviderFailure) {
    super(
      'MODEL_PROVIDER_ERROR',
      modelProviderMessage(failure),
      failure,
      modelProviderStatus(failure.status),
    );
  }
}

const MAX_PROVIDER_MESSAGE_LENGTH = 500;

function modelProviderMessage(failure: ModelProviderFailure): string {
  const status = failure.status === undefined ? 'no response' : `HTTP ${failure.status}`;
  const detail = failure.body?.trim();
  const head = `model provider request failed (${failure.driver}/${failure.model}, ${status})`;
  return detail ? `${head}: ${detail.slice(0, MAX_PROVIDER_MESSAGE_LENGTH)}` : head;
}

function modelProviderStatus(status: number | undefined): number {
  return status !== undefined && status >= 400 && status < 500 ? 422 : 502;
}
