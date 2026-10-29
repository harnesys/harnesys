import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Brix, Logger, parseConfigYaml } from '@harnesys/brix';
import { AppModule } from './app/app.module';
import { RefreshAllSourceVcsUseCase } from './app/application/source/refresh-all-source-vcs.use-case.ts';
import { HostFsLayoutPort } from './app/domain/machine/host-fs-layout.port.ts';
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

const seedLogger = app.container.resolve<Logger>(Logger).child('skills-seed');
try {
  const layout = app.container.resolve<HostFsLayoutPort>(HostFsLayoutPort);
  const result = seedSystemSkills({
    bundledRoot: bundledAssetsRoot(),
    targetDir: layout.systemSkillsDir(),
    appVersion: APP_VERSION,
  });
  seedLogger.info({ seeded: result.seeded, added: result.added }, 'system skills seed complete');
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
