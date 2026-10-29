import { Module } from '@harnesys/brix';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { MachineConfigPort } from '../../domain/machine/machine-config.port.ts';
import { OrgDataPackPort } from '../../domain/machine/org-data-pack.port.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { OrgDbPort } from '../../domain/org/org-db.port.ts';
import { HostFsLayoutAdapter } from '../fs-layout/host-fs-layout.adapter.ts';
import { OrgDataPackAdapter } from '../fs-layout/org-data-pack.adapter.ts';
import { MachineConfigAdapter } from '../machine-json/machine-config.adapter.ts';
import { OrgMachineStoreAdapter } from '../machine-json/org-machine-store.adapter.ts';
import { OrgDbAdapter } from '../org-sqlite/org-db.adapter.ts';

@Module({
  providers: [
    { provide: HostFsLayoutPort, useClass: HostFsLayoutAdapter },
    { provide: OrgDataPackPort, useClass: OrgDataPackAdapter },
    { provide: MachineConfigPort, useClass: MachineConfigAdapter },
    { provide: OrgMachineStore, useClass: OrgMachineStoreAdapter },
    { provide: OrgDbPort, useClass: OrgDbAdapter },
  ],
  exports: [HostFsLayoutPort, OrgDataPackPort, MachineConfigPort, OrgMachineStore, OrgDbPort],
})
export class MachineHomeModule {}
