import type {
  AddonCapabilityItem,
  AddonCapabilityView,
  AddonPlatformFamily,
} from '@harnesys/contracts';
import {
  ContentDescriptorSchema,
  type Contribution,
  HookDescriptorSchema,
  JobDescriptorSchema,
  LspDescriptorSchema,
  McpDescriptorSchema,
  RouteDescriptorSchema,
  resolveL10n,
  SourceKindDescriptorSchema,
  ToolPackDescriptorSchema,
  TransportDescriptorSchema,
  TriggerDescriptorSchema,
  WorkerDescriptorSchema,
} from '@harnesys/sdk';
import type { z } from 'zod';
import type { InstalledAddonPackage } from '../../domain/addons/ports/addon-package-catalog.port.ts';

type CapabilityFamily = Exclude<AddonPlatformFamily, 'config' | 'view'>;
type IdTitleDescriptor = z.infer<typeof SourceKindDescriptorSchema>;

interface CapabilityText {
  title: string;
  description: string;
  items: AddonCapabilityItem[];
}

type CapabilityMapper = (raw: Record<string, unknown>) => CapabilityText | null;

const CAPABILITY_FAMILIES = new Set<string>([
  'tool-pack',
  'trigger',
  'job',
  'worker',
  'route',
  'transport',
  'hook',
  'content',
  'source-kind',
  'mcp',
  'lsp',
]);

const TEXT_MAPPERS: Record<CapabilityFamily, CapabilityMapper> = {
  'tool-pack': toolPackText,
  trigger: triggerText,
  job: jobText,
  worker: workerText,
  route: routeText,
  transport: transportText,
  hook: hookText,
  content: contentText,
  'source-kind': (raw) => idTitleText(SourceKindDescriptorSchema.safeParse(raw)),
  mcp: (raw) => idTitleText(McpDescriptorSchema.safeParse(raw)),
  lsp: (raw) => idTitleText(LspDescriptorSchema.safeParse(raw)),
};

function isCapabilityFamily(value: string): value is CapabilityFamily {
  return CAPABILITY_FAMILIES.has(value);
}

function l10n(value: string | Record<string, string>): string {
  return resolveL10n(value, { locale: 'en' });
}

/** Lists every declared contribution of a package as display-ready capabilities. */
export function capabilitiesViewOf(pkg: InstalledAddonPackage): AddonCapabilityView[] {
  return pkg.manifest.contributions
    .filter((contribution) => isCapabilityFamily(contribution.family))
    .map((contribution) => capabilityOf(contribution.family, contribution));
}

function capabilityOf(family: CapabilityFamily, contribution: Contribution): AddonCapabilityView {
  const mapper: CapabilityMapper | undefined = TEXT_MAPPERS[family];
  const text = mapper?.(contribution.descriptor);
  return {
    family,
    id: contribution.id,
    optional: contribution.optional ?? false,
    title: text?.title ?? contribution.id,
    description: text?.description ?? '',
    items: text?.items ?? [],
  };
}

function toolPackText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = ToolPackDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const pack = parsed.data;
  return {
    title: l10n(pack.title) || pack.name,
    description: l10n(pack.description),
    items: pack.tools.map((tool) => ({
      id: tool.name,
      title: tool.name,
      description: l10n(tool.description),
      effect: tool.effect,
    })),
  };
}

function triggerText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = TriggerDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    title: l10n(parsed.data.title) || parsed.data.kind,
    description: l10n(parsed.data.description),
    items: [],
  };
}

function jobText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = JobDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const { schedule } = parsed.data;
  return {
    title: l10n(parsed.data.title) || parsed.data.id,
    description: 'cron' in schedule ? schedule.cron : `every ${schedule.everySec}s`,
    items: [],
  };
}

function workerText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = WorkerDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    title: l10n(parsed.data.title) || parsed.data.id,
    description: parsed.data.autostart ? 'Starts with the add-on' : 'Starts on demand',
    items: [],
  };
}

function routeText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = RouteDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    title: `${parsed.data.method} ${parsed.data.path}`,
    description: parsed.data.role === 'admin' ? 'Admin access' : 'Member access',
    items: [],
  };
}

function transportText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = TransportDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    title: l10n(parsed.data.title) || parsed.data.provider,
    description: parsed.data.connection,
    items: [],
  };
}

function hookText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = HookDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const on = parsed.data.on;
  return {
    title: parsed.data.id,
    description: 'event' in on ? on.event : `provider event on ${on.providerEvent.connection}`,
    items: [],
  };
}

function contentText(raw: Record<string, unknown>): CapabilityText | null {
  const parsed = ContentDescriptorSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    title: l10n(parsed.data.title) || parsed.data.id,
    description: parsed.data.kind === 'skill' ? 'Skill' : 'Prompt',
    items: [],
  };
}

function idTitleText(
  parsed: { success: true; data: IdTitleDescriptor } | { success: false },
): CapabilityText | null {
  if (!parsed.success) {
    return null;
  }
  return {
    title: l10n(parsed.data.title) || parsed.data.id,
    description: parsed.data.connection ?? '',
    items: [],
  };
}
