export type LspDiagnosticSeverity = 'error' | 'warning' | 'information' | 'hint';
export interface LspDiagnostic {
  path: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
  severity: LspDiagnosticSeverity;
  message: string;
  source?: string;
  code?: string;
}
export interface LspLocation {
  path: string;
  line: number;
  character: number;
  endLine: number;
  endCharacter: number;
}
export interface LspHover {
  contents: string;
  range?: {
    line: number;
    character: number;
    endLine: number;
    endCharacter: number;
  };
}
export interface LspPositionRequest {
  cwd: string;
  path: string;
  line: number;
  character: number;
  roots?: string[];
}
export interface LspDiagnosticsRequest {
  cwd: string;
  path: string;
  roots?: string[];
}
export interface LspPort {
  diagnostics(request: LspDiagnosticsRequest): Promise<LspDiagnostic[]>;
  definition(request: LspPositionRequest): Promise<LspLocation[]>;
  references(request: LspPositionRequest): Promise<LspLocation[]>;
  hover(request: LspPositionRequest): Promise<LspHover | null>;
}
