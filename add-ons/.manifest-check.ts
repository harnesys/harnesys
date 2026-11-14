import {
  ConfigDescriptorSchema,
  RouteDescriptorSchema,
  ToolPackDescriptorSchema,
  TransportDescriptorSchema,
  TriggerDescriptorSchema,
  ViewDescriptorSchema,
  WorkerDescriptorSchema,
  parseAddonManifest,
} from '../packages/sdk/src/index.ts';

interface DescriptorSchema {
  safeParse(value: unknown): { success: boolean; error?: { message: string } };
}

const schemas: Record<string, DescriptorSchema> = {
  config: ConfigDescriptorSchema,
  transport: TransportDescriptorSchema,
  worker: WorkerDescriptorSchema,
  'tool-pack': ToolPackDescriptorSchema,
  trigger: TriggerDescriptorSchema,
  view: ViewDescriptorSchema,
  route: RouteDescriptorSchema,
};

const files = process.argv.slice(2);
let failed = false;
for (const file of files) {
  const manifest = parseAddonManifest(await Bun.file(file).json());
  for (const contribution of manifest.contributions) {
    const schema = schemas[contribution.family];
    if (schema === undefined) {
      console.error(`${manifest.id}: no local schema for family ${contribution.family}`);
      failed = true;
      continue;
    }
    const parsed = schema.safeParse(contribution.descriptor);
    if (!parsed.success) {
      console.error(`${manifest.id}/${contribution.id}: ${parsed.error?.message ?? 'invalid'}`);
      failed = true;
    }
  }
  const ids = new Set(manifest.contributions.map((entry) => entry.id));
  if (ids.size !== manifest.contributions.length) {
    console.error(`${manifest.id}: duplicate contribution ids`);
    failed = true;
  }
  console.log(`${manifest.id}: ${manifest.contributions.length} contributions checked`);
}
if (failed) {
  process.exit(1);
}
