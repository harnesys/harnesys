import { Module } from '@harnesys/brix';
import { AppsModule } from '../../infra/apps/apps.module.ts';
import { SecretModule } from '../../infra/secret/secret.module.ts';
import { CreateAppUseCase } from './create-app.use-case.ts';
import { DeleteAccountUseCase } from './delete-account.use-case.ts';
import { DeleteAppUseCase } from './delete-app.use-case.ts';
import { GetAccountUseCase, ListAccountsUseCase } from './list-accounts.use-case.ts';
import { ListAppKindsUseCase } from './list-app-kinds.use-case.ts';
import { GetAppUseCase, ListAppsUseCase } from './list-apps.use-case.ts';
import { RegisterAccountUseCase } from './register-account.use-case.ts';
import { UpdateAccountUseCase } from './update-account.use-case.ts';
import { UpdateAppUseCase } from './update-app.use-case.ts';

const useCases = [
  ListAppKindsUseCase,
  ListAppsUseCase,
  GetAppUseCase,
  CreateAppUseCase,
  UpdateAppUseCase,
  DeleteAppUseCase,
  ListAccountsUseCase,
  GetAccountUseCase,
  RegisterAccountUseCase,
  UpdateAccountUseCase,
  DeleteAccountUseCase,
];

@Module({
  imports: [AppsModule, SecretModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class AppsUseCaseModule {}
