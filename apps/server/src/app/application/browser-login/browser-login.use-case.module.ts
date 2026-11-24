import { Module } from '@harnesys/brix';
import { DeleteBrowserCredentialUseCase } from './delete-browser-credential.use-case.ts';
import { GetBrowserLoginAttemptUseCase } from './get-browser-login-attempt.use-case.ts';
import { ListBrowserCredentialsUseCase } from './list-browser-credentials.use-case.ts';
import { PutBrowserCredentialUseCase } from './put-browser-credential.use-case.ts';
import { RecordBrowserLoginResultUseCase } from './record-browser-login-result.use-case.ts';
import { ResetBrowserCredentialStatusUseCase } from './reset-browser-credential-status.use-case.ts';
import { SubmitBrowserLoginAttemptUseCase } from './submit-browser-login-attempt.use-case.ts';

const useCases = [
  ListBrowserCredentialsUseCase,
  PutBrowserCredentialUseCase,
  DeleteBrowserCredentialUseCase,
  ResetBrowserCredentialStatusUseCase,
  RecordBrowserLoginResultUseCase,
  SubmitBrowserLoginAttemptUseCase,
  GetBrowserLoginAttemptUseCase,
];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class BrowserLoginUseCaseModule {}
