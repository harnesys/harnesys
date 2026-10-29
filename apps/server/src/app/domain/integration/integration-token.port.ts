export abstract class IntegrationTokenPort {
  abstract getAccessToken(orgId: string, integrationId: string): Promise<string>;
  abstract getGrantedScopes(orgId: string, integrationId: string): Promise<ReadonlySet<string>>;
}
