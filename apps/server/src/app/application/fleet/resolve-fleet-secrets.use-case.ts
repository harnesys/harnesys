import {
  ForbiddenException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@harnesys/brix';
import type { ResolveFleetSecretsBody, ResolveFleetSecretsResponse } from '@harnesys/contracts';
import { EventClaimPort } from '../../domain/fleet/event-claim.port.ts';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type NodePrincipal } from '../../domain/identity/principal.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { LEGACY_PROVIDER_SECRET_PREFIX, vaultStorageKey } from '../../domain/secret/vault-keys.ts';
import { SourceOperationGrantPort } from '../../domain/source/source-operation-grant.port.ts';
import { googleCredKey } from '../../infra/integration/google/google-token-access.ts';
import { hashNodeToken } from './hash-node-token.ts';

export interface ResolveFleetSecretsInput {
  orgId: string;
  bearerToken: string;
  body: ResolveFleetSecretsBody;
}

@Injectable()
export class ResolveFleetSecretsUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly claims: EventClaimPort,
    private readonly secrets: SecretStorePort,
    private readonly grants: SourceOperationGrantPort,
  ) {}

  async execute(input: ResolveFleetSecretsInput): Promise<ResolveFleetSecretsResponse> {
    const token = input.bearerToken.trim();
    if (!token) {
      throw new UnauthorizedException('node token required');
    }
    const row = this.nodes.findByTokenHash(input.orgId, hashNodeToken(token));
    if (!row) {
      throw new UnauthorizedException('node unauthorized');
    }
    const principal: NodePrincipal = { kind: 'node', nodeId: row.id, orgId: input.orgId };
    if (!authorize(principal, 'run.execute')) {
      throw new ForbiddenException('run.execute action is required for nodes');
    }
    const allowedNames = this.authorize(input.orgId, row.id, input.body);
    const values = await this.resolveValues(input.orgId, input.body.names, allowedNames);
    return { values };
  }

  private async resolveValues(
    orgId: string,
    names: string[],
    allowedNames: Set<string>,
  ): Promise<Record<string, string>> {
    const values: Record<string, string> = {};
    for (const name of names) {
      if (!allowedNames.has(name) && allowedNames.size > 0) {
        continue;
      }
      const value = await this.lookupSecret(orgId, name);
      if (value !== null) {
        values[name] = value;
      }
    }
    return values;
  }

  private async lookupSecret(orgId: string, name: string): Promise<string | null> {
    if (name.startsWith(LEGACY_PROVIDER_SECRET_PREFIX)) {
      return this.secrets.get(orgId, name);
    }
    const secret = await this.secrets.get(orgId, vaultStorageKey('secret', name));
    if (secret !== null) {
      return secret;
    }
    const variable = await this.secrets.get(orgId, vaultStorageKey('variable', name));
    if (variable !== null) {
      return variable;
    }
    return this.secrets.get(orgId, googleCredKey(name));
  }

  private authorize(orgId: string, nodeId: string, body: ResolveFleetSecretsBody): Set<string> {
    if (body.operationId) {
      const grant = this.grants.consume(orgId, body.operationId, nodeId);
      if (!grant) {
        throw new HttpException(
          403,
          'SECRETS_RESOLVE_FORBIDDEN',
          'Fleet secrets resolve requires a valid source operation grant',
          { operationId: body.operationId, names: body.names },
        );
      }
      return new Set([grant.credRef]);
    }
    const runId = body.runId;
    if (!runId) {
      throw new HttpException(
        403,
        'SECRETS_RESOLVE_FORBIDDEN',
        'Fleet secrets resolve requires active lease ownership',
        { names: body.names },
      );
    }
    const claim = this.claims.findByRun(orgId, runId);
    const now = new Date().toISOString();
    if (!claim || claim.nodeId !== nodeId || claim.doneAt !== null || claim.leaseUntil <= now) {
      throw new HttpException(
        403,
        'SECRETS_RESOLVE_FORBIDDEN',
        'Fleet secrets resolve requires active lease ownership',
        { runId, names: body.names },
      );
    }
    return new Set();
  }
}
