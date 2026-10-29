import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { harnesysHome } from './paths.ts';
import { readSession, sessionPath } from './session-store.ts';

interface MachineOrgRow {
  orgId: string;
  name: string;
  role: string;
  relayUrl?: string | null;
}

export async function commandDoctor(): Promise<void> {
  const home = harnesysHome();
  const warnings: string[] = [];
  checkConfigPerms(home, warnings);
  await checkSessionPerms(home, warnings);
  await checkMachine(home, warnings);
  checkNodesDirPerms(home, warnings);
  await checkSessionHealth(home, warnings);
  process.stdout.write(`home: ${home}\n`);
  if (warnings.length > 0) {
    for (const warning of warnings) {
      process.stderr.write(`warning: ${warning}\n`);
    }
    process.exit(1);
  }
  process.stdout.write('doctor: ok\n');
}

function checkConfigPerms(home: string, warnings: string[]): void {
  const configPath = join(home, 'config.json');
  if (!existsSync(configPath)) {
    warnings.push(`missing ${configPath}`);
    return;
  }
  if ((statSync(configPath).mode & 0o777) !== 0o600) {
    warnings.push(`${configPath} permissions are not 0600`);
  }
}

async function checkMachine(home: string, warnings: string[]): Promise<void> {
  const machinePath = join(home, 'machine.json');
  if (!existsSync(machinePath)) {
    process.stdout.write('machine.json absent: no orgs registered on this machine\n');
    return;
  }
  if ((statSync(machinePath).mode & 0o777) !== 0o600) {
    warnings.push(`${machinePath} permissions are not 0600`);
  }
  const file = JSON.parse(readFileSync(machinePath, 'utf8')) as {
    orgs?: MachineOrgRow[];
    activeOrgId?: string | null;
  };
  const orgs = file.orgs ?? [];
  process.stdout.write(
    `machine orgs: ${orgs.length}, activeOrgId: ${file.activeOrgId ?? 'null'}\n`,
  );
  for (const entry of orgs) {
    process.stdout.write(`  - ${entry.orgId} ${entry.name} role=${entry.role}\n`);
    await checkOrgEntry(home, entry, warnings);
  }
}

export function orgDataMissing(role: string, dataDirExists: boolean): boolean {
  return role === 'relay' && !dataDirExists;
}

async function checkOrgEntry(
  home: string,
  entry: MachineOrgRow,
  warnings: string[],
): Promise<void> {
  if (entry.role === 'relay') {
    const dbPath = join(home, 'orgs', entry.orgId, 'org.db');
    if (!existsSync(dbPath)) {
      warnings.push(`relay org ${entry.orgId} missing ${dbPath}`);
    }
    const dataDir = join(home, 'data', 'orgs', entry.orgId);
    if (orgDataMissing(entry.role, existsSync(dataDir))) {
      warnings.push(`org ${entry.orgId}: ${dataDir} missing (promote may not have copied mirrors)`);
    }
    return;
  }
  const identity = join(home, 'nodes', `${entry.orgId}.json`);
  if (!existsSync(identity)) {
    warnings.push(`worker org ${entry.orgId} missing ${identity}`);
    return;
  }
  if ((statSync(identity).mode & 0o777) !== 0o600) {
    warnings.push(`${identity} permissions are not 0600`);
  }
  try {
    const parsed = JSON.parse(readFileSync(identity, 'utf8')) as { relayUrl?: string };
    if (typeof parsed.relayUrl === 'string' && parsed.relayUrl) {
      const reachable = await probeRelay(parsed.relayUrl);
      if (!reachable) {
        warnings.push(`relay not reachable at ${parsed.relayUrl} for org ${entry.orgId}`);
      }
    }
  } catch {
    warnings.push(`identity ${identity} is not valid JSON`);
  }
}

function checkNodesDirPerms(home: string, warnings: string[]): void {
  const nodesDir = join(home, 'nodes');
  if (!existsSync(nodesDir)) {
    return;
  }
  for (const name of readdirSync(nodesDir)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const path = join(nodesDir, name);
    if ((statSync(path).mode & 0o777) !== 0o600) {
      warnings.push(`${path} permissions are not 0600`);
    }
  }
}

async function checkSessionPerms(home: string, warnings: string[]): Promise<void> {
  const path = sessionPath(home);
  if (!existsSync(path)) {
    return;
  }
  if ((statSync(path).mode & 0o777) !== 0o600) {
    warnings.push(`${path} permissions are not 0600`);
  }
}

async function checkSessionHealth(home: string, warnings: string[]): Promise<void> {
  const session = readSession(home);
  if (!session) {
    warnings.push('no session — run: harnesys login <relayUrl>');
    return;
  }
  const relayUrl = session.relayUrl.replace(/\/+$/, '');
  try {
    const response = await fetch(`${relayUrl}/api/health`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(3000),
    });
    if (response.status === 401) {
      warnings.push(`relay rejected the session at ${relayUrl} — run: harnesys login`);
      return;
    }
    if (!response.ok) {
      warnings.push(`relay health check HTTP ${response.status} at ${relayUrl}`);
    }
  } catch {
    warnings.push(`relay not reachable at ${relayUrl}`);
  }
}

async function probeRelay(relayUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${relayUrl.replace(/\/+$/, '')}/api/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return response.ok;
  } catch {
    return false;
  }
}
