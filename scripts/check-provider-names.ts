import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const repoRoot = join(import.meta.dir, '..');

const zones = [
  'apps/server/src/app/domain',
  'apps/server/src/app/application',
  'apps/server/src/app/api',
  'apps/webui/src',
];

const exclusions = [
  'apps/webui/src/features/manage-connectors',
  'apps/webui/src/integrations',
  'apps/webui/src/widgets',
  'apps/server/src/app/infra/apps/providers/__fixtures__',
  'apps/server/src/app/domain/connector',
  'apps/server/src/app/domain/integration',
  'apps/server/src/app/domain/source/cloud-remote-backend.port.ts',
  'apps/server/src/app/application/integration',
  'apps/server/src/app/application/connectors',
  'apps/server/src/app/application/source',
  'apps/server/src/app/application/capabilities/org-pack-catalog.ts',
  'apps/server/src/app/application/fleet/resolve-fleet-secrets.use-case.ts',
  'apps/server/src/app/application/release/release-check.use-case.ts',
  'apps/server/src/app/api/rest/integrations.controller.ts',
  'apps/server/src/app/api/rest/integrations-github.controller.ts',
  'apps/server/src/app/api/rest/integrations-google-callback.controller.ts',
  'apps/server/src/app/api/rest/catalog.controller.ts',
  'apps/server/src/app/api/rest/connectors.controller.ts',
  'apps/server/src/app/api/rest/sources.controller.ts',
  'apps/server/src/app/api/api.module.ts',
  'apps/webui/src/features/attach-source',
  'apps/webui/src/features/attach-git',
  'apps/webui/src/features/manage-org-skills',
  'apps/webui/src/features/manage-plugins',
  'apps/webui/src/features/manage-webhook',
  'apps/webui/src/features/manage-project-settings',
  'apps/webui/src/features/app-update',
  'apps/webui/src/features/manage-thread-members',
  'apps/webui/src/shared/api/integrations.ts',
  'apps/webui/src/shared/api/sources.ts',
  'apps/webui/src/shared/config/settings-nav.ts',
];

const tokenBlocklist = new Set(['webhook']);

const ignoredDirNames = new Set(['_kit', '__fixtures__']);

const providersDir = join(repoRoot, 'apps/server/src/app/infra/apps/providers');

const tokens = new Set<string>();

for (const entry of readdirSync(providersDir, { withFileTypes: true })) {
  if (!entry.isDirectory() || ignoredDirNames.has(entry.name) || tokenBlocklist.has(entry.name)) {
    continue;
  }
  tokens.add(entry.name);
}

for (const entry of readdirSync(join(providersDir, '__fixtures__'), { withFileTypes: true })) {
  if (!entry.isDirectory() || tokenBlocklist.has(entry.name)) {
    continue;
  }
  tokens.add(entry.name);
}

if (tokens.size === 0) {
  console.error('check-provider-names: no provider ids derived from infra/apps/providers');
  process.exit(1);
}

const pattern = new RegExp(`(${[...tokens].map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');

const offenses: string[] = [];

const isExcluded = (relDir: string) =>
  exclusions.some((exclusion) => relDir === exclusion || relDir.startsWith(`${exclusion}${sep}`));

const walk = (absDir: string) => {
  const relDir = relative(repoRoot, absDir);
  if (isExcluded(relDir)) {
    return;
  }
  for (const entry of readdirSync(absDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      walk(join(absDir, entry.name));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || /\.spec\.tsx?$/.test(entry.name)) {
      continue;
    }
    const absPath = join(absDir, entry.name);
    const relPath = relative(repoRoot, absPath);
    if (isExcluded(relPath)) {
      continue;
    }
    const lines = readFileSync(absPath, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      pattern.lastIndex = 0;
      const match = pattern.exec(lines[i]);
      if (match) {
        offenses.push(`${relPath}:${i + 1}: ${match[1].toLowerCase()}`);
      }
    }
  }
};

for (const zone of zones) {
  walk(join(repoRoot, zone));
}

if (offenses.length > 0) {
  console.error(`check-provider-names: ${offenses.length} offense(s) in core and webui:`);
  for (const offense of offenses) {
    console.error(offense);
  }
  console.error('Provider tokens must live only in infra/apps/providers/** and webui connector surfaces.');
  process.exit(1);
}

const tokenList = [...tokens].sort().join(', ');
console.log(`check-provider-names: pass (tokens: ${tokenList})`);
