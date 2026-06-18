import { describe, expect, it } from 'vitest';
import { getMostUsedAiModel, normalizeAiUsageStats, recordAiUsage } from './aiUsage';

describe('AI usage stats', () => {
  it('normalizes empty usage stats', () => {
    expect(normalizeAiUsageStats()).toMatchObject({
      totalRequests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      models: {},
    });
  });

  it('records request volume, token totals and the most used model', () => {
    const first = recordAiUsage(undefined, {
      model: 'openrouter/free',
      actualModel: 'meta-llama/llama-free',
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
      requestedAt: '2026-06-18T20:00:00.000Z',
    });
    const next = recordAiUsage(first, {
      model: 'openrouter/free',
      actualModel: 'meta-llama/llama-free',
      usage: { prompt_tokens: 60, completion_tokens: 20, total_tokens: 80 },
      requestedAt: '2026-06-18T20:01:00.000Z',
    });

    expect(next.totalRequests).toBe(2);
    expect(next.totalTokens).toBe(220);
    expect(next.promptTokens).toBe(160);
    expect(next.completionTokens).toBe(60);
    expect(next.models['meta-llama/llama-free']).toMatchObject({
      label: 'meta-llama/llama-free',
      requests: 2,
      totalTokens: 220,
    });
    expect(getMostUsedAiModel(next)).toMatchObject({
      id: 'meta-llama/llama-free',
      requests: 2,
      totalTokens: 220,
    });
  });
});
