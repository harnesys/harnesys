import { Module } from '@harnesys/brix';
import { OrgMcpPort } from '../../domain/mcp/org-mcp.port.ts';
import { MachineHomeModule } from '../machine-home/machine-home.module.ts';
import { OrgMcpJsonAdapter } from './org-mcp-json.adapter.ts';

@Module({
  imports: [MachineHomeModule],
  providers: [{ provide: OrgMcpPort, useClass: OrgMcpJsonAdapter }],
  exports: [OrgMcpPort],
})
export class McpModule {}
