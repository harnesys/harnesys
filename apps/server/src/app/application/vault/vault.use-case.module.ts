import { Module } from '@harnesys/brix';
import { DeleteVaultEntryUseCase } from './delete-vault-entry.use-case.ts';
import { ListVaultEntriesUseCase } from './list-vault-entries.use-case.ts';
import { PutVaultEntryUseCase } from './put-vault-entry.use-case.ts';

const useCases = [ListVaultEntriesUseCase, PutVaultEntryUseCase, DeleteVaultEntryUseCase];

@Module({
  providers: [...useCases],
  exports: [...useCases],
})
export class VaultUseCaseModule {}
