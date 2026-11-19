import { Injectable } from '@harnesys/brix';
import { TextGenerationPort } from '../../domain/model-execution/text.port.ts';
import type { LlmModel, LlmProvider } from '../../domain/provider/llm-provider.port.ts';
import { LlmModelPort, LlmProviderPort } from '../../domain/provider/llm-provider.port.ts';
import { createOrgModelsPort } from '../../domain/provider/org-models.ts';
import { SecretStorePort } from '../../domain/secret/secret-store.port.ts';
import { OrgSettingsPort } from '../../domain/skills/org-settings.port.ts';
import { GitVcsPort } from '../../domain/source/git-vcs.port.ts';
import type { GitFileStatusMap } from '../../domain/source/git-vcs.types.ts';
import {
  GitOperationException,
  SourcePathInvalidException,
} from '../../domain/source/source.error.ts';
import {
  buildCommitPrompt,
  COMMIT_MAX_FILES,
  type CommitPromptFile,
  cleanCommitMessage,
  isNoisyCommitPath,
} from './commit-message-prompt.ts';
import { GitWorktreeResolver } from './git-worktree-resolver.ts';
import { mapGitVcsError } from './map-git-vcs-error.ts';

export interface GenerateCommitMessageInput {
  orgId: string;
  sourceId: string;
  hostId: string;
  worktreeId: string;
  paths: string[];
}

export interface GenerateCommitMessageResult {
  message: string;
}

@Injectable()
export class GenerateCommitMessageUseCase {
  constructor(
    private readonly worktrees: GitWorktreeResolver,
    private readonly git: GitVcsPort,
    private readonly settings: OrgSettingsPort,
    private readonly providers: LlmProviderPort,
    private readonly models: LlmModelPort,
    private readonly secrets: SecretStorePort,
    private readonly text: TextGenerationPort,
  ) {}

  async execute(input: GenerateCommitMessageInput): Promise<GenerateCommitMessageResult> {
    const paths = [...new Set(input.paths.map((path) => path.trim()).filter(Boolean))];
    if (paths.length === 0) {
      throw new SourcePathInvalidException('select at least one file');
    }
    const { cwd } = this.worktrees.resolve(input.orgId, input.sourceId, {
      hostId: input.hostId,
      worktreeId: input.worktreeId,
    });
    const statuses = await this.git.getFileStatus(cwd);
    const selected = paths.filter((path) => {
      const status = statuses.map[path];
      return status !== undefined && status !== 'ignored';
    });
    if (selected.length === 0) {
      throw new SourcePathInvalidException('selected files have no changes');
    }
    const files = await this.collectFiles(cwd, selected.slice(0, COMMIT_MAX_FILES), statuses.map);
    const { vcs } = this.settings.get(input.orgId);
    const binding = await this.resolveBinding(input.orgId, vcs.commitModelId);
    const { system, prompt } = buildCommitPrompt(files, vcs.commitInstructions);
    try {
      const result = await this.text.generate(binding, {
        system,
        prompt,
        maxOutputTokens: 1200,
        orgId: input.orgId,
      });
      const message = cleanCommitMessage(result.text);
      if (!message) {
        throw new GitOperationException(
          'the model returned no commit message; pick a chat model in VCS settings',
        );
      }
      return { message };
    } catch (err) {
      return mapGitVcsError(err);
    }
  }

  private async collectFiles(
    cwd: string,
    paths: string[],
    statusMap: GitFileStatusMap,
  ): Promise<CommitPromptFile[]> {
    const files: CommitPromptFile[] = [];
    for (const path of paths) {
      const status = statusMap[path];
      if (status === undefined) {
        continue;
      }
      if (isNoisyCommitPath(path)) {
        files.push({ path, status, isBinary: false, diff: null });
        continue;
      }
      const diff = await this.git.getDiff(cwd, path);
      files.push({ path, status, isBinary: diff.isBinary, diff: diff.isBinary ? null : diff.diff });
    }
    return files;
  }

  private async resolveBinding(orgId: string, commitModelId: string) {
    const ref = this.resolveModel(orgId, commitModelId);
    const provider = this.providers.findById(orgId, ref.providerId);
    if (!provider) {
      throw new GitOperationException('commit message model provider not found');
    }
    return createOrgModelsPort(orgId, this.providers, this.models, this.secrets).get(
      provider.name,
      ref.name,
    );
  }

  private resolveModel(orgId: string, commitModelId: string): LlmModel {
    const pinned = commitModelId.trim();
    if (pinned) {
      const model = this.models.findById(orgId, pinned);
      if (!model) {
        throw new GitOperationException('commit message model not found, pick another in settings');
      }
      return this.assertChatModel(model);
    }
    const fallback = this.firstChatModel(orgId);
    if (!fallback) {
      throw new GitOperationException('attach a chat model to generate commit messages');
    }
    return fallback;
  }

  private firstChatModel(orgId: string): LlmModel | undefined {
    const providers: LlmProvider[] = this.providers
      .list(orgId)
      .filter((provider) => provider.enabled);
    for (const provider of providers) {
      const model = this.models
        .listByProvider(orgId, provider.id)
        .find((entry) => entry.kind === 'chat');
      if (model) {
        return model;
      }
    }
    return undefined;
  }

  private assertChatModel(model: LlmModel): LlmModel {
    if (model.kind !== 'chat') {
      throw new GitOperationException(`model ${model.name} is not a chat model`);
    }
    return model;
  }
}
