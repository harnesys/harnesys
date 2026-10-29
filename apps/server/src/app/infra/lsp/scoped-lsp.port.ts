import type { LspPortContract as LspContract } from 'harnesys';
import type {
  LspDiagnosticsRequest,
  LspPort,
  LspPositionRequest,
} from '../../domain/lsp/lsp.port.ts';
import { getHostToolScope } from '../runtime/host-tool-scope.ts';

export function scopedLspPort(lsp: LspPort): LspContract {
  return {
    diagnostics: (request: LspDiagnosticsRequest) => lsp.diagnostics(scopeOrgId(), request),
    definition: (request: LspPositionRequest) => lsp.definition(scopeOrgId(), request),
    references: (request: LspPositionRequest) => lsp.references(scopeOrgId(), request),
    hover: (request: LspPositionRequest) => lsp.hover(scopeOrgId(), request),
  };
}

function scopeOrgId(): string {
  return getHostToolScope()?.orgId ?? '';
}
