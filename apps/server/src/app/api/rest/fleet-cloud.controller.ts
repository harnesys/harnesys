import { Body, Controller, HttpCode, Post, Public } from '@harnesys/brix';
import {
  type IssueCloudSourceSyncGrantResult,
  IssueCloudSourceSyncGrantUseCase,
} from '../../application/fleet/issue-cloud-source-sync-grant.use-case.ts';
import { ReleaseCloudSourceSyncGrantUseCase } from '../../application/fleet/release-cloud-source-sync-grant.use-case.ts';
import { BearerToken, OrgIdHeader } from '../org-id.ts';
import {
  type CloudSourceSyncCompleteBody,
  CloudSourceSyncCompleteBodySchema,
  type CloudSourceSyncGrantBody,
  CloudSourceSyncGrantBodySchema,
} from './fleet-cloud.schema.ts';

@Controller('fleet/cloud-sync')
export class FleetCloudController {
  constructor(
    private readonly issueGrant: IssueCloudSourceSyncGrantUseCase,
    private readonly releaseGrant: ReleaseCloudSourceSyncGrantUseCase,
  ) {}

  @Public()
  @Post('grant')
  grant(
    @OrgIdHeader() orgId: string,
    @BearerToken() token: string,
    @Body(CloudSourceSyncGrantBodySchema) body: CloudSourceSyncGrantBody,
  ): IssueCloudSourceSyncGrantResult {
    return this.issueGrant.execute({ orgId, bearerToken: token, sourceId: body.sourceId });
  }

  @Public()
  @Post('complete')
  @HttpCode(204)
  complete(
    @OrgIdHeader() orgId: string,
    @BearerToken() token: string,
    @Body(CloudSourceSyncCompleteBodySchema) body: CloudSourceSyncCompleteBody,
  ): void {
    this.releaseGrant.execute({
      orgId,
      bearerToken: token,
      sourceId: body.sourceId,
      operationId: body.operationId,
    });
  }
}
