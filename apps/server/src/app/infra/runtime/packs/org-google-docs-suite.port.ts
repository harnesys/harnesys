import type {
  CapabilityScope,
  GoogleDocsAppendInput,
  GoogleDocsDocument,
  GoogleDocsPort,
  GoogleSearchConsolePort,
  GoogleSearchConsoleQueryInput,
  GoogleSearchConsoleRow,
  GoogleSearchConsoleSite,
  GoogleSheetsAppendInput,
  GoogleSheetsMeta,
  GoogleSheetsPort,
  GoogleSheetsRange,
  GoogleSheetsWriteInput,
} from 'harnesys';
import { appendText, getDocument } from '../../integration/google/docs-api.ts';
import {
  GOOGLE_DOCS_SCOPE,
  GOOGLE_SEARCH_CONSOLE_SCOPE,
  GOOGLE_SHEETS_SCOPE,
} from '../../integration/google/google-oauth-device.ts';
import { listSites, searchAnalytics } from '../../integration/google/searchconsole-api.ts';
import {
  getSpreadsheetMeta,
  appendRows as sheetsAppendRows,
  readRange as sheetsReadRange,
  writeRange as sheetsWriteRange,
} from '../../integration/google/sheets-api.ts';
import type { OrgGoogleDeps } from './org-google.port.ts';
import { withGoogleScopes } from './org-google-scope-gate.ts';

const DOCS_SCOPES = [GOOGLE_DOCS_SCOPE] as const;
const SHEETS_SCOPES = [GOOGLE_SHEETS_SCOPE] as const;
const GSC_SCOPES = [GOOGLE_SEARCH_CONSOLE_SCOPE] as const;

export class OrgGoogleDocsSuitePort
  implements GoogleSheetsPort, GoogleDocsPort, GoogleSearchConsolePort
{
  constructor(private readonly deps: OrgGoogleDeps) {}

  getSpreadsheetMeta(
    scope: CapabilityScope,
    integrationId: string,
    spreadsheetId: string,
  ): Promise<GoogleSheetsMeta> {
    return this.withSheets(scope.orgId, integrationId, (token) =>
      getSpreadsheetMeta(token, spreadsheetId),
    );
  }

  readRange(
    scope: CapabilityScope,
    integrationId: string,
    spreadsheetId: string,
    range: string,
  ): Promise<GoogleSheetsRange> {
    return this.withSheets(scope.orgId, integrationId, (token) =>
      sheetsReadRange(token, spreadsheetId, range),
    );
  }

  writeRange(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSheetsWriteInput,
  ): Promise<void> {
    return this.withSheets(scope.orgId, integrationId, (token) => sheetsWriteRange(token, input));
  }

  appendRows(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSheetsAppendInput,
  ): Promise<void> {
    return this.withSheets(scope.orgId, integrationId, (token) => sheetsAppendRows(token, input));
  }

  readDocument(
    scope: CapabilityScope,
    integrationId: string,
    documentId: string,
  ): Promise<GoogleDocsDocument> {
    return this.withDocs(scope.orgId, integrationId, (token) => getDocument(token, documentId));
  }

  appendText(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleDocsAppendInput,
  ): Promise<void> {
    return this.withDocs(scope.orgId, integrationId, (token) => appendText(token, input));
  }

  listSites(scope: CapabilityScope, integrationId: string): Promise<GoogleSearchConsoleSite[]> {
    return this.withGsc(scope.orgId, integrationId, (token) => listSites(token));
  }

  searchAnalytics(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSearchConsoleQueryInput,
  ): Promise<GoogleSearchConsoleRow[]> {
    return this.withGsc(scope.orgId, integrationId, (token) => searchAnalytics(token, input));
  }

  private withSheets<T>(orgId: string, integrationId: string, fn: (token: string) => Promise<T>) {
    return withGoogleScopes(this.deps.tokens, orgId, integrationId, SHEETS_SCOPES, fn);
  }

  private withDocs<T>(orgId: string, integrationId: string, fn: (token: string) => Promise<T>) {
    return withGoogleScopes(this.deps.tokens, orgId, integrationId, DOCS_SCOPES, fn);
  }

  private withGsc<T>(orgId: string, integrationId: string, fn: (token: string) => Promise<T>) {
    return withGoogleScopes(this.deps.tokens, orgId, integrationId, GSC_SCOPES, fn);
  }
}
