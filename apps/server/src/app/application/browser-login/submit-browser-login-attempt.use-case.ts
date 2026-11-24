import { Injectable } from '@harnesys/brix';
import { AttemptNotFoundException } from '../../domain/browser/browser-credential.error.ts';
import {
  type BrowserLoginAttemptInput,
  BrowserLoginAttemptPort,
} from '../../domain/browser/login-attempt.port.ts';

export interface SubmitBrowserLoginAttemptInputData {
  orgId: string;
  attemptId: string;
  credentialId: string;
  input: BrowserLoginAttemptInput;
}

@Injectable()
export class SubmitBrowserLoginAttemptUseCase {
  constructor(private readonly attempts: BrowserLoginAttemptPort) {}

  async execute(data: SubmitBrowserLoginAttemptInputData): Promise<{ accepted: boolean }> {
    const result = await this.attempts.submit(data);
    if (!result.accepted) {
      throw new AttemptNotFoundException(data.attemptId);
    }
    return { accepted: true };
  }
}
