import { describe, expect, test } from 'bun:test';
import {
  MemoryThreadMembers,
  MemoryThreads,
  memoryThread,
} from '../../../../application/threads/thread.fakes.ts';
import { callCtx } from '../spec-fakes.ts';
import { stubEffectiveSkills, stubOrgSkills } from '../spec-fakes-reads.ts';
import { SkillsHostService } from './skills-service.ts';

const SKILL = { name: 'review', description: 'Review code', origin: { kind: 'org' } };

describe('skills service', () => {
  test('lists org skills when no threadId is given', async () => {
    const orgSkills = stubOrgSkills([SKILL]);
    const svc = new SkillsHostService(
      new MemoryThreads(),
      new MemoryThreadMembers(),
      stubEffectiveSkills([]),
      orgSkills,
    );
    const spec = svc.methods[0];
    expect(spec?.name).toBe('skills.list');
    expect(spec?.permission).toBe('skills.read');
    await expect(spec?.handle(callCtx(), {})).resolves.toEqual({
      skills: [{ id: 'review', name: 'review', description: 'Review code', source: 'org' }],
    });
    expect(orgSkills.requests[0]).toEqual({ orgId: 'org1' });
  });

  test('uses the thread agent effective skills when threadId is given', async () => {
    const threads = new MemoryThreads();
    threads.seed(memoryThread({ id: 't1', orgId: 'org1' }));
    const members = new MemoryThreadMembers();
    members.ensure('org1', 't1', 'a1');
    const effective = stubEffectiveSkills([SKILL]);
    const svc = new SkillsHostService(threads, members, effective, stubOrgSkills([]));
    await expect(svc.methods[0]?.handle(callCtx(), { threadId: 't1' })).resolves.toEqual({
      skills: [{ id: 'review', name: 'review', description: 'Review code', source: 'org' }],
    });
    expect(effective.requests[0]).toEqual({ orgId: 'org1', agentId: 'a1' });
  });

  test('maps an unknown thread to not_found and an agent-less thread to an empty list', async () => {
    const threads = new MemoryThreads();
    const members = new MemoryThreadMembers();
    threads.seed(memoryThread({ id: 't2', orgId: 'org1' }));
    const svc = new SkillsHostService(threads, members, stubEffectiveSkills([]), stubOrgSkills([]));
    await expect(svc.methods[0]?.handle(callCtx(), { threadId: 'missing' })).rejects.toMatchObject({
      reason: 'not_found',
    });
    await expect(svc.methods[0]?.handle(callCtx(), { threadId: 't2' })).resolves.toEqual({
      skills: [],
    });
  });
});
