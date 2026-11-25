import { ForbiddenException, Injectable, UnauthorizedException } from '@harnesys/brix';
import { type Principal } from '../../domain/identity/principal.ts';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';

export interface CurrentUserView {
  userId: string;
  login: string;
  name: string;
}

export interface GetCurrentUserInput {
  principal: Principal;
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
    return { userId: user.id, login: user.login, name: user.name };
  }
}
