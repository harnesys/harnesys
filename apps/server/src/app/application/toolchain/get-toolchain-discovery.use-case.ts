import { Injectable } from '@harnesys/brix';
import type { ToolchainDiscovery } from '@harnesys/contracts';
import { LSP_CATALOG } from '../../domain/lsp/lsp-catalog.ts';
import { disabledFileEntries, readOrgLspFile } from '../../domain/lsp/org-lsp-file.ts';
import { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ToolchainPort } from '../../domain/toolchain/toolchain.port.ts';

export interface ToolchainCommandRef {
  command: string;
  serverId?: string;
}

export function toolchainCommandRefs(
  orgId: string,
  layout: HostFsLayoutPort,
): ToolchainCommandRef[] {
  const file = readOrgLspFile(layout.lspConfigPath(orgId));
  const refs = new Map<string, ToolchainCommandRef>();
  for (const spec of LSP_CATALOG) {
    refs.set(spec.command, { command: spec.command, serverId: spec.serverId });
  }
  for (const server of [...file.servers, ...disabledFileEntries(file.raw)]) {
    const known = refs.get(server.command);
    refs.set(server.command, {
      command: server.command,
      serverId: known?.serverId ?? server.serverId,
    });
  }
  return [...refs.values()];
}

@Injectable()
export class GetToolchainDiscoveryUseCase {
  constructor(
    private readonly toolchain: ToolchainPort,
    private readonly layout: HostFsLayoutPort,
  ) {}

  async execute(request: { orgId: string }) {
    const refs = toolchainCommandRefs(request.orgId, this.layout);
    const discovery = await this.toolchain.discover(
      request.orgId,
      refs.map((ref) => ref.command),
    );
    return withServerIds(discovery, refs);
  }
}

function withServerIds(discovery: ToolchainDiscovery, refs: ToolchainCommandRef[]) {
  const serverIdByCommand = new Map(refs.map((ref) => [ref.command, ref.serverId]));
  return {
    ...discovery,
    commands: discovery.commands.map((status) => {
      const serverId = serverIdByCommand.get(status.command);
      return serverId === undefined ? status : { ...status, serverId };
    }),
  };
}
