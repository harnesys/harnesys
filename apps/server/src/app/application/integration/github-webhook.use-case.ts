import { Injectable } from '@harnesys/brix';
import { WebhookSignatureInvalidException } from '../../domain/integration/integration.error.ts';
import { IntegrationEventsPort } from '../../domain/integration/integration-events.port.ts';
import {
  type IntegrationRecord,
  IntegrationRegistryPort,
} from '../../domain/integration/integration-registry.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { GithubAppStore } from '../../infra/integration/github/github-app-store.ts';
import { verifyGithubWebhookSignature } from '../../infra/integration/github/webhook-signature.ts';

const STORED_EVENT_TYPES: ReadonlySet<string> = new Set([
  'push',
  'issues',
  'pull_request',
  'workflow_run',
]);

export interface GithubWebhookInput {
  rawBody: string;
  eventType: string | undefined;
  deliveryId: string | undefined;
  signature: string | undefined;
}

export interface GithubWebhookResult {
  accepted: boolean;
}

@Injectable()
export class GithubWebhookUseCase {
  constructor(
    private readonly orgs: OrgMachineStore,
    private readonly registry: IntegrationRegistryPort,
    private readonly events: IntegrationEventsPort,
    private readonly appStore: GithubAppStore,
  ) {}

  execute(input: GithubWebhookInput): GithubWebhookResult {
    const app = this.appStore.require();
    if (
      !app.webhookSecret ||
      !verifyGithubWebhookSignature({
        secret: app.webhookSecret,
        rawBody: input.rawBody,
        signature: input.signature,
      })
    ) {
      throw new WebhookSignatureInvalidException();
    }
    if (!input.eventType || !STORED_EVENT_TYPES.has(input.eventType)) {
      return { accepted: true };
    }
    const payload = parsePayload(input.rawBody);
    const installationId = installationIdOf(payload);
    if (installationId === null || typeof input.deliveryId !== 'string' || !input.deliveryId) {
      return { accepted: true };
    }
    const match = this.findIntegration(installationId);
    if (!match) {
      return { accepted: true };
    }
    this.events.append({
      orgId: match.orgId,
      integrationId: match.id,
      deliveryId: input.deliveryId,
      eventType: input.eventType,
      payloadJson: input.rawBody,
    });
    return { accepted: true };
  }

  private findIntegration(installationId: number): IntegrationRecord | null {
    for (const org of this.orgs.list()) {
      const record = this.registry
        .list(org.orgId)
        .find(
          (candidate) =>
            candidate.provider === 'github' &&
            candidate.status === 'connected' &&
            candidate.providerJson?.installationId === installationId,
        );
      if (record) {
        return record;
      }
    }
    return null;
  }
}

function parsePayload(raw: string): Record<string, unknown> {
  try {
    const json: unknown = JSON.parse(raw);
    if (json && typeof json === 'object' && !Array.isArray(json)) {
      return json as Record<string, unknown>;
    }
  } catch {
    return {};
  }
  return {};
}

function installationIdOf(payload: Record<string, unknown>): number | null {
  const installation = payload.installation;
  if (!installation || typeof installation !== 'object' || Array.isArray(installation)) {
    return null;
  }
  const value = (installation as Record<string, unknown>).id;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
