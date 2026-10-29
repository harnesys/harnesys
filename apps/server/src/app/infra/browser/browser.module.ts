import { Module } from '@harnesys/brix';
import { BrowserHostPort } from '../../domain/browser/browser-host.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { SkillsModule } from '../skills/skills.module.ts';
import { LocalBrowserHostAdapter } from './local-browser-host.adapter.ts';

@Module({
  imports: [MachineHomeModule, SkillsModule],
  providers: [{ provide: BrowserHostPort, useClass: LocalBrowserHostAdapter }],
  exports: [BrowserHostPort, OrgSettingsPort],
})
export class BrowserModule {}
