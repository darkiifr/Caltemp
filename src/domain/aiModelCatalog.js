export const MODELS_DEV_BASE_URL = 'https://models.dev';
export const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
export const MODELS_DEV_MODELS_URL = `${MODELS_DEV_BASE_URL}/models.json`;
export const MODELS_DEV_CATALOG_URL = `${MODELS_DEV_BASE_URL}/catalog.json`;

export const FALLBACK_MODELS = [
  {
    id: 'openai/gpt-oss-120b:free',
    name: 'GPT OSS 120B Free',
    provider: 'openai',
    lab: 'openai',
    description: 'Modèle gratuit principal utilisé par Dexter via OpenRouter.',
    contextLength: 131000,
    pricing: null,
    logoUrl: `${MODELS_DEV_BASE_URL}/logos/openai.svg`,
    labLogoUrl: `${MODELS_DEV_BASE_URL}/logos/labs/openai.svg`,
    source: 'fallback',
  },
  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Gemma 3 27B IT Free',
    provider: 'google',
    lab: 'google',
    description: 'Modèle Gemma gratuit utilisé en secours par Dexter.',
    contextLength: 131000,
    pricing: null,
    logoUrl: `${MODELS_DEV_BASE_URL}/logos/google.svg`,
    labLogoUrl: `${MODELS_DEV_BASE_URL}/logos/labs/google.svg`,
    source: 'fallback',
  },
  {
    id: 'google/gemma-3-12b-it:free',
    name: 'Gemma 3 12B IT Free',
    provider: 'google',
    lab: 'google',
    description: 'Modèle Gemma gratuit utilisé en dernier recours par Dexter.',
    contextLength: 131000,
    pricing: null,
    logoUrl: `${MODELS_DEV_BASE_URL}/logos/google.svg`,
    labLogoUrl: `${MODELS_DEV_BASE_URL}/logos/labs/google.svg`,
    source: 'fallback',
  },
];

let cachedCatalog = null;

const providerNames = {
  openai: 'OpenAI',
  anthropic: 'Anthropic',
  google: 'Google',
  mistralai: 'Mistral',
  'meta-llama': 'Meta',
  qwen: 'Qwen',
  deepseek: 'DeepSeek',
  xai: 'xAI',
  cohere: 'Cohere',
};

const providerIcons = {
  openai: 'AI',
  anthropic: 'A',
  google: 'G',
  mistralai: 'M',
  'meta-llama': '∞',
  qwen: 'Q',
  deepseek: 'D',
  xai: 'X',
  cohere: 'C',
};

export const providerBadgeColor = 'text-gray-200 bg-white/10 border-white/10';

export const getProviderId = (modelId = '') => String(modelId).split('/')[0] || 'custom';

export const logoUrlForProvider = (provider) => `${MODELS_DEV_BASE_URL}/logos/${provider}.svg`;

export const logoUrlForLab = (lab) => `${MODELS_DEV_BASE_URL}/logos/labs/${lab}.svg`;

export const getProviderMeta = (modelId = '', providerOverride = '') => {
  const provider = providerOverride || getProviderId(modelId);
  if (!provider || provider === 'custom') {
    return {
      id: 'custom',
      name: 'Modèle personnalisé',
      icon: 'M',
      color: providerBadgeColor,
      logoUrl: '',
    };
  }

  return {
    id: provider,
    name: providerNames[provider] || provider,
    icon: providerIcons[provider] || provider.slice(0, 1).toLocaleUpperCase('fr-FR'),
    color: providerBadgeColor,
    logoUrl: logoUrlForProvider(provider),
  };
};

function getModelsDevEntry(modelsIndex, catalog, modelId) {
  if (modelsIndex?.[modelId]) return modelsIndex[modelId];
  return catalog?.models?.[modelId]
    || catalog?.providers?.openrouter?.models?.[modelId]
    || null;
}

function formatModelName(model, modelsDevEntry) {
  const raw = modelsDevEntry?.name || model.name || model.id;
  return String(raw).replace(/^[^:]+:\s*/, '').trim();
}

function inferSupportedParameters(model, modelsDevEntry) {
  if (Array.isArray(model.supported_parameters)) return model.supported_parameters;
  const inferred = [];
  if (modelsDevEntry?.tool_call) inferred.push('tools');
  if (modelsDevEntry?.structured_output) inferred.push('structured_outputs');
  if (modelsDevEntry?.reasoning) inferred.push('reasoning');
  if (modelsDevEntry?.temperature) inferred.push('temperature');
  return inferred;
}

function normalizeArchitecture(model, modelsDevEntry) {
  if (model.architecture) return model.architecture;
  const inputModalities = modelsDevEntry?.modalities?.input;
  const outputModalities = modelsDevEntry?.modalities?.output;
  if (!Array.isArray(inputModalities) && !Array.isArray(outputModalities)) return null;
  return {
    input_modalities: Array.isArray(inputModalities) ? inputModalities : [],
    output_modalities: Array.isArray(outputModalities) ? outputModalities : [],
    tokenizer: modelsDevEntry?.tokenizer || null,
  };
}

function timestampFromDate(value) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : Math.floor(timestamp / 1000);
}

function normalizeOpenRouterModel(model, modelsDevModels = {}, modelsDevCatalog = {}) {
  const provider = getProviderId(model.id);
  const modelsDevEntry = getModelsDevEntry(modelsDevModels, modelsDevCatalog, model.id);
  const lab = modelsDevEntry?.lab || modelsDevEntry?.creator || provider;
  const contextLength = model.context_length
    || model.contextLength
    || model.top_provider?.context_length
    || modelsDevEntry?.limit?.context
    || modelsDevEntry?.context
    || null;
  const maxCompletionTokens = model.top_provider?.max_completion_tokens
    || model.max_completion_tokens
    || modelsDevEntry?.limit?.output
    || null;

  return {
    id: model.id,
    name: formatModelName(model, modelsDevEntry),
    provider,
    lab,
    family: modelsDevEntry?.family || null,
    releaseDate: modelsDevEntry?.release_date || null,
    lastUpdated: modelsDevEntry?.last_updated || null,
    created: model.created || modelsDevEntry?.created || timestampFromDate(modelsDevEntry?.release_date) || null,
    contextLength,
    maxCompletionTokens,
    pricing: model.pricing || null,
    architecture: normalizeArchitecture(model, modelsDevEntry),
    expirationDate: model.expiration_date || model.expirationDate || null,
    topProvider: model.top_provider || null,
    perRequestLimits: model.per_request_limits || null,
    supportedParameters: inferSupportedParameters(model, modelsDevEntry),
    logoUrl: logoUrlForProvider(provider),
    labLogoUrl: lab ? logoUrlForLab(lab) : '',
    description: model.description || modelsDevEntry?.description || '',
    source: 'openrouter',
  };
}

function getFetchers(primary, fallback) {
  return [primary, fallback]
    .filter((fetcher) => typeof fetcher === 'function')
    .filter((fetcher, index, fetchers) => fetchers.indexOf(fetcher) === index);
}

async function fetchJson(fetcher, url) {
  const response = await fetcher(url, { method: 'GET' });
  if (!response?.ok) throw new Error(`HTTP ${response?.status || 'inconnu'} pour ${url}`);
  return response.json();
}

async function fetchJsonWithFallback(fetchers, url) {
  const errors = [];
  for (const fetcher of fetchers) {
    try {
      return await fetchJson(fetcher, url);
    } catch (error) {
      errors.push(error?.message || String(error));
    }
  }
  throw new Error(errors.join(' | ') || `Impossible de charger ${url}`);
}

export async function loadAiModelCatalog({ fetcher = globalThis.fetch, fallbackFetcher, forceRefresh = false } = {}) {
  if (!forceRefresh && cachedCatalog && cachedCatalog.source !== 'fallback') return cachedCatalog;
  const fetchers = getFetchers(fetcher, fallbackFetcher);
  if (fetchers.length === 0) {
    cachedCatalog = {
      models: FALLBACK_MODELS,
      source: 'fallback',
      error: 'Aucun client HTTP disponible.',
    };
    return cachedCatalog;
  }

  try {
    const openRouter = await fetchJsonWithFallback(fetchers, OPENROUTER_MODELS_URL);
    let modelsDevModels = {};
    let modelsDevCatalog = {};
    const modelsDevErrors = [];
    try {
      modelsDevModels = await fetchJsonWithFallback(fetchers, MODELS_DEV_MODELS_URL);
    } catch (error) {
      modelsDevErrors.push(error?.message || String(error));
    }
    try {
      modelsDevCatalog = await fetchJsonWithFallback(fetchers, MODELS_DEV_CATALOG_URL);
    } catch (error) {
      modelsDevErrors.push(error?.message || String(error));
    }
    const modelsDevError = modelsDevErrors.length ? modelsDevErrors.join(' | ') : null;

    const models = (openRouter.data || [])
      .filter(model => model?.id)
      .map(model => normalizeOpenRouterModel(model, modelsDevModels, modelsDevCatalog))
      .sort((a, b) => Number(b.created || 0) - Number(a.created || 0) || a.id.localeCompare(b.id));

    cachedCatalog = {
      models: models.length ? models : FALLBACK_MODELS,
      source: models.length ? (modelsDevError ? 'openrouter' : 'openrouter+models.dev') : 'fallback',
      error: models.length ? modelsDevError : 'Le catalogue OpenRouter est vide.',
    };
    return cachedCatalog;
  } catch (error) {
    cachedCatalog = {
      models: FALLBACK_MODELS,
      source: 'fallback',
      error: error?.message || String(error),
    };
    return cachedCatalog;
  }
}

export function resetAiModelCatalogCache() {
  cachedCatalog = null;
}

export const getModelLabel = (modelId = '', models = FALLBACK_MODELS) => {
  const model = models.find(item => item.id === modelId);
  return model?.name || modelId || 'Modèle non configuré';
};
