import { Injectable } from '@harnesys/brix';
import { GithubAppStore } from '../../infra/integration/github/github-app-store.ts';
import { GithubInstallSessionStore } from '../../infra/integration/github/github-install-sessions.ts';
import {
  convertAppManifest,
  parseAppConversion,
} from '../../infra/integration/github/github-manifest.ts';
import { GithubManifestSessionStore } from '../../infra/integration/github/github-manifest-sessions.ts';

export interface GithubManifestCallbackInput {
  code: string | undefined;
  ticket: string | undefined;
}

export type GithubManifestCallbackResult =
  | { status: 'ready'; orgId: string; appSlug: string; installUrl: string }
  | { status: 'expired' };

@Injectable()
export class GithubManifestCallbackUseCase {
  constructor(
    private readonly manifestSessions: GithubManifestSessionStore,
    private readonly installSessions: GithubInstallSessionStore,
    private readonly appStore: GithubAppStore,
  ) {}

  async execute(input: GithubManifestCallbackInput): Promise<GithubManifestCallbackResult> {
    if (!input.code || !input.ticket) {
      return { status: 'expired' };
    }
    const session = this.manifestSessions.consume(input.ticket);
    if (!session) {
      return { status: 'expired' };
    }
    const conversion = parseAppConversion(
      await convertAppManifest(input.code),
      new Date().toISOString(),
    );
    if (!conversion) {
      return { status: 'expired' };
    }
    this.appStore.saveRegistration(conversion);
    this.installSessions.create(session.orgId, input.ticket, input.ticket);
    return {
      status: 'ready',
      orgId: session.orgId,
      appSlug: conversion.appSlug,
      installUrl: `https://github.com/apps/${conversion.appSlug}/installations/new?state=${encodeURIComponent(input.ticket)}`,
    };
  }
}
