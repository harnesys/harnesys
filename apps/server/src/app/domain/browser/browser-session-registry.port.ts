export abstract class BrowserSessionRegistryPort {
  abstract releaseForCredential(credentialId: string): Promise<string[]>;
}
