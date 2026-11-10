import type { ProviderModule } from '../../../domain/apps/provider-module.ts';
import { githubProvider } from './github/index.ts';
import { googleProvider } from './google/index.ts';
import { telegramProvider } from './telegram/index.ts';

export const providerModules: readonly ProviderModule[] = [
  googleProvider,
  githubProvider,
  telegramProvider,
];
