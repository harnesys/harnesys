import { Injectable } from '@harnesys/brix';
import { MemoryCrawlerPort } from '../../domain/agent/memory-crawler.port.ts';
import {
  GetMemoryStatusUseCase,
  type MemoryEmbeddingsStatus,
} from './get-memory-status.use-case.ts';

@Injectable()
export class RunMemoryPassUseCase {
  constructor(
    private readonly crawler: MemoryCrawlerPort,
    private readonly status: GetMemoryStatusUseCase,
  ) {}

  async execute(orgId: string): Promise<MemoryEmbeddingsStatus> {
    await this.crawler.runNow(orgId);
    return this.status.execute(orgId);
  }
}
