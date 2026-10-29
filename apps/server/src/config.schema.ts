import { z } from 'zod';

const EmptyableString = z.preprocess((value) => value ?? '', z.string());

export const HarnesysPathsConfigSchema = z.object({
  home: EmptyableString.default(''),
  masterKey: EmptyableString.default(''),
  publicUrl: EmptyableString.default(''),
});
export type HarnesysPathsConfig = z.infer<typeof HarnesysPathsConfigSchema>;

export const GithubAppConfigSchema = z.object({
  appId: EmptyableString.default(''),
  privateKey: EmptyableString.default('').transform(normalizePem),
  clientId: EmptyableString.default(''),
  clientSecret: EmptyableString.default(''),
  webhookSecret: EmptyableString.default(''),
  appSlug: EmptyableString.default(''),
});

function normalizePem(value: string): string {
  return value.replace(/\\n/g, '\n').trim();
}
export type GithubAppConfig = z.infer<typeof GithubAppConfigSchema>;

export const AppConfigSchema = z.object({
  environment: z.string().default('local'),
  app: z.object({
    name: z.string(),
    description: z.string().optional(),
    version: z.string(),
  }),
  harnesys: HarnesysPathsConfigSchema.default({
    home: '',
    masterKey: '',
    publicUrl: '',
  }),
  githubApp: GithubAppConfigSchema.default({
    appId: '',
    privateKey: '',
    clientId: '',
    clientSecret: '',
    webhookSecret: '',
    appSlug: '',
  }),
});

export type AppConfig = z.infer<typeof AppConfigSchema>;
