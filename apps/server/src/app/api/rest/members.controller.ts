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
} from '@harnesys/brix';
import {
  type AcceptedUserInvite,
  AcceptUserInviteUseCase,
} from '../../application/identity/accept-user-invite.use-case.ts';
import {
  type IssuedUserInvite,
  IssueUserInviteUseCase,
} from '../../application/identity/issue-user-invite.use-case.ts';
import {
  ListMembersUseCase,
  type MemberView,
} from '../../application/identity/list-members.use-case.ts';
import { RemoveMembershipUseCase } from '../../application/identity/remove-membership.use-case.ts';
import {
  type ResetMemberPasswordResult,
  ResetMemberPasswordUseCase,
} from '../../application/identity/reset-member-password.use-case.ts';
import { UpdateMembershipUseCase } from '../../application/identity/update-membership.use-case.ts';
import type { MembershipRecord } from '../../domain/identity/membership-repository.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import { SessionPrincipal } from '../guards/session.guard.ts';
import {
  type InviteAcceptBody,
  InviteAcceptBodySchema,
  type MemberInviteBody,
  MemberInviteBodySchema,
  type MemberUpdateBody,
  MemberUpdateBodySchema,
} from './members.schema.ts';

type MemberPatchResult = Pick<MembershipRecord, 'userId' | 'orgId' | 'capabilities' | 'updatedAt'>;

@Controller('orgs/:orgId/members')
export class MembersController {
  constructor(
    private readonly membersList: ListMembersUseCase,
    private readonly membersUpdate: UpdateMembershipUseCase,
    private readonly membersRemove: RemoveMembershipUseCase,
    private readonly membersInvite: IssueUserInviteUseCase,
    private readonly membersResetPassword: ResetMemberPasswordUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string, @SessionPrincipal() principal: Principal): MemberView[] {
    return this.membersList.execute({ principal, orgId });
  }

  @Post('invites')
  @HttpCode(201)
  async invite(
    @Param('orgId') orgId: string,
    @SessionPrincipal() principal: Principal,
    @Body(MemberInviteBodySchema) body: MemberInviteBody,
  ): Promise<IssuedUserInvite> {
    return await this.membersInvite.execute({
      principal,
      orgId,
      capabilities: body.capabilities,
    });
  }

  @Patch(':userId')
  update(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @SessionPrincipal() principal: Principal,
    @Body(MemberUpdateBodySchema) body: MemberUpdateBody,
  ): MemberPatchResult {
    return this.membersUpdate.execute({
      principal,
      orgId,
      userId,
      capabilities: body.capabilities,
    });
  }

  @Delete(':userId')
  @HttpCode(204)
  remove(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @SessionPrincipal() principal: Principal,
  ): void {
    this.membersRemove.execute({ principal, orgId, userId });
  }

  @Post(':userId/reset-password')
  @HttpCode(201)
  async resetPassword(
    @Param('orgId') orgId: string,
    @Param('userId') userId: string,
    @SessionPrincipal() principal: Principal,
  ): Promise<ResetMemberPasswordResult> {
    return await this.membersResetPassword.execute({ principal, orgId, userId });
  }
}

@Controller('invites')
export class InvitesController {
  constructor(private readonly invitesAccept: AcceptUserInviteUseCase) {}

  @Public()
  @Post('accept')
  async accept(@Body(InviteAcceptBodySchema) body: InviteAcceptBody): Promise<AcceptedUserInvite> {
    return await this.invitesAccept.execute(body);
  }
}
