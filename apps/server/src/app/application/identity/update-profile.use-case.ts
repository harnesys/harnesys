import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
  ValidationException,
} from '@harnesys/brix';
import { IdentityAudit } from '../../domain/identity/identity-audit.port.ts';
import { type Principal } from '../../domain/identity/principal.ts';
import {
  AVATAR_DATA_URL_PATTERN,
  AVATAR_MAX_CHARS,
  PROFILE_NAME_MAX_LENGTH,
} from '../../domain/identity/profile-rules.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';
import { type CurrentUserView, currentUserViewOf } from './get-current-user.use-case.ts';
import { identityAuditRow } from './identity-audit-row.ts';

export interface UpdateProfileInput {
  principal: Principal;
  name: string;
  avatar: string | null;
  now?: string;
}

@Injectable()
export class UpdateProfileUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly audit: IdentityAudit,
  ) {}

  execute(input: UpdateProfileInput): CurrentUserView {
    if (input.principal.kind !== 'user') {
      throw new ForbiddenException('A user session is required to update a profile');
    }
    const name = input.name.trim();
    if (name.length === 0 || name.length > PROFILE_NAME_MAX_LENGTH) {
      throw new ValidationException(`name must be 1..${PROFILE_NAME_MAX_LENGTH} characters`);
    }
    if (
      input.avatar !== null &&
      (input.avatar.length > AVATAR_MAX_CHARS || !AVATAR_DATA_URL_PATTERN.test(input.avatar))
    ) {
      throw new ValidationException('avatar must be a base64 data URL png, jpeg or webp image');
    }
    const user = this.users.findById(input.principal.userId);
    if (!user) {
      throw new UnauthorizedException('The session user no longer exists');
    }
    const now = input.now ?? new Date().toISOString();
    this.users.updateProfile({
      id: user.id,
      name,
      avatar: input.avatar,
      updatedAt: now,
    });
    this.audit.append(
      identityAuditRow(now, {
        actorKind: 'user',
        actorId: user.id,
        action: 'profile_updated',
        result: 'ok',
        reason: null,
      }),
    );
    return currentUserViewOf(
      { ...user, name, avatar: input.avatar, updatedAt: now },
      input.principal.capabilities,
    );
  }
}
