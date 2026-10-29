import { existsSync } from 'node:fs';
import { Inject, Injectable, Logger } from '@harnesys/brix';
import {
  type WorkspaceContainerEnsureInput,
  WorkspaceContainerPort,
  type WorkspaceContainerRef,
} from '../../domain/process-runtime/workspace-container.port.ts';
import { probeDocker } from '../fleet-hub/docker-probe.util.ts';
import { containerNameOf, workspaceRunArgs } from './workspace-container-args.ts';

export const WORKSPACE_CONTAINER_SEAM = Symbol('WorkspaceContainerSeam');

export interface WorkspaceContainerSeam {
  existsImpl?: (path: string) => boolean;
  spawnImpl?: typeof Bun.spawn;
}

const PIDFILE_DIR = '/tmp/.harness-jobs';

interface DockerInspectRecord {
  HostConfig?: { Binds?: string[] } | null;
}

interface DockerRunResult {
  code: number;
  stdout: string;
  stderr: string;
}

export const realWorkspaceContainerSeam: Required<WorkspaceContainerSeam> = {
  existsImpl: (path) => existsSync(path),
  spawnImpl: Bun.spawn,
};

@Injectable()
export class DockerWorkspaceAdapter extends WorkspaceContainerPort {
  private readonly log: Logger;
  private readonly exists: (path: string) => boolean;
  private readonly spawn: typeof Bun.spawn;

  constructor(logger: Logger, @Inject(WORKSPACE_CONTAINER_SEAM) seam: WorkspaceContainerSeam = {}) {
    super();
    this.log = logger.child('docker-workspace');
    this.exists = seam.existsImpl ?? realWorkspaceContainerSeam.existsImpl;
    this.spawn = seam.spawnImpl ?? realWorkspaceContainerSeam.spawnImpl;
  }

  async ensure(input: WorkspaceContainerEnsureInput): Promise<WorkspaceContainerRef> {
    const name = containerNameOf(input.orgId, input.workspaceKey);
    const existingId = await this.inspectId(name);
    if (existingId !== '') {
      await this.bootstrapJobsDir(name, false);
      return { containerId: existingId, name };
    }
    const created = await this.run(
      workspaceRunArgs({
        name,
        image: input.image,
        mounts: input.mounts,
        orgId: input.orgId,
        workspaceKey: input.workspaceKey,
      }),
    );
    if (created.code !== 0) {
      const racedId = isNameConflict(created.stderr) ? await this.inspectId(name) : '';
      if (racedId !== '') {
        await this.bootstrapJobsDir(name, false);
        this.log.info(
          { orgId: input.orgId, workspaceKey: input.workspaceKey, containerId: racedId },
          `workspace container reused after name conflict: ${name}`,
        );
        return { containerId: racedId, name };
      }
      throw new Error(created.stderr.trim() || `docker run failed for ${name} (${created.code})`);
    }
    await this.bootstrapJobsDir(name, true);
    this.log.info(
      { orgId: input.orgId, workspaceKey: input.workspaceKey, containerId: created.stdout.trim() },
      `workspace container created: ${name}`,
    );
    return { containerId: created.stdout.trim(), name };
  }

  async release(orgId: string, workspaceKey: string): Promise<void> {
    const name = containerNameOf(orgId, workspaceKey);
    const removed = await this.run(['docker', 'rm', '-f', name]);
    if (removed.code !== 0) {
      return;
    }
    this.log.info({ orgId, workspaceKey }, `workspace container released: ${name}`);
  }

  async reconcile(orgId: string): Promise<void> {
    const list = await this.run([
      'docker',
      'ps',
      '-a',
      '--filter',
      `label=harness.org=${orgId}`,
      '--format',
      '{{.ID}}',
    ]);
    if (list.code !== 0) {
      return;
    }
    const ids = list.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '');
    for (const id of ids) {
      await this.reconcileOne(orgId, id);
    }
  }

  async probe(): Promise<boolean> {
    return probeDocker(this.spawn);
  }

  private async inspectId(name: string): Promise<string> {
    const inspected = await this.run(['docker', 'inspect', '--format', '{{.Id}}', name]);
    return inspected.code === 0 ? inspected.stdout.trim() : '';
  }

  private async bootstrapJobsDir(name: string, wipe: boolean): Promise<void> {
    const script = wipe
      ? `rm -rf ${PIDFILE_DIR} && mkdir -p ${PIDFILE_DIR}`
      : `mkdir -p ${PIDFILE_DIR}`;
    const done = await this.run(['docker', 'exec', name, '/bin/sh', '-c', script]);
    if (done.code !== 0) {
      this.log.warn({ name, code: done.code }, `pidfile dir bootstrap failed for ${name}`);
    }
  }

  private async reconcileOne(orgId: string, containerId: string): Promise<void> {
    const inspected = await this.run(['docker', 'inspect', containerId]);
    if (inspected.code !== 0) {
      return;
    }
    const hostPath = firstBindHostPath(inspected.stdout);
    if (hostPath === undefined || this.exists(hostPath)) {
      return;
    }
    await this.run(['docker', 'rm', '-f', containerId]);
    this.log.info({ orgId, hostPath }, `workspace container removed: ${containerId}`);
  }

  private async run(argv: string[]): Promise<DockerRunResult> {
    const proc = this.spawn(argv, { stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    return { code, stdout, stderr };
  }
}

function isNameConflict(stderr: string): boolean {
  return stderr.includes('already in use') || stderr.includes('Conflict');
}

function firstBindHostPath(inspectOut: string): string | undefined {
  try {
    const parsed: unknown = JSON.parse(inspectOut);
    if (!Array.isArray(parsed)) {
      return undefined;
    }
    const record = parsed[0] as DockerInspectRecord | undefined;
    const bind = record?.HostConfig?.Binds?.[0];
    if (bind === undefined) {
      return undefined;
    }
    return bind.split(':')[0];
  } catch {
    return undefined;
  }
}
