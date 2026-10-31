import type { CapabilityScope } from '../domain/pack.ts';

export interface GoogleSheetsTab {
  sheetId: number | null;
  title: string;
  rowCount: number | null;
  columnCount: number | null;
}

export interface GoogleSheetsMeta {
  spreadsheetId: string;
  title: string;
  tabs: GoogleSheetsTab[];
}

export interface GoogleSheetsRange {
  range: string;
  rows: string[][];
}

export interface GoogleSheetsWriteInput {
  spreadsheetId: string;
  range: string;
  rows: string[][];
}

export interface GoogleSheetsAppendInput {
  spreadsheetId: string;
  range: string;
  rows: string[][];
}

export interface GoogleDocsDocument {
  documentId: string;
  title: string;
  text: string;
  revisionId: string | null;
}

export interface GoogleDocsAppendInput {
  documentId: string;
  text: string;
}

export interface GoogleSearchConsoleSite {
  siteUrl: string;
  permissionLevel: string | null;
}

export interface GoogleSearchConsoleQueryInput {
  siteUrl: string;
  startDate: string;
  endDate: string;
  dimensions?: string[];
  rowLimit?: number;
}

export interface GoogleSearchConsoleRow {
  keys: string[];
  clicks: number | null;
  impressions: number | null;
  ctr: number | null;
  position: number | null;
}

export interface GoogleSheetsPort {
  getSpreadsheetMeta(
    scope: CapabilityScope,
    integrationId: string,
    spreadsheetId: string,
  ): Promise<GoogleSheetsMeta>;
  readRange(
    scope: CapabilityScope,
    integrationId: string,
    spreadsheetId: string,
    range: string,
  ): Promise<GoogleSheetsRange>;
  writeRange(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSheetsWriteInput,
  ): Promise<void>;
  appendRows(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSheetsAppendInput,
  ): Promise<void>;
}

export interface GoogleDocsPort {
  readDocument(
    scope: CapabilityScope,
    integrationId: string,
    documentId: string,
  ): Promise<GoogleDocsDocument>;
  appendText(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleDocsAppendInput,
  ): Promise<void>;
}

export interface GoogleSearchConsolePort {
  listSites(scope: CapabilityScope, integrationId: string): Promise<GoogleSearchConsoleSite[]>;
  searchAnalytics(
    scope: CapabilityScope,
    integrationId: string,
    input: GoogleSearchConsoleQueryInput,
  ): Promise<GoogleSearchConsoleRow[]>;
}
