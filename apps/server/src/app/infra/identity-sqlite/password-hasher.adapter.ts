import { Injectable } from '@harnesys/brix';
import { hashPassword, verifyPassword } from '../../application/identity/password-hasher.ts';
import { PasswordHasher } from '../../domain/identity/password-hasher.port.ts';

@Injectable()
export class PasswordHasherAdapter extends PasswordHasher {
  hash(password: string): Promise<string> {
    return hashPassword(password);
  }

  verify(password: string, hash: string): Promise<boolean> {
    return verifyPassword(password, hash);
  }
}
