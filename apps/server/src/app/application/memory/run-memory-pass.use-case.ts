import { Injectable } from '@harnesys/brix';
import { MemoryCrawler } from '../../infra/memory/memory-crawler.ts';
import {
  GetMemoryStatusUseCase,
  type MemoryEmbeddingsStatus,
} from './get-memory-status.use-case.ts';

@Injectable()
export class RunMemoryPassUseCase {
  constructor(
    private readonly crawler: MemoryCrawler,
    private readonly status: GetMemoryStatusUseCase,
  ) {}

  async execute(orgId: string): Promise<MemoryEmbeddingsStatus> {
    await this.crawler.runNow(orgId);
    return this.status.execute(orgId);
  }
}
