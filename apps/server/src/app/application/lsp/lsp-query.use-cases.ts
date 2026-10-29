import { Injectable } from '@harnesys/brix';
import { z } from 'zod';
import { LspQueryUseCase } from './lsp-query.use-case.ts';

export const LspQuerySchema = z.object({
  sourceId: z.string().min(1),
  path: z.string().min(1),
  line: z.number().int().min(0).optional(),
  character: z.number().int().min(0).optional(),
});
export type LspQueryBody = z.infer<typeof LspQuerySchema>;

export const LspEventsQuerySchema = z.object({ sourceId: z.string().min(1) });

@Injectable()
export class LspDiagnosticsUseCase {
  constructor(private readonly query: LspQueryUseCase) {}

  execute(query: LspQueryBody & { orgId: string }): Promise<unknown> {
    return this.query.diagnostics({ ...query, path: query.path });
  }
}

@Injectable()
export class LspHoverUseCase {
  constructor(private readonly query: LspQueryUseCase) {}

  execute(query: LspQueryBody & { orgId: string }): Promise<unknown> {
    return this.query.hover(query);
  }
}

@Injectable()
export class LspDefinitionUseCase {
  constructor(private readonly query: LspQueryUseCase) {}

  execute(query: LspQueryBody & { orgId: string }): Promise<unknown> {
    return this.query.definition(query);
  }
}

@Injectable()
export class LspReferencesUseCase {
  constructor(private readonly query: LspQueryUseCase) {}

  execute(query: LspQueryBody & { orgId: string }): Promise<unknown> {
    return this.query.references(query);
  }
}
