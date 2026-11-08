# 36. Провайдеры и модели LLM

## Обзор

Система поддерживает нескольких провайдеров LLM (OpenAI, Anthropic, Google, Ollama, OpenRouter и др.) с обнаружением моделей, привязками, ценообразованием и контекстным окном. Реализовано в `app/domain/model-execution/`, `app/infra/model-execution/`, `packages/harnesys/src/adapters/models/`, `packages/harnesys/src/ports/models.ts`.

## Домен (app/domain/model-execution/)

| Файл | Назначение |
|------|------------|
| `image.port.ts` | порт генерации изображений |
| `speech.port.ts` | порт речи |
| `transcription.port.ts` | порт транскрибации |
| `voice-catalog.port.ts` | порт каталога голосов |
| `model-execution.error.ts` | ошибки выполнения модели |

не проверено кодом — точные файлы в `app/domain/model-execution/` не найдены в объёме этого раздела.

## Порты моделей (packages/harnesys/src/ports/models.ts)

### Виды моделей

`MODEL_KINDS` = `chat`, `embed`, `image`, `audio`, `decision`, `rerank`, `speech`, `transcription`, `video`. `SUPPORTED_MODEL_KINDS` = `chat`, `embed`, `decision`, `image`, `speech`, `transcription`.

`isModelKind(value)`, `isModelKindSupported(kind)`, `modelKindFromOutputModalities(outputs)` — по модальностям вывода: `embeddings` → `embed`, `decisions` → `decision`, медиа-модальности → соответствующий kind, иначе `chat`.

### Типы моделей

`ModelFields` (`id?`, `name?`, `description?`, `kind?`, `context_length?`, `architecture?`, `pricing?`, `top_provider?`, `supported_parameters?`, `effort?`, `defaultEffort?`, `reasoningMandatory?`).

`ModelRecord = ModelFields & { name, origin? ('local'\|'remote'), host? }`.

`ResolvedModel = ModelFields & { name, origin? }` — разрешение через `host` с фоллбэком на поля модели (`resolveModel`): сначала поля из `host`, затем поля самой записи, `name` и `origin` из записи.

`ProviderConfig` (`name`, `driver`, `apiKey?`, `apiUrl?`, `headers?`, `enabled?`, `models[]`).

`ModelBinding` (`name`, `driver`, `apiUrl?`, `headers?`, `apiKey?`, `enabled`, `model: ResolvedModel`).

`DiscoveredModel = ModelFields & { name, deprecated?, raw? }`.

`ModelPricing` (`prompt`, `completion`, `image?`, `request?`, `input_cache_read?`, `input_cache_write?`, `overrides?`). `ModelPricingOverride` (`minPromptTokens`, `prompt?`, `completion?`, `input_cache_read?`, `input_cache_write?`, `image?`, `request?`).

`ModelArchitecture` (`modality?`, `input_modalities?`, `output_modalities?`, `tokenizer?`, `instruct_type?`). `ModelTopProvider` (`context_length?`, `max_completion_tokens?`, `is_moderated?`).

### DRIVERS и порты

`DRIVERS` — список драйверов (перечислен в `registry.ts`): `openai`, `openai-compatible`, `anthropic`, `openrouter`, `google`, `groq`, `mistral`, `xai`, `together`, `kimi`, `zai`, `ollama`, `ollama-cloud`, `nvidia`, `cerebras`, `minimax`, `xiaomi`, `qwen`, `alibaba`.

`ModelsPort.get(provider, name) → Promise<ModelBinding>`. `ModelsApi = ModelsPort & { discover(input) → DiscoveredModel[] }`. `DiscoverInput` (`driver`, `apiKey?`, `apiUrl?`, `headers?`, `fetch?`).

`normalizeProvider(provider)` — `enabled` по умолчанию `true`, копия моделей. `resolveModel(record)` — фоллбэк на `host`. `isDriver(value)` — проверка в `DRIVERS`.

## Адаптеры привязки (packages/harnesys/src/adapters/models/)

### binding.ts

`bindingOf(provider, modelName)` → `ModelBinding`: проверка драйвера (`isDriver`), `enabled` не `false`, поиск модели по имени; иначе `ModelLookupError`. `toBinding(provider, record)` — преобразование в `ModelBinding`. `ModelLookupError`, `DiscoverError`, `isDriver`.

### Обнаружение (adapters/models/discover/)

`discover.ts`: `discoverModels(input) → DiscoveredModel[]` (через `discoverAdapter(driver).list(input)`), `discoverModelDetails(input, name)` (через `adapter.details?`).

`registry.ts`: карта драйверов с `defaultApiUrl`, `list`, `details?`:
- `openai` — `https://api.openai.com/v1`
- `openai-compatible` — `https://host/v1`
- `anthropic` — `https://api.anthropic.com/v1`
- `openrouter` — `https://openrouter.ai/api/v1`
- `google` — `https://generativelanguage.googleapis.com/v1beta`
- `groq` — `https://api.groq.com/openai/v1`
- `mistral` — `https://api.mistral.ai/v1`
- `xai` — `https://api.x.ai/v1`
- `together` — `https://api.together.xyz/v1`
- `kimi` — `https://api.moonshot.ai/v1`
- `zai` — `https://api.z.ai/api/paas/v4`, детали через `findOpenRouterModel`
- `ollama` — `http://localhost:11434`, детали `showOllamaModel`
- `ollama-cloud` — `https://ollama.com`, детали `showOllamaCloudModel`
- `nvidia` — `https://integrate.api.nvidia.com/v1`
- `cerebras` — `https://api.cerebras.ai/v1`
- `minimax` — `https://api.minimax.io/v1`
- `xiaomi` — `https://api.xiaomimimo.com/v1`
- `qwen` — `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`
- `alibaba` — `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`

Файлы драйверов: `alibaba.ts`, `anthropic.ts`, `cerebras.ts`, `google.ts`, `groq.ts`, `kimi.ts`, `minimax.ts`, `mistral.ts`, `nvidia.ts`, `ollama.ts`, `openai-compatible.ts`, `openai.ts`, `openrouter-lookup.ts`, `openrouter.ts`, `parse.ts`, `qwen.ts`, `request.ts`, `together.ts`, `xai.ts`, `xiaomi.ts`, `zai.ts`, `fetch-list.ts`.

## Модель выполнения (packages/harnesys/src/adapters/models/)

`ai-llm-adapter.ts`: `callModel`, `CallModelResult`, `StreamChunk`. Вспомогательные: `ai-llm-cache.ts`, `ai-llm-messages.ts`, `ai-llm-chunks.ts`, `ai-llm-normalize.ts`, `ai-llm-retry.ts`, `ai-llm-stream-parts.ts`. — не проверены кодом (файлы не найдены в `adapters/models/`, только `binding.ts`, `discover.ts`, `discover/`).

## Контроллеры (app/api/rest/)

`providers.controller.ts`, `model-image.controller.ts`, `model-speech.controller.ts`, `model-transcription.controller.ts`, `model-voices.controller.ts`. — не проверены кодом.

## Инфраструктура провайдеров (app/infra/model-execution/)

`provider.module.ts`, `sqlite-llm-model.adapter.ts`, `sqlite-llm-provider.adapter.ts` (+ spec). Адаптеры медиа: `audio.module.ts`, `image.module.ts`, `sdk-image.adapter.ts`, `sdk-speech.adapter.ts`, `sdk-transcription.adapter.ts`, `sdk-voice-catalog.adapter.ts`. — не проверены кодом.

## Бюджет и окно контекста

`effectiveModelWindow` в `graph.ts` (см. [18-модель-исполнения-graph.md](./18-модель-исполнения-graph.md)) определяет эффективный размер контекстного окна из привязки (`binding.model.context_length`, `host.context_length`) или override агента (`agent.generation.contextWindowTokens`). При отсутствии окна — ошибка `model_context_window_missing`. — не проверено кодом.

## Контракты (packages/contracts/src/)

Контракты специфических привязок провайдеров в `packages/contracts/src/` не найдены — не проверено кодом.

## Поток обнаружения и привязки модели

```mermaid
flowchart TD
  Providers[ProviderConfig[]: name, driver, apiKey, apiUrl, models[]] --> Get{ModelsPort.get(provider, name)}
  Get --> CheckDriver{isDriver(driver)?}
  CheckDriver -->|нет| ModelLookupError[ModelLookupError: unknown driver]
  CheckDriver -->|да| CheckEnabled{enabled === false?}
  CheckEnabled -->|да| Disabled[ModelLookupError: provider disabled]
  CheckEnabled -->|нет| FindModel{модель name в provider.models?}
  FindModel -->|нет| NotFound[ModelLookupError: model not found]
  FindModel -->|да| ToBinding[toBinding: driver, apiUrl, headers, apiKey, enabled, model=resolveModel(record)]
  ToBinding --> Binding[ModelBinding]
  Discover[discoverModels(input: driver, apiKey, apiUrl, headers, fetch)] --> Adapter[discoverAdapter(driver).list(input)]
  Adapter --> Drivers[карта драйверов: openai, anthropic, google, ollama, openrouter, …]
  Drivers --> DiscoveredModels[DiscoveredModel[]: name, deprecated?, raw?]
```

## Связанные разделы

- [18-модель-исполнения-graph.md](./18-модель-исполнения-graph.md) (выбор модели и фоллбэки)
- [17-compaction-потоков.md](./17-compaction-потоков.md) (окно контекста и компакция)
- [35-знания-и-индекс-knowledge.md](./35-знания-и-индекс-knowledge.md) (эмбеддинги через провайдеры)
- [11-база-данных-schema.md](./11-база-данных-schema.md) (таблицы llmModels, llmProviders)
