import type {
  LspDiagnostic,
  LspDiagnosticsRequest,
  LspHover,
  LspLocation,
  LspPositionRequest,
} from 'harnesys';

export type { LspDiagnostic, LspDiagnosticsRequest, LspHover, LspLocation, LspPositionRequest };

export abstract class LspPort {
  abstract diagnostics(orgId: string, request: LspDiagnosticsRequest): Promise<LspDiagnostic[]>;
  abstract definition(orgId: string, request: LspPositionRequest): Promise<LspLocation[]>;
  abstract references(orgId: string, request: LspPositionRequest): Promise<LspLocation[]>;
  abstract hover(orgId: string, request: LspPositionRequest): Promise<LspHover | null>;
  abstract invalidateOrg(orgId: string): void;
  abstract onDiagnostics(
    orgId: string,
    listener: (frame: {
      orgId: string;
      cwd: string;
      serverId: string;
      diagnostics: LspDiagnostic[];
    }) => void,
  ): () => void;
}
