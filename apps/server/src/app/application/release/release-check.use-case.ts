import { Injectable, Logger, type ModuleDestroyHook, type ModuleInitHook } from '@harnesys/brix';
import { isNewerVersion, parseVersion } from '@harnesys/studio-shared';
import { Cron } from 'croner';
import { serverVersion } from '../../api/rest/server-version.ts';
import { OrgMachineStore } from '../../domain/machine/org-machine-store.port.ts';
import { ReleaseEventsPort } from '../../domain/release/release-events.port.ts';

const REPO = 'harnesys/harnesys';
const GH_API = 'https://api.github.com';
/** Daily at 09:00 UTC; plus one shortly after boot so restarts catch up. */
const CRON_EXPRESSION = '0 9 * * *';
const BOOT_DELAY_MS = 30_000;
const FETCH_TIMEOUT_MS = 15_000;

interface GithubLatestRelease {
  tag_name?: string;
}

/**
 * Daily GitHub release check; when a newer release exists, announces it once
 * per server run to every known org over the SSE release channel so open
 * clients learn about updates without any client-side polling.
 */
@Injectable()
export class ReleaseCheckUseCase implements ModuleInitHook, ModuleDestroyHook {
  private readonly log: Logger;
  private cron: Cron | null = null;
  private bootTimer: ReturnType<typeof setTimeout> | null = null;
  private announcedVersion: string | null = null;

  constructor(
    private readonly releaseEvents: ReleaseEventsPort,
    private readonly store: OrgMachineStore,
    logger: Logger,
  ) {
    this.log = logger.child('release-check');
  }

  onModuleInit(): void {
    this.bootTimer = setTimeout(() => {
      void this.checkOnce();
    }, BOOT_DELAY_MS);
    this.cron = new Cron(CRON_EXPRESSION, () => {
      void this.checkOnce();
    });
  }

  onModuleDestroy(): void {
    if (this.bootTimer !== null) {
      clearTimeout(this.bootTimer);
      this.bootTimer = null;
    }
    this.cron?.stop();
    this.cron = null;
  }

  async checkOnce(): Promise<void> {
    const latestVersion = await this.fetchLatestVersion();
    const currentVersion = serverVersion();
    if (
      latestVersion === null ||
      !isNewerVersion(currentVersion, latestVersion) ||
      latestVersion === this.announcedVersion
    ) {
      return;
    }
    this.announcedVersion = latestVersion;
    for (const entry of this.store.list()) {
      this.releaseEvents.publish(entry.orgId, currentVersion, latestVersion);
    }
    this.log.info(
      { currentVersion, latestVersion },
      'newer release published to connected clients',
    );
  }

  private async fetchLatestVersion(): Promise<string | null> {
    try {
      const response = await fetch(`${GH_API}/repos/${REPO}/releases/latest`, {
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'harnesys-host' },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as GithubLatestRelease;
      const tag = typeof body.tag_name === 'string' ? body.tag_name : '';
      return parseVersion(tag) !== null ? tag.replace(/^v/, '') : null;
    } catch {
      return null;
    }
  }
}
