import { describe, expect, test } from 'bun:test';
import type { AddonTransportBindingRow } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportBindingRepositoryPort } from '../../../domain/addons/ports/transport-binding-repository.port.ts';
import { AddonTransportSessionRepositoryPort } from '../../../domain/addons/ports/transport-session-repository.port.ts';
import { CreateThreadUseCase } from '../../threads/create-thread.use-case.ts';
import { FakeThreads, MemoryAgents, memoryThread } from '../../threads/thread.fakes.ts';
import { UploadThreadAttachmentUseCase } from '../../threads/upload-thread-attachment.use-case.ts';
import { FakeDispatch, NoopCalls, NullLogger } from '../addons.fakes.ts';
import { NeutralBridgeInboundUseCase } from './neutral-bridge-inbound.use-case.ts';

const BINDING: AddonTransportBindingRow = {
  orgId: 'org1',
  addonId: 'acme.chat',
  provider: 'telegram',
  externalChatId: 'c1',
  threadId: 'thread-1',
  createdAt: '',
};

function build() {
  const dispatch = new FakeDispatch();
  const bindings = Object.create(
    AddonTransportBindingRepositoryPort.prototype,
  ) as AddonTransportBindingRepositoryPort;
  bindings.find = () => BINDING;
  bindings.remove = () => {};
  bindings.add = () => {};

  const threads = new FakeThreads();
  threads.items.set('thread-1', memoryThread({ id: 'thread-1', autoReplyAgentId: null }));

  const createThread = Object.create(CreateThreadUseCase.prototype) as CreateThreadUseCase;
  const outbound = Object.create(
    AddonTransportSessionRepositoryPort.prototype,
  ) as AddonTransportSessionRepositoryPort;
  outbound.isOutbound = () => false;
  const uploads = Object.create(
    UploadThreadAttachmentUseCase.prototype,
  ) as UploadThreadAttachmentUseCase;

  const useCase = new NeutralBridgeInboundUseCase(
    bindings,
    threads,
    new MemoryAgents(),
    createThread,
    dispatch,
    new NoopCalls(),
    outbound,
    uploads,
    new NullLogger(),
  );
  return { useCase, dispatch };
}

function request() {
  return {
    orgId: 'org1',
    addonId: 'acme.chat',
    transportProvider: 'telegram',
    message: { channel: 'c1', text: 'hello' },
  };
}

describe('NeutralBridgeInboundUseCase', () => {
  test('maps a busy dispatch to the busy outcome', async () => {
    const { useCase, dispatch } = build();
    dispatch.outcome = 'busy';
    expect(await useCase.execute(request())).toBe('busy');
  });

  test('maps a suppressed dispatch to skipped', async () => {
    const { useCase, dispatch } = build();
    dispatch.outcome = 'suppressed';
    expect(await useCase.execute(request())).toBe('skipped');
  });
});
