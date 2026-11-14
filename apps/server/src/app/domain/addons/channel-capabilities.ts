export interface ChannelCapabilities {
  canReadUnmentioned: boolean;
  supportsTopics: boolean;
  supportsReplyTargets: boolean;
  canEditMessages: boolean;
  maxMessageLength: number;
  streaming: boolean;
}
