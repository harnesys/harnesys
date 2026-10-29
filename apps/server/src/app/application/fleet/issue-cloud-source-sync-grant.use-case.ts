import { randomUUID } from 'node:crypto';
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@harnesys/brix';
import { NodeRepository } from '../../domain/fleet/node-repository.port.ts';
import { SourceWriteLeasePort } from '../../domain/fleet/source-write-lease.port.ts';
import { authorize } from '../../domain/identity/authorize.ts';
import { type NodePrincipal } from '../../domain/identity/principal.ts';
import { IntegrationNotFoundException } from '../../domain/integration/integration.error.ts';
import { IntegrationRegistryPort } from '../../domain/integration/integration-registry.port.ts';
import { SourceNotFoundException } from '../../domain/source/source.error.ts';
import { SourceMaterializationPort } from '../../domain/source/source-materialization.port.ts';
import { SourceOperationGrantPort } from '../../domain/source/source-operation-grant.port.ts';
import { SourceRegistryPort } from '../../domain/source/source-registry.port.ts';
import { hashNodeToken } from './hash-node-token.ts';

const GRANT_TTL_MS = 60_000;

export interface IssueCloudSourceSyncGrantInput {
  orgId: string;
  bearerToken: string;
  sourceId: string;
}

export interface IssueCloudSourceSyncGrantResult {
  operationId: string;
  secretName: string;
}

@Injectable()
export class IssueCloudSourceSyncGrantUseCase {
  constructor(
    private readonly nodes: NodeRepository,
    private readonly sources: SourceRegistryPort,
    private readonly integrations: IntegrationRegistryPort,
    private readonly materializations: SourceMaterializationPort,
    private readonly grants: SourceOperationGrantPort,
    private readonly writeLeases: SourceWriteLeasePort,
  ) {}

  execute(input: IssueCloudSourceSyncGrantInput): IssueCloudSourceSyncGrantResult {
    const node = this.nodes.findByTokenHash(input.orgId, hashNodeToken(input.bearerToken.trim()));
    if (!node) {
      throw new UnauthorizedException('node unauthorized');
    }
    const principal: NodePrincipal = { kind: 'node', nodeId: node.id, orgId: input.orgId };
    if (!authorize(principal, 'source.materialize')) {
      throw new ForbiddenException('source.materialize action is required for nodes');
    }
    const source = this.sources.findById(input.orgId, input.sourceId);
    if (source?.distribution.kind !== 'cloud-drive') {
      throw new SourceNotFoundException(input.sourceId);
    }
    const integration = this.integrations.findById(input.orgId, source.distribution.integrationId);
    if (!integration) {
      throw new IntegrationNotFoundException(input.orgId, source.distribution.integrationId);
    }
    const materialization = this.materializations.findProjection(
      input.orgId,
      input.sourceId,
      node.id,
    );
    if (materialization?.state !== 'ready') {
      throw new UnauthorizedException('cloud source is not materialized on this node');
    }
    const operationId = randomUUID();
    const lease = this.writeLeases.acquire({
      orgId: input.orgId,
      sourceId: source.id,
      runId: operationId,
      nodeId: node.id,
      expiresAt: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
    });
    if (!lease.ok) {
      throw new ConflictException('cloud source sync is already in progress');
    }
    try {
      this.grants.create({
        operationId,
        orgId: input.orgId,
        nodeId: node.id,
        sourceId: source.id,
        credRef: integration.credRef,
        expiresAt: new Date(Date.now() + GRANT_TTL_MS).toISOString(),
      });
    } catch (err) {
      this.writeLeases.release(input.orgId, source.id, operationId);
      throw err;
    }
    return { operationId, secretName: integration.credRef };
  }
}
