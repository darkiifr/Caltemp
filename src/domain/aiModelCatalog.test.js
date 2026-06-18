import { describe, expect, it, vi } from 'vitest';
import { getProviderMeta, loadAiModelCatalog, resetAiModelCatalogCache } from './aiModelCatalog';

const openRouterPayload = {
  data: [
    {
      id: 'openai/gpt-4o-mini',
      name: 'OpenAI: GPT-4o mini',
      description: 'Fast OpenAI model',
      created: 1710000000,
      context_length: 128000,
      architecture: { input_modalities: ['text'], output_modalities: ['text'], tokenizer: 'GPT' },
      top_provider: { context_length: 128000, max_completion_tokens: 16384, is_moderated: true },
      supported_parameters: ['tools', 'temperature'],
      pricing: { prompt: '0.00000015', completion: '0.0000006', request: '0' },
    },
    {
      id: 'anthropic/claude-3.5-sonnet',
      name: 'Anthropic: Claude 3.5 Sonnet',
      description: 'Claude model',
      created: 1700000000,
      context_length: 200000,
      pricing: { prompt: '0.000003', completion: '0.000015' },
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Meta: Llama 3.3 70B Instruct',
      description: 'Llama model',
      created: 1720000000,
      context_length: 131072,
      pricing: { prompt: '0.00000059', completion: '0.00000079' },
    },
  ],
};

const modelsDevCatalog = {
  providers: {
    openrouter: {
      models: {
        'openai/gpt-4o-mini': { name: 'GPT-4o mini', lab: 'openai' },
        'anthropic/claude-3.5-sonnet': { name: 'Claude 3.5 Sonnet', lab: 'anthropic' },
      },
    },
  },
  models: {
    'openai/gpt-4o-mini': { name: 'GPT-4o mini', lab: 'openai' },
  },
};

const modelsDevModels = {
  'openai/gpt-4o-mini': {
    id: 'openai/gpt-4o-mini',
    name: 'GPT-4o mini',
    family: 'gpt-4o',
    release_date: '2024-07-18',
    last_updated: '2025-01-10',
    limit: { context: 128000, output: 16384 },
    modalities: { input: ['text', 'image'], output: ['text'] },
    tool_call: true,
    structured_output: true,
    temperature: true,
  },
  'anthropic/claude-3.5-sonnet': {
    id: 'anthropic/claude-3.5-sonnet',
    name: 'Claude 3.5 Sonnet',
    family: 'claude',
    release_date: '2024-06-20',
    last_updated: '2024-10-22',
    limit: { context: 200000, output: 8192 },
  },
};

function jsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe('AI dynamic model catalog', () => {
  it('merges OpenRouter models with Models.dev metadata and logos', async () => {
    resetAiModelCatalogCache();
    const fetcher = vi.fn((url) => {
      if (url.includes('openrouter.ai')) return Promise.resolve(jsonResponse(openRouterPayload));
      if (url.includes('models.dev/models.json')) return Promise.resolve(jsonResponse(modelsDevModels));
      if (url.includes('models.dev/catalog.json')) return Promise.resolve(jsonResponse(modelsDevCatalog));
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await loadAiModelCatalog({ fetcher, forceRefresh: true });

    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(result.source).toBe('openrouter+models.dev');
    const openai = result.models.find(model => model.id === 'openai/gpt-4o-mini');
    expect(result.models.map(model => model.id)).toContain('meta-llama/llama-3.3-70b-instruct');
    expect(openai).toMatchObject({
      id: 'openai/gpt-4o-mini',
      name: 'GPT-4o mini',
      provider: 'openai',
      lab: 'openai',
      family: 'gpt-4o',
      releaseDate: '2024-07-18',
      lastUpdated: '2025-01-10',
      created: 1710000000,
      contextLength: 128000,
      maxCompletionTokens: 16384,
      pricing: { prompt: '0.00000015', completion: '0.0000006', request: '0' },
      supportedParameters: ['tools', 'temperature'],
      logoUrl: 'https://models.dev/logos/openai.svg',
      labLogoUrl: 'https://models.dev/logos/labs/openai.svg',
    });
  });

  it('caches the dynamic catalog for the session', async () => {
    resetAiModelCatalogCache();
    const fetcher = vi.fn((url) => {
      if (url.includes('openrouter.ai')) return Promise.resolve(jsonResponse(openRouterPayload));
      if (url.includes('models.dev/models.json')) return Promise.resolve(jsonResponse(modelsDevModels));
      return Promise.resolve(jsonResponse(modelsDevCatalog));
    });

    await loadAiModelCatalog({ fetcher, forceRefresh: true });
    await loadAiModelCatalog({ fetcher });

    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it('returns fallback models when remote catalogs fail', async () => {
    resetAiModelCatalogCache();
    const result = await loadAiModelCatalog({
      forceRefresh: true,
      fetcher: vi.fn(async () => {
        throw new Error('network down');
      }),
    });

    expect(result.source).toBe('fallback');
    expect(result.error).toContain('network down');
    expect(result.models.length).toBeGreaterThan(0);
  });

  it('keeps the full OpenRouter catalog when Models.dev enrichment fails', async () => {
    resetAiModelCatalogCache();
    const fetcher = vi.fn((url) => {
      if (url.includes('openrouter.ai')) return Promise.resolve(jsonResponse(openRouterPayload));
      throw new Error('models.dev down');
    });

    const result = await loadAiModelCatalog({ fetcher, forceRefresh: true });

    expect(result.source).toBe('openrouter');
    expect(result.error).toContain('models.dev down');
    expect(result.models).toHaveLength(openRouterPayload.data.length);
    expect(result.models.map(model => model.id)).toContain('meta-llama/llama-3.3-70b-instruct');
  });

  it('tries the browser fetch fallback when the primary fetcher fails', async () => {
    resetAiModelCatalogCache();
    const primaryFetcher = vi.fn(async () => {
      throw new Error('tauri http blocked');
    });
    const fallbackFetcher = vi.fn((url) => (
      url.includes('openrouter.ai')
        ? Promise.resolve(jsonResponse(openRouterPayload))
        : Promise.resolve(jsonResponse(url.includes('models.dev/models.json') ? modelsDevModels : modelsDevCatalog))
    ));

    const result = await loadAiModelCatalog({
      fetcher: primaryFetcher,
      fallbackFetcher,
      forceRefresh: true,
    });

    expect(primaryFetcher).toHaveBeenCalled();
    expect(fallbackFetcher).toHaveBeenCalled();
    expect(result.source).toBe('openrouter+models.dev');
    expect(result.models).toHaveLength(openRouterPayload.data.length);
  });

  it('uses all OpenRouter models instead of truncating the catalog', async () => {
    resetAiModelCatalogCache();
    const manyModels = {
      data: Array.from({ length: 125 }, (_, index) => ({
        id: `provider/model-${index}`,
        name: `Provider: Model ${index}`,
        created: 1700000000 + index,
      })),
    };
    const fetcher = vi.fn((url) => (
      url.includes('openrouter.ai')
        ? Promise.resolve(jsonResponse(manyModels))
        : Promise.resolve(jsonResponse(url.includes('models.dev/models.json') ? modelsDevModels : modelsDevCatalog))
    ));

    const result = await loadAiModelCatalog({ fetcher, forceRefresh: true });

    expect(result.models).toHaveLength(125);
    expect(result.models[0].id).toBe('provider/model-124');
  });

  it('keeps provider metadata and custom fallback badges', () => {
    expect(getProviderMeta('openai/gpt-4o-mini')).toMatchObject({
      name: 'OpenAI',
      logoUrl: 'https://models.dev/logos/openai.svg',
    });
    expect(getProviderMeta('custom/model')).toMatchObject({
      name: 'Modèle personnalisé',
      icon: 'M',
    });
  });
});
