import { Module } from '@harnesys/brix';
import { SkillsTierCachePort } from '../../domain/skills/skills-tier-cache.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SkillsTierCache } from './skills-tier-cache.ts';

@Module({
  global: true,
  imports: [MachineHomeModule],
  providers: [SkillsTierCache, { provide: SkillsTierCachePort, useClass: SkillsTierCache }],
  exports: [SkillsTierCache, SkillsTierCachePort],
})
export class SkillsTierModule {}
