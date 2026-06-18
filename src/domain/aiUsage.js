export const EMPTY_AI_USAGE_STATS = Object.freeze({
  totalRequests: 0,
  totalTokens: 0,
  promptTokens: 0,
  completionTokens: 0,
  models: {},
  lastRequestAt: null,
});

const toCount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
};

export function normalizeAiUsageStats(stats = {}) {
  const models = Object.entries(stats.models || {}).reduce((acc, [id, value]) => {
    if (!id || !value) return acc;
    acc[id] = {
      label: value.label || id,
      requests: toCount(value.requests),
      totalTokens: toCount(value.totalTokens),
      promptTokens: toCount(value.promptTokens),
      completionTokens: toCount(value.completionTokens),
      lastUsedAt: value.lastUsedAt || null,
    };
    return acc;
  }, {});

  return {
    totalRequests: toCount(stats.totalRequests),
    totalTokens: toCount(stats.totalTokens),
    promptTokens: toCount(stats.promptTokens),
    completionTokens: toCount(stats.completionTokens),
    models,
    lastRequestAt: stats.lastRequestAt || null,
  };
}

export function recordAiUsage(stats = {}, event = {}) {
  const current = normalizeAiUsageStats(stats);
  const usage = event.usage || {};
  const modelId = event.actualModel || event.model || 'openrouter/free';
  const requestedAt = event.requestedAt || new Date().toISOString();
  const promptTokens = toCount(usage.prompt_tokens ?? usage.promptTokens);
  const completionTokens = toCount(usage.completion_tokens ?? usage.completionTokens);
  const totalTokens = toCount(usage.total_tokens ?? usage.totalTokens) || promptTokens + completionTokens;
  const currentModel = current.models[modelId] || {
    label: modelId,
    requests: 0,
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    lastUsedAt: null,
  };

  return {
    ...current,
    totalRequests: current.totalRequests + 1,
    totalTokens: current.totalTokens + totalTokens,
    promptTokens: current.promptTokens + promptTokens,
    completionTokens: current.completionTokens + completionTokens,
    lastRequestAt: requestedAt,
    models: {
      ...current.models,
      [modelId]: {
        ...currentModel,
        label: event.actualModel || currentModel.label || modelId,
        requests: currentModel.requests + 1,
        totalTokens: currentModel.totalTokens + totalTokens,
        promptTokens: currentModel.promptTokens + promptTokens,
        completionTokens: currentModel.completionTokens + completionTokens,
        lastUsedAt: requestedAt,
      },
    },
  };
}

export function getMostUsedAiModel(stats = {}) {
  const normalized = normalizeAiUsageStats(stats);
  return Object.entries(normalized.models)
    .map(([id, value]) => ({ id, ...value }))
    .sort((a, b) => b.requests - a.requests || b.totalTokens - a.totalTokens || a.id.localeCompare(b.id))[0] || null;
}
