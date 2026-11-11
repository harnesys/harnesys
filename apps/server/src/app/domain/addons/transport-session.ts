export type TransportSessionStatus = 'streaming' | 'parked' | 'closed';

export interface TransportSessionRow {
  orgId: string;
  addonId: string;
  provider: string;
  externalChatId: string;
  threadId: string;
  runId: string;
  draft: string;
  lastSeq: number;
  messageId: string | null;
  status: TransportSessionStatus;
  askId: string | null;
  askOptionsJson: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TransportSessionPatch {
  draft?: string;
  lastSeq?: number;
  messageId?: string | null;
  status?: TransportSessionStatus;
  askId?: string | null;
  askOptionsJson?: string | null;
  updatedAt?: string;
}

export interface TransportAskReply {
  orgId: string;
  addonId: string;
  provider: string;
  channel: string;
  text: string;
}
