export interface EgressProxyStartInput {
  orgId: string;
  scopeKey: string;
  credentialId: string;
  hosts: readonly string[];
}

export interface EgressProxyHandle {
  port: number;
  stop: () => Promise<void>;
}

export abstract class EgressProxyPort {
  abstract start(input: EgressProxyStartInput): Promise<EgressProxyHandle>;

  abstract releaseForCredential(orgId: string, credentialId: string): Promise<string[]>;
}
