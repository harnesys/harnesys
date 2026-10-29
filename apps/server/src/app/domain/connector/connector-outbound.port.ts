export abstract class ConnectorOutboundPort {
  abstract finalizeOpenDraft(connectorId: string, runId: string): Promise<void>;
  abstract projectRun(orgId: string, threadId: string, runId: string): Promise<void>;
  abstract resumeStreaming(orgId: string, connectorId: string): Promise<void>;
}
