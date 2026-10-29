import { rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Public,
  Put,
} from '@harnesys/brix';
import {
  type ActiveInvite,
  type ClaimWorkBody,
  ClaimWorkBodySchema,
  type ClaimWorkResponse,
  type ConnectInfo,
  type CreateExecutionProfileBody,
  CreateExecutionProfileBodySchema,
  type EnrollBody,
  EnrollBodySchema,
  type EnrollResponse,
  type ExecutionProfile,
  type ExecutionProfileDetail,
  type ExecutionProfilesResponse,
  type FetchRunAttachmentBody,
  FetchRunAttachmentBodySchema,
  type FleetNodesResponse,
  type HeartbeatBody,
  HeartbeatBodySchema,
  type HeartbeatResponse,
  type IssuedInvite,
  type IssueInviteBody,
  IssueInviteBodySchema,
  type PromoteCompleteBody,
  PromoteCompleteBodySchema,
  type PromoteCompleteResponse,
  type PromoteIdentitySliceResponse,
  type PromoteStartBody,
  PromoteStartBodySchema,
  type PromoteStartResponse,
  type ProxyRequest,
  ProxyRequestSchema,
  type ResolveFleetSecretsBody,
  ResolveFleetSecretsBodySchema,
  type ResolveFleetSecretsResponse,
  type SetDefaultExecutionProfileBody,
  SetDefaultExecutionProfileBodySchema,
  type SetExecutionProfileNodesBody,
  SetExecutionProfileNodesBodySchema,
  type UpdateExecutionProfileBody,
  UpdateExecutionProfileBodySchema,
  type WorkerOrgOperationBody,
  WorkerOrgOperationBodySchema,
  type WorkerOrgOperationResponse,
} from '@harnesys/contracts';
import { CreateExecutionProfileUseCase } from '../../application/execution-profile/create-execution-profile.use-case.ts';
import { DeleteExecutionProfileUseCase } from '../../application/execution-profile/delete-execution-profile.use-case.ts';
import { GetExecutionProfileUseCase } from '../../application/execution-profile/get-execution-profile.use-case.ts';
import { ListExecutionProfilesUseCase } from '../../application/execution-profile/list-execution-profiles.use-case.ts';
import { SetDefaultExecutionProfileUseCase } from '../../application/execution-profile/set-default-execution-profile.use-case.ts';
import { SetExecutionProfileNodesUseCase } from '../../application/execution-profile/set-execution-profile-nodes.use-case.ts';
import { UpdateExecutionProfileUseCase } from '../../application/execution-profile/update-execution-profile.use-case.ts';
import { ClaimWorkUseCase } from '../../application/fleet/claim-work.use-case.ts';
import { ConnectInfoUseCase } from '../../application/fleet/connect-info.use-case.ts';
import { EnrollOnRelayUseCase } from '../../application/fleet/enroll-on-relay.use-case.ts';
import { ExecuteWorkerOrgOperationUseCase } from '../../application/fleet/execute-worker-org-operation.use-case.ts';
import { FetchRunAttachmentUseCase } from '../../application/fleet/fetch-run-attachment.use-case.ts';
import { HeartbeatUseCase } from '../../application/fleet/heartbeat.use-case.ts';
import { IssueInviteUseCase } from '../../application/fleet/issue-invite.use-case.ts';
import { ListFleetNodesUseCase } from '../../application/fleet/list-fleet-nodes.use-case.ts';
import { ListInvitesUseCase } from '../../application/fleet/list-invites.use-case.ts';
import { ResolveFleetSecretsUseCase } from '../../application/fleet/resolve-fleet-secrets.use-case.ts';
import { RevokeInviteUseCase } from '../../application/fleet/revoke-invite.use-case.ts';
import { PromoteRelayUseCase } from '../../application/host/promote-relay.use-case.ts';
import { FleetContentProxyPort } from '../../domain/fleet/fleet-content-proxy.port.ts';
import { BearerToken, OrgIdHeader } from '../org-id.ts';

@Controller('fleet')
export class FleetController {
  constructor(
    private readonly issueInvite: IssueInviteUseCase,
    private readonly listInvites: ListInvitesUseCase,
    private readonly revokeInvite: RevokeInviteUseCase,
    private readonly enrollOnRelay: EnrollOnRelayUseCase,
    private readonly heartbeat: HeartbeatUseCase,
    private readonly listNodes: ListFleetNodesUseCase,
    private readonly connectInfo: ConnectInfoUseCase,
    private readonly promote: PromoteRelayUseCase,
    private readonly resolveSecrets: ResolveFleetSecretsUseCase,
    private readonly claimWork: ClaimWorkUseCase,
    private readonly contentProxy: FleetContentProxyPort,
    private readonly listProfiles: ListExecutionProfilesUseCase,
    private readonly getProfile: GetExecutionProfileUseCase,
    private readonly createProfileUseCase: CreateExecutionProfileUseCase,
    private readonly updateProfileUseCase: UpdateExecutionProfileUseCase,
    private readonly setProfileNodesUseCase: SetExecutionProfileNodesUseCase,
    private readonly setDefaultProfileUseCase: SetDefaultExecutionProfileUseCase,
    private readonly deleteProfileUseCase: DeleteExecutionProfileUseCase,
    private readonly orgOperation: ExecuteWorkerOrgOperationUseCase,
    private readonly fetchAttachment: FetchRunAttachmentUseCase,
  ) {}

  @Get('nodes')
  nodes(@OrgIdHeader() orgId: string): FleetNodesResponse {
    return this.listNodes.execute(orgId);
  }

  @Get('profiles')
  profiles(@OrgIdHeader() orgId: string): ExecutionProfilesResponse {
    return this.listProfiles.execute({ orgId });
  }

  @Get('profiles/:profileId')
  profile(
    @OrgIdHeader() orgId: string,
    @Param('profileId') profileId: string,
  ): ExecutionProfileDetail {
    return this.getProfile.execute({ orgId, profileId });
  }

  @Post('profiles')
  @HttpCode(201)
  createProfile(
    @OrgIdHeader() orgId: string,
    @Body(CreateExecutionProfileBodySchema) body: CreateExecutionProfileBody,
  ): ExecutionProfile {
    return this.createProfileUseCase.execute({ orgId, body });
  }

  @Patch('profiles/:profileId')
  updateProfile(
    @OrgIdHeader() orgId: string,
    @Param('profileId') profileId: string,
    @Body(UpdateExecutionProfileBodySchema) body: UpdateExecutionProfileBody,
  ): ExecutionProfile {
    return this.updateProfileUseCase.execute({ orgId, profileId, body });
  }

  @Put('profiles/:profileId/nodes')
  setProfileNodes(
    @OrgIdHeader() orgId: string,
    @Param('profileId') profileId: string,
    @Body(SetExecutionProfileNodesBodySchema) body: SetExecutionProfileNodesBody,
  ): ExecutionProfile {
    return this.setProfileNodesUseCase.execute({ orgId, profileId, body });
  }

  @Put('profiles/default')
  setDefaultProfile(
    @OrgIdHeader() orgId: string,
    @Body(SetDefaultExecutionProfileBodySchema) body: SetDefaultExecutionProfileBody,
  ): void {
    this.setDefaultProfileUseCase.execute({ orgId, body });
  }

  @Delete('profiles/:profileId')
  @HttpCode(204)
  removeProfile(@OrgIdHeader() orgId: string, @Param('profileId') profileId: string): void {
    this.deleteProfileUseCase.execute({ orgId, profileId });
  }

  @Get('connect-info')
  info(): ConnectInfo {
    return this.connectInfo.execute();
  }

  @Get('invites')
  invites(@OrgIdHeader() orgId: string): ActiveInvite[] {
    return this.listInvites.execute(orgId);
  }

  @Post('invites')
  @HttpCode(201)
  createInvite(
    @OrgIdHeader() orgId: string,
    @Body(IssueInviteBodySchema) body: IssueInviteBody,
  ): IssuedInvite {
    return this.issueInvite.execute({
      orgId,
      nodeName: body.nodeName,
      ttlMin: body.ttlMin,
    });
  }

  @Delete('invites/:id')
  @HttpCode(204)
  removeInvite(@OrgIdHeader() orgId: string, @Param('id') id: string): void {
    this.revokeInvite.execute(orgId, id);
  }

  @Public()
  @Post('enroll')
  enroll(@OrgIdHeader() orgId: string, @Body(EnrollBodySchema) body: EnrollBody): EnrollResponse {
    return this.enrollOnRelay.execute({
      orgId,
      code: body.code,
      nodeName: body.nodeName,
      nodeId: body.nodeId,
    });
  }

  @Public()
  @Post('heartbeat')
  @HttpCode(200)
  ping(
    @OrgIdHeader() orgId: string,
    @BearerToken() token: string,
    @Body(HeartbeatBodySchema) body: HeartbeatBody,
  ): HeartbeatResponse {
    return this.heartbeat.execute({
      orgId,
      bearerToken: token,
      diskFreeBytes: body.diskFreeBytes,
      diskTotalBytes: body.diskTotalBytes,
    });
  }

  @Post('promote')
  @HttpCode(201)
  startPromote(
    @OrgIdHeader() orgId: string,
    @Body(PromoteStartBodySchema) body: PromoteStartBody,
  ): PromoteStartResponse {
    return this.promote.start({
      orgId,
      targetNodeId: body.targetNodeId,
      newRelayUrl: body.newRelayUrl,
    });
  }

  @Public()
  @Get('promote/:token/org.db')
  exportOrgDb(@Param('token') token: string): Response {
    const { bytes } = this.promote.exportDb(token);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="org.db"',
      },
    });
  }

  @Public()
  @Get('promote/:token/org-data.tgz')
  async exportOrgData(@Param('token') token: string): Promise<Response> {
    const result = await this.promote.exportData(token);
    if (!result) {
      return new Response(null, { status: 404 });
    }
    const { archivePath } = result;
    const file = Bun.file(archivePath);
    setTimeout(() => {
      rmSync(archivePath, { force: true });
      rmSync(join(archivePath, '..'), { recursive: true, force: true });
    }, 120_000).unref();
    return new Response(file, {
      status: 200,
      headers: {
        'Content-Type': 'application/gzip',
        'Content-Disposition': 'attachment; filename="org-data.tgz"',
      },
    });
  }

  @Public()
  @Get('promote/:token/identity-slice')
  exportIdentitySlice(@Param('token') token: string): PromoteIdentitySliceResponse {
    return this.promote.exportIdentitySliceForPromote(token);
  }

  @Public()
  @Post('promote/complete')
  completePromote(
    @Body(PromoteCompleteBodySchema) body: PromoteCompleteBody,
  ): PromoteCompleteResponse {
    return this.promote.complete(body);
  }

  @Post('proxy/:nodeId')
  proxy(
    @Param('nodeId') nodeId: string,
    @Body(ProxyRequestSchema) body: ProxyRequest,
  ): Promise<Response> {
    return this.contentProxy.requestProxy(nodeId, body);
  }

  @Public()
  @Post('secrets/resolve')
  resolveFleetSecrets(
    @OrgIdHeader() orgId: string,
    @BearerToken() token: string,
    @Body(ResolveFleetSecretsBodySchema) body: ResolveFleetSecretsBody,
  ): Promise<ResolveFleetSecretsResponse> {
    return this.resolveSecrets.execute({
      orgId,
      bearerToken: token,
      body,
    });
  }

  @Public()
  @Post('work/claim')
  @HttpCode(200)
  claimFleetWork(
    @OrgIdHeader() orgId: string,
    @BearerToken() token: string,
    @Body(ClaimWorkBodySchema) body: ClaimWorkBody,
  ): ClaimWorkResponse {
    return this.claimWork.execute({
      orgId,
      bearerToken: token,
      body,
    });
  }

  @Public()
  @Post('worker/org-operation')
  @HttpCode(200)
  workerOrgOperation(
    @OrgIdHeader() orgId: string,
    @BearerToken() token: string,
    @Body(WorkerOrgOperationBodySchema) body: WorkerOrgOperationBody,
  ): Promise<WorkerOrgOperationResponse> {
    return this.orgOperation.execute({ orgId, bearerToken: token, body });
  }

  @Public()
  @Post('runs/attachments/fetch')
  async fetchRunAttachment(
    @OrgIdHeader() orgId: string,
    @BearerToken() token: string,
    @Body(FetchRunAttachmentBodySchema) body: FetchRunAttachmentBody,
  ): Promise<Response> {
    const result = await this.fetchAttachment.execute({ orgId, bearerToken: token, body });
    return new Response(result.bytes, {
      status: 200,
      headers: {
        'Content-Type': result.mediaType,
        'Content-Disposition': `attachment; filename="${result.fileName}"`,
      },
    });
  }
}
