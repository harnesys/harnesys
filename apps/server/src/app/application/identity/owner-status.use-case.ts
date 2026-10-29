import { Injectable } from '@harnesys/brix';
import { UserRepository } from '../../domain/identity/user-repository.port.ts';

export interface OwnerStatusResult {
  initialized: boolean;
}

@Injectable()
export class OwnerStatusUseCase {
  constructor(private readonly users: UserRepository) {}

  execute(): OwnerStatusResult {
    return { initialized: this.users.count() > 0 };
  }
}
