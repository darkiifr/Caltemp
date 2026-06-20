import { describe, expect, it } from 'vitest';
import {
  FREE_MODEL_PREFERENCES,
  selectFreeOpenRouterModels,
  shouldRetryOpenRouterError,
} from './ai';

describe('OpenRouter free model router', () => {
  it('selects only the approved GPT OSS and Gemma free text models', () => {
    const models = [
      {
        id: 'paid/model',
        pricing: { prompt: '0.1', completion: '0' },
        architecture: { output_modalities: ['text'] },
        supported_parameters: ['tools'],
      },
      {
        id: 'expired/free',
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        expiration_date: '2026-01-01',
        supported_parameters: ['tools'],
      },
      {
        id: 'image/free',
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['image'] },
        supported_parameters: ['tools'],
      },
      {
        id: FREE_MODEL_PREFERENCES[1],
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        supported_parameters: ['response_format'],
      },
      {
        id: FREE_MODEL_PREFERENCES[2],
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        supported_parameters: ['temperature'],
      },
      {
        id: 'other/free-text',
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        supported_parameters: ['temperature'],
      },
      {
        id: 'expired/camel-free',
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        expirationDate: '2026-01-01',
        supportedParameters: ['tools'],
      },
      {
        id: 'structured/camel-free',
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        created: 5,
        supportedParameters: ['structured_outputs'],
      },
      {
        id: FREE_MODEL_PREFERENCES[0],
        pricing: { prompt: '0', completion: '0' },
        architecture: { output_modalities: ['text'] },
        supported_parameters: ['tools', 'structured_outputs'],
      },
    ];

    const selected = selectFreeOpenRouterModels(models, {
      now: new Date('2026-06-20T12:00:00.000Z'),
      limit: 3,
    });

    expect(selected).toEqual([
      FREE_MODEL_PREFERENCES[0],
      FREE_MODEL_PREFERENCES[1],
      FREE_MODEL_PREFERENCES[2],
    ]);
  });

  it('falls back only for transient OpenRouter errors', () => {
    expect(shouldRetryOpenRouterError({ status: 429 })).toBe(true);
    expect(shouldRetryOpenRouterError({ status: 503 })).toBe(true);
    expect(shouldRetryOpenRouterError(new Error('empty response from provider'))).toBe(true);
    expect(shouldRetryOpenRouterError({ status: 401 })).toBe(false);
    expect(shouldRetryOpenRouterError({ status: 402 })).toBe(false);

    const abort = new DOMException('cancelled', 'AbortError');
    expect(shouldRetryOpenRouterError(abort)).toBe(false);
  });
});
