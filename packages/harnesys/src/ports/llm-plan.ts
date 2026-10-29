export type RequestSectionId =
  | 'system.prompt'
  | 'system.channel'
  | 'system.skills'
  | 'system.runtime'
  | 'tools'
  | 'notes'
  | 'history'
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
