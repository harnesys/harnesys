import { Injectable } from '@harnesys/brix';
import {
  BrowserLoginAttemptPort,
  type BrowserLoginAttemptRef,
} from '../../domain/browser/login-attempt.port.ts';

export interface GetBrowserLoginAttemptInput {
  orgId: string;
  credentialId: string;
  threadId?: string;
}

@Injectable()
export class GetBrowserLoginAttemptUseCase {
  constructor(private readonly attempts: BrowserLoginAttemptPort) {}

  async execute(
    input: GetBrowserLoginAttemptInput,
  ): Promise<{ attempt: BrowserLoginAttemptRef | null }> {
    return {
      attempt: await this.attempts.active(input.orgId, input.credentialId, input.threadId),
    };
  }
}
