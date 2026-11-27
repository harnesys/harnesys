import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Brix, isClientAbortError, Logger, parseConfigYaml } from '@harnesys/brix';
import { AppModule } from './app/app.module';
import { InitOwnerUseCase } from './app/application/identity/init-owner.use-case.ts';
import { RefreshAllSourceVcsUseCase } from './app/application/source/refresh-all-source-vcs.use-case.ts';
import { OwnerAlreadyInitializedException } from './app/domain/identity/identity.error.ts';
import { HostFsLayoutPort } from './app/domain/machine/host-fs-layout.port.ts';
import { runCredentialPluginMode } from './app/infra/browser/credential-plugin-mode.ts';
import { fleetWorkerWebsocket, registerFleetWorkerWs } from './app/infra/fleet-hub/fleet-worker.ws';
import { importLegacyUserPresets } from './app/infra/presets/legacy-user-presets.ts';
import { systemPresetsSeed } from './app/infra/presets/system-presets-seed.ts';
import { seedSystemSkills } from './app/infra/skills/system-skills-seed.ts';
import { registerTerminalWs } from './app/infra/terminal/terminal.ws';
import { AppConfigSchema } from './config.schema';
import {
  APP_CONFIG_DIR_PATH,
  APP_VERSION,
  bundledAssetsRoot,
  EMBEDDED_APP_CONFIG_YML,
} from './const';

if (await runCredentialPluginMode(process.argv)) {
  process.exit(0);
}

const configFile = join(APP_CONFIG_DIR_PATH, 'application.yml');
const app = Brix.create(AppModule.forRoot(), {
  config: existsSync(configFile)
    ? { schema: AppConfigSchema, configDir: APP_CONFIG_DIR_PATH }
    : {
        schema: AppConfigSchema,
        preloadedConfig: parseConfigYaml(EMBEDDED_APP_CONFIG_YML, process.env),
      },
});

await app.init();

const boundaryLogger = app.container.resolve<Logger>(Logger).child('process-boundary');
process.on('unhandledRejection', (reason) => {
  if (isClientAbortError(reason)) {
    boundaryLogger.debug({ reason: String(reason) }, 'unhandled client-abort rejection');
    return;
  }
  boundaryLogger.error({ err: reason }, 'unhandled promise rejection');
});

const seedLogger = app.container.resolve<Logger>(Logger).child('skills-seed');
try {
  const layout = app.container.resolve<HostFsLayoutPort>(HostFsLayoutPort);
  const result = seedSystemSkills({
    bundledRoot: bundledAssetsRoot(),
    targetDir: layout.systemSkillsDir(),
    appVersion: APP_VERSION,
  });
  seedLogger.info(
    { synced: result.synced, added: result.added, removed: result.removed },
    'system skills seed complete',
  );
} catch (error) {
  seedLogger.warn({ error }, 'system skills seed failed');
}

const presetSeedLogger = app.container.resolve<Logger>(Logger).child('presets-seed');
try {
  const layout = app.container.resolve<HostFsLayoutPort>(HostFsLayoutPort);
  const seeded = systemPresetsSeed({ layout, log: presetSeedLogger });
  presetSeedLogger.info({ ...seeded }, 'system presets seed complete');
  const legacy = importLegacyUserPresets({ layout, log: presetSeedLogger });
  presetSeedLogger.info({ ...legacy }, 'legacy user presets import complete');
} catch (error) {
  presetSeedLogger.warn({ error }, 'presets seed failed');
}

registerFleetWorkerWs(app.hono, app.container);
registerTerminalWs(app.hono, app.container);

const ownerPassword = process.env.OWNER_PASSWORD;
if (ownerPassword) {
  const ownerLogger = app.container.resolve<Logger>(Logger).child('owner-bootstrap');
  try {
    const result = await app.container.resolve<InitOwnerUseCase>(InitOwnerUseCase).execute({
      login: process.env.OWNER_LOGIN || 'owner',
      name: process.env.OWNER_NAME || 'Owner',
      password: ownerPassword,
    });
    ownerLogger.info({ userId: result.userId }, 'owner created from env');
  } catch (error) {
    if (error instanceof OwnerAlreadyInitializedException) {
      ownerLogger.info({}, 'users already exist, OWNER_PASSWORD ignored');
    } else {
      ownerLogger.warn({ error }, 'owner bootstrap failed');
    }
  }
}

await app.serve({ idleTimeout: 120, websocket: fleetWorkerWebsocket as object });
void app.container
  .resolve<RefreshAllSourceVcsUseCase>(RefreshAllSourceVcsUseCase)
  .execute()
  .catch((error) => {
    app.container
      .resolve<Logger>(Logger)
      .child('vcs-startup')
      .warn({ error }, 'startup vcs batch failed');
  });
