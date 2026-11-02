import { Module } from '@harnesys/brix';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';
import { SkillsModule } from '../skills/skills.module.ts';
import { ToolchainAdapter } from './toolchain.adapter.ts';

@Module({
  imports: [SkillsModule],
  providers: [{ provide: ToolchainPort, useClass: ToolchainAdapter }],
  exports: [ToolchainPort],
})
export class ToolchainModule {}
