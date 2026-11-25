import { ForbiddenException, Injectable, UnauthorizedException } from '@harnesys/brix';
import { type Principal } from '../../domain/identity/principal.ts';
import { type AccountRole, roleFromCapabilities } from '../../domain/identity/role-presets.ts';
import { type UserRecord, UserRepository } from '../../domain/identity/user-repository.port.ts';

export interface CurrentUserView {
  userId: string;
  login: string;
  name: string;
  avatar: string | null;
  role: AccountRole;
}

export interface GetCurrentUserInput {
  principal: Principal;
}

export function currentUserViewOf(user: UserRecord, capabilities: string[]): CurrentUserView {
  return {
    userId: user.id,
    login: user.login,
    name: user.name,
    avatar: user.avatar,
    role: roleFromCapabilities(capabilities),
  };
}

@Injectable()
export class GetCurrentUserUseCase {
  constructor(private readonly users: UserRepository) {}

  execute(input: GetCurrentUserInput): CurrentUserView {
    if (input.principal.kind !== 'user') {
      throw new ForbiddenException('A user session is required');
    }
    const user = this.users.findById(input.principal.userId);
    if (!user) {
      throw new UnauthorizedException('The session user no longer exists');
    }
    return currentUserViewOf(user, input.principal.capabilities);
  }
}
