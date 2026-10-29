import { DomainException } from '@harnesys/brix';

export class IntegrationException extends DomainException {
  constructor(errorCode: string, message: string, details?: unknown) {
    super(errorCode, message, details);
  }
}

export class IntegrationNotFoundException extends IntegrationException {
  constructor(orgId: string, integrationId: string) {
    super('INTEGRATION_NOT_FOUND', `Integration not found: ${integrationId}`, {
      orgId,
      integrationId,
    });
  }
}

export class IntegrationNotConnectedException extends IntegrationException {
  constructor(orgId: string, integrationId: string) {
    super('INTEGRATION_NOT_CONNECTED', `Integration ${integrationId} is not connected`, {
      orgId,
      integrationId,
    });
  }
}

export class IntegrationTokenRefreshFailedException extends IntegrationException {
  constructor(orgId: string, integrationId: string, cause: string) {
    super(
      'INTEGRATION_TOKEN_REFRESH_FAILED',
      `Token refresh failed for integration ${integrationId}: ${cause}`,
      { orgId, integrationId },
    );
  }
}

export class IntegrationProviderErrorException extends IntegrationException {
  constructor(provider: string, message: string) {
    super('INTEGRATION_PROVIDER_ERROR', `${provider} provider error: ${message}`, { provider });
  }
}

export class IntegrationNotConfiguredException extends IntegrationException {
  constructor(message: string) {
    super('INTEGRATION_NOT_CONFIGURED', message);
  }
}

export class IntegrationScopeMissingException extends IntegrationException {
  constructor(orgId: string, integrationId: string, missing: readonly string[], hint: string) {
    super(
      'INTEGRATION_SCOPE_MISSING',
      `Connection ${integrationId} is missing Google scopes: ${missing.join(', ')}. ${hint}`,
      { orgId, integrationId, missing: [...missing] },
    );
  }
}

export class GithubAppNotConfiguredException extends IntegrationException {
  constructor() {
    super(
      'INTEGRATION_GITHUB_APP_NOT_CONFIGURED',
      'GitHub App is not configured on this server (HARNESYS_GITHUB_APP_* env)',
    );
  }
}

export class WebhookSignatureInvalidException extends IntegrationException {
  constructor() {
    super('INTEGRATION_WEBHOOK_SIGNATURE_INVALID', 'GitHub webhook signature verification failed');
  }
}
