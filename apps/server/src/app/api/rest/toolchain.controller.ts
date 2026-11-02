import { Controller, Get, HttpCode, Param, Post } from '@harnesys/brix';
import { GetToolchainDiscoveryUseCase } from '../../application/toolchain/get-toolchain-discovery.use-case.ts';
import { RefreshToolchainUseCase } from '../../application/toolchain/refresh-toolchain.use-case.ts';

@Controller()
export class ToolchainController {
  constructor(
    private readonly discovery: GetToolchainDiscoveryUseCase,
    private readonly refresh: RefreshToolchainUseCase,
  ) {}

  @Get('orgs/:orgId/toolchain')
  show(@Param('orgId') orgId: string) {
    return this.discovery.execute({ orgId });
  }

  @Post('orgs/:orgId/toolchain/refresh')
  @HttpCode(200)
  reprobe(@Param('orgId') orgId: string) {
    return this.refresh.execute({ orgId });
  }
}
