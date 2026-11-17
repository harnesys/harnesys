export type ContextFileSkipReason =
  | 'missing'
  | 'blocked'
  | 'binary'
  | 'empty'
  | 'outside-root'
  | 'read-error'
  | 'truncated'
  | 'budget';

export interface ContextFileRunEntry {
  path: string;
  chars: number;
  skipped?: ContextFileSkipReason;
}

export type RequestSectionId =
  | 'system.prompt'
  | 'system.context'
  | 'system.channel'
  | 'system.skills'
  | 'system.runtime'
  | 'tools'
  | 'notes'
  | 'history'
  | `system.context.${string}`
  | `system.skills.${string}`
  | `notes.${string}`
  | `tools.${string}`;

export interface RequestSection {
  id: RequestSectionId;
  chars: number;
  estTokens: number;
  children?: RequestSection[];
}

export interface RequestPlan {
  sections: RequestSection[];
  totalChars: number;
  totalEstTokens: number;
}
