import { Module } from '@harnesys/brix';
import { AppsModule } from '../../infra/apps/apps.module.ts';
import { AccountAccessService } from './access/account-access.service.ts';
import { DeleteAccountUseCase } from './accounts/delete-account.use-case.ts';
import { GetAccountUseCase, ListAccountsUseCase } from './accounts/list-account.use-case.ts';
import { UpdateAccountUseCase } from './accounts/update-account.use-case.ts';
import { VerifyAccountUseCase } from './accounts/verify-account.use-case.ts';
import { AccountsFacadePort } from './accounts-facade.port.ts';
import { CreateAppUseCase } from './apps/create-app.use-case.ts';
import { DeleteAppUseCase } from './apps/delete-app.use-case.ts';
import { GetAppUseCase, ListAppsUseCase } from './apps/list-app.use-case.ts';
import { UpdateAppUseCase } from './apps/update-app.use-case.ts';
import { VerifyAppUseCase } from './apps/verify-app.use-case.ts';
import { ListCatalogUseCase } from './catalog/list-catalog.use-case.ts';
import { ConnectContextPort } from './connect/connect-context.port.ts';
import { ConnectContextFactory } from './connect/connect-context.ts';
import { ConnectFinalizePort } from './connect/connect-finalize.port.ts';
import { ConnectFinalizer } from './connect/connect-finalizer.ts';
import { ConnectScheduler } from './connect/connect-scheduler.ts';
import { CancelConnectUseCase, GetConnectSessionUseCase } from './connect/get-session.use-case.ts';
import { PollConnectUseCase } from './connect/poll-connect.use-case.ts';
import { ResumeConnectUseCase } from './connect/resume-connect.use-case.ts';
import { ConnectResumeExecutor } from './connect/resume-executor.ts';
import { ResumeFormConnectUseCase } from './connect/resume-form-connect.use-case.ts';
import { StartConnectUseCase } from './connect/start-connect.use-case.ts';
import { AccountsFacadeService } from './facade/accounts-facade.service.ts';
import { HandleWebhookUseCase } from './webhooks/handle-webhook.use-case.ts';

const useCases = [
  ListCatalogUseCase,
  ListAppsUseCase,
  GetAppUseCase,
  CreateAppUseCase,
  UpdateAppUseCase,
  DeleteAppUseCase,
  VerifyAppUseCase,
  ListAccountsUseCase,
  GetAccountUseCase,
  UpdateAccountUseCase,
  DeleteAccountUseCase,
  VerifyAccountUseCase,
  StartConnectUseCase,
  ResumeConnectUseCase,
  ResumeFormConnectUseCase,
  PollConnectUseCase,
  GetConnectSessionUseCase,
  CancelConnectUseCase,
  HandleWebhookUseCase,
];

const services = [AccountAccessService, ConnectScheduler, ConnectResumeExecutor];

@Module({
  imports: [AppsModule],
  providers: [
    ...useCases,
    ...services,
    { provide: AccountsFacadePort, useClass: AccountsFacadeService },
    { provide: ConnectContextPort, useClass: ConnectContextFactory },
    { provide: ConnectFinalizePort, useClass: ConnectFinalizer },
  ],
  exports: [...useCases, ...services, AccountsFacadePort, ConnectContextPort, ConnectFinalizePort],
})
export class AppsUseCaseModule {}
