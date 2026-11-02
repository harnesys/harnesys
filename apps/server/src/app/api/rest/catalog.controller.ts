import { Controller, Get } from '@harnesys/brix';
import { DRIVERS } from 'harnesys';

interface CatalogEndpointResponse {
  id: string;
  label: string;
  apiUrl: string;
  group?: string;
}

interface CatalogDriverResponse {
  id: (typeof DRIVERS)[number];
  defaultUrl: string;
  endpoints: CatalogEndpointResponse[];
}

interface StudioCatalogResponse {
  drivers: CatalogDriverResponse[];
}

const DEFAULT_URLS: Record<(typeof DRIVERS)[number], string> = {
  openai: 'https://api.openai.com/v1',
  'openai-compatible': '',
  anthropic: 'https://api.anthropic.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  xai: 'https://api.x.ai/v1',
  together: 'https://api.together.xyz/v1',
  kimi: 'https://api.moonshot.ai/v1',
  zai: 'https://api.z.ai/api/paas/v4',
  ollama: 'http://localhost:11434',
  'ollama-cloud': 'https://ollama.com',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  minimax: 'https://api.minimax.io/v1',
  xiaomi: 'https://api.xiaomimimo.com/v1',
  qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
  alibaba: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
};

const KIMI_ENDPOINTS: CatalogEndpointResponse[] = [
  {
    id: 'payg-intl',
    label: 'International',
    apiUrl: 'https://api.moonshot.ai/v1',
    group: 'Pay-as-you-go',
  },
  {
    id: 'payg-cn',
    label: 'China',
    apiUrl: 'https://api.moonshot.cn/v1',
    group: 'Pay-as-you-go',
  },
  {
    id: 'coding-intl',
    label: 'International',
    apiUrl: 'https://api.kimi.ai/coding/v1',
    group: 'Coding Plan (subscription)',
  },
  {
    id: 'coding-cn',
    label: 'China',
    apiUrl: 'https://api.kimi.com/coding/v1',
    group: 'Coding Plan (subscription)',
  },
];

const DRIVER_ENDPOINTS: Partial<Record<(typeof DRIVERS)[number], CatalogEndpointResponse[]>> = {
  kimi: KIMI_ENDPOINTS,
};

function driverEndpoints(
  id: (typeof DRIVERS)[number],
  defaultUrl: string,
): CatalogEndpointResponse[] {
  const presets = DRIVER_ENDPOINTS[id];
  if (presets) {
    return presets;
  }
  return defaultUrl ? [{ id: 'default', label: 'Default', apiUrl: defaultUrl }] : [];
}

@Controller()
export class CatalogController {
  @Get('catalog')
  catalog(): StudioCatalogResponse {
    return {
      drivers: DRIVERS.map((id) => {
        const defaultUrl = DEFAULT_URLS[id];
        return {
          id,
          defaultUrl,
          endpoints: driverEndpoints(id, defaultUrl),
        };
      }),
    };
  }
}
