import type { FieldSpec, OrgAddonDetail } from '@harnesys/contracts';

export type SectionL10n = string | Record<string, string>;

export interface AddonRouteRef {
  route: string;
  params?: Record<string, string>;
}

export interface AddonColumn {
  key: string;
  label: SectionL10n;
  format: 'text' | 'datetime' | 'number' | 'badge' | 'link';
}

export interface AddonSectionAction {
  id: string;
  label: SectionL10n;
  route: AddonRouteRef;
  confirm?: SectionL10n;
  destructive?: boolean;
}

export type AddonViewSection =
  | { type: 'status' }
  | { type: 'capabilities' }
  | { type: 'permissions' }
  | { type: 'config'; fields?: string[] }
  | { type: 'connections'; connections?: string[] }
  | { type: 'automations'; triggers?: string[] }
  | { type: 'jobs' }
  | {
      type: 'table';
      title: SectionL10n;
      source: AddonRouteRef;
      columns: AddonColumn[];
      rowActions?: AddonSectionAction[];
      pageSize?: number;
    }
  | {
      type: 'form';
      title: SectionL10n;
      fields: FieldSpec[];
      submit: AddonRouteRef;
      confirm?: SectionL10n;
    }
  | { type: 'actions'; actions: AddonSectionAction[] }
  | { type: 'markdown'; body: SectionL10n }
  | { type: 'frame'; route: string; height?: number };

export interface AddonTriggerDescriptor {
  kind: string;
  title: SectionL10n;
  description?: SectionL10n;
  configFields?: FieldSpec[];
  connection?: string;
}

export type SectionEntry =
  | { kind: 'known'; section: AddonViewSection }
  | { kind: 'unknown'; sectionType: string };

export const DEFAULT_SECTION_ORDER = [
  'capabilities',
  'permissions',
  'config',
  'connections',
  'automations',
  'jobs',
] as const;

const KNOWN_SECTION_TYPES = ['status', ...DEFAULT_SECTION_ORDER] as const;

interface RawContribution {
  id?: unknown;
  family?: unknown;
  descriptor?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function contributionsOf(detail: OrgAddonDetail): RawContribution[] {
  return detail.contributions as RawContribution[];
}

function descriptorOf(detail: OrgAddonDetail, family: string): Record<string, unknown> | null {
  for (const contribution of contributionsOf(detail)) {
    if (contribution.family === family && isRecord(contribution.descriptor)) {
      return contribution.descriptor;
    }
  }
  return null;
}

export function configFieldsFromDetail(detail: OrgAddonDetail): FieldSpec[] {
  const descriptor = descriptorOf(detail, 'config');
  const fields = descriptor?.fields;
  return Array.isArray(fields) ? (fields as FieldSpec[]) : [];
}

export function triggerDescriptorsFromDetail(detail: OrgAddonDetail): AddonTriggerDescriptor[] {
  const output: AddonTriggerDescriptor[] = [];
  for (const contribution of contributionsOf(detail)) {
    if (contribution.family !== 'trigger' || !isRecord(contribution.descriptor)) {
      continue;
    }
    const descriptor = contribution.descriptor;
    if (typeof descriptor.kind !== 'string') {
      continue;
    }
    output.push({
      kind: descriptor.kind,
      title: (descriptor.title as SectionL10n | undefined) ?? descriptor.kind,
      description: descriptor.description as SectionL10n | undefined,
      configFields: Array.isArray(descriptor.configFields)
        ? (descriptor.configFields as FieldSpec[])
        : [],
      connection: typeof descriptor.connection === 'string' ? descriptor.connection : undefined,
    });
  }
  return output;
}

export function viewSectionsFromDetail(detail: OrgAddonDetail): SectionEntry[] | null {
  const descriptor = descriptorOf(detail, 'view');
  const rawSections = descriptor?.sections;
  if (!Array.isArray(rawSections)) {
    return null;
  }
  const entries: SectionEntry[] = [];
  for (const raw of rawSections) {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      continue;
    }
    const sectionType = raw.type;
    if (isKnownSectionType(sectionType)) {
      entries.push({ kind: 'known', section: raw as AddonViewSection });
    } else {
      entries.push({ kind: 'unknown', sectionType });
    }
  }
  return entries;
}

export function defaultSectionEntries(): SectionEntry[] {
  return DEFAULT_SECTION_ORDER.map((type) => ({
    kind: 'known',
    section: { type } as AddonViewSection,
  }));
}

const PREVIEW_SECTION_TYPES = new Set(['permissions', 'connections', 'markdown', 'capabilities']);

/**
 * Sections that stay readable while the organization has no row for the add-on:
 * they describe what enabling would do and never mutate state.
 */
export function isPreviewSection(entry: SectionEntry): boolean {
  return entry.kind === 'known' && PREVIEW_SECTION_TYPES.has(entry.section.type);
}

function isKnownSectionType(sectionType: string): boolean {
  return KNOWN_SECTION_TYPES.some((type) => type === sectionType);
}
