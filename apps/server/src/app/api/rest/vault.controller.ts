import { Body, Controller, Delete, Get, HttpCode, Param, Put } from '@harnesys/brix';
import {
  type PutVaultEntryBody,
  PutVaultEntryBodySchema,
  type VaultEntry,
  VaultEntryNameSchema,
  type VaultListResponse,
} from '@harnesys/contracts';
import { DeleteVaultEntryUseCase } from '../../application/vault/delete-vault-entry.use-case.ts';
import { ListVaultEntriesUseCase } from '../../application/vault/list-vault-entries.use-case.ts';
import { PutVaultEntryUseCase } from '../../application/vault/put-vault-entry.use-case.ts';

@Controller('orgs/:orgId/vault')
export class VaultController {
  constructor(
    private readonly listVault: ListVaultEntriesUseCase,
    private readonly putVault: PutVaultEntryUseCase,
    private readonly deleteVault: DeleteVaultEntryUseCase,
  ) {}

  @Get()
  list(@Param('orgId') orgId: string): Promise<VaultListResponse> {
    return this.listVault.execute(orgId);
  }

  @Put(':name')
  put(
    @Param('orgId') orgId: string,
    @Param('name') name: string,
    @Body(PutVaultEntryBodySchema) body: PutVaultEntryBody,
  ): Promise<VaultEntry> {
    const parsedName = VaultEntryNameSchema.parse(name);
    return this.putVault.execute({
      orgId,
      name: parsedName,
      kind: body.kind,
      value: body.value,
    });
  }

  @Delete(':name')
  @HttpCode(204)
  remove(@Param('orgId') orgId: string, @Param('name') name: string): Promise<void> {
    const parsedName = VaultEntryNameSchema.parse(name);
    return this.deleteVault.execute({ orgId, name: parsedName });
  }
}
