import { Module } from '@harnesys/brix';
import { DeletePriceOverrideUseCase } from './delete-price-override.use-case.ts';
import { ListPriceOverridesUseCase } from './list-price-overrides.use-case.ts';
import { RunUsageUseCase } from './run-usage.use-case.ts';
import { SetPriceOverrideUseCase } from './set-price-override.use-case.ts';
import { UsageReportUseCase } from './usage-report.use-case.ts';
import { UsageRunsReportUseCase } from './usage-runs-report.use-case.ts';

@Module({
  providers: [
    UsageReportUseCase,
    UsageRunsReportUseCase,
    RunUsageUseCase,
    SetPriceOverrideUseCase,
    ListPriceOverridesUseCase,
    DeletePriceOverrideUseCase,
  ],
  exports: [
    UsageReportUseCase,
    UsageRunsReportUseCase,
    RunUsageUseCase,
    SetPriceOverrideUseCase,
    ListPriceOverridesUseCase,
    DeletePriceOverrideUseCase,
  ],
})
export class UsageUseCaseModule {}
