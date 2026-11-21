import { Body, Controller, Get, HttpCode, Param, Post } from '@harnesys/brix';
import type { ToolchainNodeInstallBody } from '@harnesys/contracts';
import { ToolchainNodeInstallBodySchema } from '@harnesys/contracts';
import { GetToolchainDiscoveryUseCase } from '../../application/toolchain/get-toolchain-discovery.use-case.ts';
import { InstallNodeVersionUseCase } from '../../application/toolchain/install-node-version.use-case.ts';
import { RefreshToolchainUseCase } from '../../application/toolchain/refresh-toolchain.use-case.ts';

@Controller()
export class ToolchainController {
  constructor(
    private readonly discovery: GetToolchainDiscoveryUseCase,
    private readonly refresh: RefreshToolchainUseCase,
    private readonly installNode: InstallNodeVersionUseCase,
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

  @Post('orgs/:orgId/toolchain/node-versions')
  @HttpCode(200)
  async addNodeVersion(
    @Param('orgId') orgId: string,
    @Body(ToolchainNodeInstallBodySchema) body: ToolchainNodeInstallBody,
  ) {
    await this.installNode.execute({ orgId, version: body.version });
    return await this.discovery.execute({ orgId });
  }
}
