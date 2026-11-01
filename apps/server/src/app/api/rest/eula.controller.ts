import { Body, Controller, Get, HttpCode, Post, Public } from '@harnesys/brix';
import { type EulaAcceptBody, EulaAcceptBodySchema, type EulaStatus } from '@harnesys/contracts';
import { AcceptEulaUseCase } from '../../application/eula/accept-eula.use-case.ts';
import { GetEulaStatusUseCase } from '../../application/eula/get-eula-status.use-case.ts';

@Controller('eula')
export class EulaController {
  constructor(
    private readonly getEulaStatus: GetEulaStatusUseCase,
    private readonly acceptEula: AcceptEulaUseCase,
  ) {}

  @Public()
  @Get()
  status(): EulaStatus {
    return this.getEulaStatus.execute();
  }

  @Public()
  @Post('accept')
  @HttpCode(200)
  accept(@Body(EulaAcceptBodySchema) body: EulaAcceptBody): EulaStatus {
    return this.acceptEula.execute({ agreementId: body.agreementId });
  }
}
