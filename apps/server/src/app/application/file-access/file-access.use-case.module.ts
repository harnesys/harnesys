import { Module } from '@harnesys/brix';
import { FileAccessModule } from '../../infra/file-access/file-access.module.ts';
import { CreateFileAccessRuleUseCase } from './create-file-access-rule.use-case.ts';
import { DeleteFileRuleUseCase } from './delete-file-rule.use-case.ts';
import { ListFileRulesUseCase } from './list-file-rules.use-case.ts';

const useCases = [ListFileRulesUseCase, CreateFileAccessRuleUseCase, DeleteFileRuleUseCase];

@Module({
  imports: [FileAccessModule],
  providers: [...useCases],
  exports: [...useCases],
})
export class FileAccessUseCaseModule {}
