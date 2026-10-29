import {
  type CapabilityScope,
  type GeneratedImageArtifact,
  ImageGenerationPort,
  type ImageGenerationRequest,
  type ThreadAttachmentPort,
} from 'harnesys';
import type { LlmModelPort, LlmProviderPort } from '../../../domain/provider/llm-provider.port.ts';
import type { SecretStorePort } from '../../../domain/secret/secret-store.port.ts';
import { SdkImageAdapter } from '../../model-execution/sdk-image.adapter.ts';
import { createOrgModelsPort } from '../org-models.port.ts';

interface OrgImageGenerationPortDeps {
  orgId: string;
  providers: LlmProviderPort;
  models: LlmModelPort;
  secrets: SecretStorePort;
  attachments: ThreadAttachmentPort;
}

function fileExtensionOf(mediaType: string): string {
  const subtype = mediaType.split('/')[1] ?? '';
  const clean = subtype.replace(/[^a-z0-9]/gi, '');
  return clean === '' ? 'png' : clean;
}

export class OrgImageGenerationPort extends ImageGenerationPort {
  constructor(private readonly deps: OrgImageGenerationPortDeps) {
    super();
  }

  async generate(
    scope: CapabilityScope,
    request: ImageGenerationRequest,
  ): Promise<GeneratedImageArtifact> {
    const modelsPort = createOrgModelsPort(
      scope.orgId,
      this.deps.providers,
      this.deps.models,
      this.deps.secrets,
    );
    let providerName: string;
    let modelName: string;
    if (request.provider !== undefined && request.model !== undefined) {
      providerName = request.provider;
      modelName = request.model;
    } else {
      const model = this.findImageModel(scope.orgId);
      if (!model) {
        throw new Error(`no image model is attached to org ${scope.orgId}`);
      }
      providerName = model.providerName;
      modelName = model.modelName;
    }
    const binding = await modelsPort.get(providerName, modelName);
    const result = await new SdkImageAdapter().generate(binding, {
      prompt: request.prompt,
      ...(request.size ? { size: request.size } : {}),
    });
    return this.deps.attachments.put(scope, {
      name: `image-${Date.now()}.${fileExtensionOf(result.mimeType)}`,
      mediaType: result.mimeType,
      bytes: Buffer.from(result.base64, 'base64'),
    });
  }

  private findImageModel(orgId: string): { providerName: string; modelName: string } | undefined {
    for (const provider of this.deps.providers.list(orgId)) {
      if (!provider.enabled) {
        continue;
      }
      const model = this.deps.models
        .listByProvider(orgId, provider.id)
        .find((entry) => entry.kind === 'image');
      if (model) {
        return { providerName: provider.name, modelName: model.name };
      }
    }
    return undefined;
  }
}
