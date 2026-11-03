import type {
  ThreadParticipantInsert,
  ThreadParticipantRecord,
  ThreadParticipantRole,
} from './thread.ts';

export abstract class ThreadParticipantRepositoryPort {
  abstract listByThread(orgId: string, threadId: string): ThreadParticipantRecord[];
  abstract findById(
    orgId: string,
    threadId: string,
    id: string,
  ): ThreadParticipantRecord | undefined;
  abstract findByUserId(
    orgId: string,
    threadId: string,
    userId: string,
  ): ThreadParticipantRecord | undefined;
  abstract ensure(rec: ThreadParticipantInsert): ThreadParticipantRecord;
  abstract setRole(orgId: string, threadId: string, id: string, role: ThreadParticipantRole): void;
  abstract touchSeen(orgId: string, threadId: string, providerUserId: string, at: string): void;
  abstract remove(orgId: string, threadId: string, id: string): void;
}
