import { Database } from 'bun:sqlite';
import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { IssueAttachmentRecord } from '../../domain/issue/issue.ts';
import { IssueAttachmentRepositoryPort } from '../../domain/issue/issue-attachment-repository.port.ts';
import type { HostFsLayoutPort } from '../../domain/machine/host-fs-layout.port.ts';
import { ensureOrgSchema } from '../org-sqlite/org-sql-ensure.ts';
import { withOrgSqlite } from '../org-sqlite/org-sqlite-session.ts';
import { issueBoardsTable, issuesTable } from '../org-sqlite/schema/index.ts';
import { IssueAttachmentRepositoryAdapter } from './issue-attachment-repository.adapter.ts';

const ORG_ID = 'org-1';
const NOW = new Date().toISOString();

function createLayout(home: string): HostFsLayoutPort {
  return {
    home: () => home,
    configPath: () => join(home, 'config.json'),
    machinePath: () => join(home, 'machine.json'),
    machineDbPath: () => join(home, 'machine.db'),
    identityDbPath: () => join(home, 'identity.db'),
    marketplacesDir: () => join(home, 'marketplaces'),
    marketplaceInstallPath: (registryId) => join(home, 'marketplaces', registryId),
    orgDir: (orgId) => join(home, 'orgs', orgId),
    orgDbPath: (orgId) => join(home, 'orgs', orgId, 'org.db'),
    orgDataDir: (orgId) => join(home, 'data', 'orgs', orgId),
    orgWorkspacePath: (orgId) => join(home, 'data', 'orgs', orgId, 'workspace'),
    orgSourceDir: (orgId, sourceId) => join(home, 'data', 'orgs', orgId, 'sources', sourceId),
    sourceWorktreesDir: (orgId, sourceId) =>
      join(home, 'data', 'orgs', orgId, 'sources', `${sourceId}.worktrees`),
    ensureSourceWorktreesDir: (orgId, sourceId) =>
      join(home, 'data', 'orgs', orgId, 'sources', `${sourceId}.worktrees`),
    skillsDir: (orgId) => join(home, 'orgs', orgId, 'skills'),
    systemSkillsDir: () => join(home, 'skills'),
    hostAgentSkillsDir: () => join(home, '.agents', 'skills'),
    orgSettingsPath: (orgId) => join(home, 'orgs', orgId, 'settings.json'),
    skillsStagingDir: (orgId) => join(home, 'data', 'orgs', orgId, 'skills-staging'),
    mcpConfigPath: (orgId) => join(home, 'orgs', orgId, 'mcp.json'),
    lspConfigPath: (orgId) => join(home, 'orgs', orgId, 'lsp.json'),
    pluginsDir: (orgId) => join(home, 'orgs', orgId, 'plugins'),
    pluginsDataDir: (orgId) => join(home, 'orgs', orgId, 'plugins-data'),
    threadDir: (orgId, threadId) => join(home, 'orgs', orgId, 'threads', threadId),
    nodesDir: () => join(home, 'nodes'),
    nodeIdentityPath: (orgId) => join(home, 'nodes', `${orgId}.json`),
    ensureNodesDir: () => undefined,
    ensureHome: () => undefined,
    ensureMarketplacesDir: () => join(home, 'marketplaces'),
    ensureOrgDir: (orgId) => {
      const dir = join(home, 'orgs', orgId);
      mkdirSync(dir, { recursive: true });
      const sqlite = new Database(join(dir, 'org.db'), { create: true });
      ensureOrgSchema(
        (sql) => {
          sqlite.exec(sql);
        },
        (sql) => sqlite.query(sql).all() as { name: string }[],
      );
      sqlite.close();
    },
    removeOrgDir: (orgId) => rmSync(join(home, 'orgs', orgId), { recursive: true, force: true }),
    removeOrgDataDir: () =>
      rmSync(join(home, 'data', 'orgs', ORG_ID), { recursive: true, force: true }),
    ensureOrgDataDir: () => undefined,
    ensureOrgWorkspace: () => '',
    ensureOrgSourceDir: () => '',
    ensureSkillsDir: () => '',
    ensurePluginsDir: () => '',
    ensureThreadDir: (orgId, threadId) => {
      const dir = join(home, 'orgs', orgId, 'threads', threadId);
      mkdirSync(dir, { recursive: true });
      return dir;
    },
  };
}

function attachment(issueId: string, id: string): IssueAttachmentRecord {
  return {
    id,
    orgId: ORG_ID,
    issueId,
    kind: 'file',
    name: `${id}.txt`,
    mediaType: 'text/plain',
    kindMedia: 'file',
    sizeBytes: 1,
    path: null,
    sourceId: null,
    sourcePath: null,
    createdAt: NOW,
  };
}

describe('IssueAttachmentRepositoryAdapter.countsByIssue', () => {
  let home: string;
  let layout: HostFsLayoutPort;
  let attachments: IssueAttachmentRepositoryPort;
  const boardId = crypto.randomUUID();
  const issueA = crypto.randomUUID();
  const issueB = crypto.randomUUID();

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'harnesys-issue-attachments-'));
    layout = createLayout(home);
    layout.ensureOrgDir(ORG_ID);
    attachments = new IssueAttachmentRepositoryAdapter(layout);
    withOrgSqlite(layout, ORG_ID, (db) => {
      db.insert(issueBoardsTable)
        .values({ id: boardId, orgId: ORG_ID, name: 'board', createdAt: NOW, updatedAt: NOW })
        .run();
      for (const issueId of [issueA, issueB]) {
        db.insert(issuesTable)
          .values({
            id: issueId,
            orgId: ORG_ID,
            boardId,
            title: issueId,
            statusKey: 'todo',
            createdAt: NOW,
            updatedAt: NOW,
          })
          .run();
      }
    });
    attachments.insert(attachment(issueA, crypto.randomUUID()));
    attachments.insert(attachment(issueA, crypto.randomUUID()));
    attachments.insert(attachment(issueB, crypto.randomUUID()));
  });

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });

  test('counts attachments per issue in one grouped query', () => {
    expect(attachments.countsByIssue(ORG_ID)).toEqual(
      expect.arrayContaining([
        { issueId: issueA, count: 2 },
        { issueId: issueB, count: 1 },
      ]),
    );
  });
});
