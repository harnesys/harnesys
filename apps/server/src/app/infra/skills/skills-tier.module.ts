import { Module } from '@harnesys/brix';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SkillsTierCache } from './skills-tier-cache.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [SkillsTierCache],
  exports: [SkillsTierCache],
})
export class SkillsTierModule {}
