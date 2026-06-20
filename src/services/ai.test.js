import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FREE_MODEL_PREFERENCES,
  generateText,
  isAiConfigured,
  OPENROUTER_FREE_MODEL_ID,
  OPENROUTER_FREE_MODEL_IDS,
} from './ai';

const { tauriFetchMock } = vi.hoisted(() => ({
  tauriFetchMock: vi.fn(),
}));

vi.mock('@tauri-apps/plugin-http', () => ({
  fetch: tauriFetchMock,
}));

function jsonResponse(payload) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe('AI OpenRouter service', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', 'test-openrouter-key');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    tauriFetchMock.mockReset();
  });

  it('uses the dynamic free model router and build-time API key for completions', async () => {
    tauriFetchMock.mockImplementation(async (url) => {
      if (String(url).includes('openrouter.ai/api/v1/models')) {
        return jsonResponse({
          data: [
            {
              id: FREE_MODEL_PREFERENCES[0],
              pricing: { prompt: '0', completion: '0' },
              architecture: { output_modalities: ['text'] },
              supported_parameters: ['tools'],
            },
          ],
        });
      }
      return jsonResponse({});
    });
    const fetchMock = vi.fn(async () => jsonResponse({
      model: 'meta-llama/llama-free',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      choices: [{ message: { content: 'Réponse Dexter' } }],
    }));
    const listener = vi.fn();
    window.addEventListener('caltemp:ai-usage', listener);
    vi.spyOn(window, 'fetch').mockImplementation(fetchMock);

    const result = await generateText({
      apiKey: 'user-key-ignored',
      model: 'paid/model-ignored',
      messages: [{ role: 'user', content: 'Bonjour' }],
    });

    const [, request] = fetchMock.mock.calls[0];
    expect(result).toBe('Réponse Dexter');
    expect(request.headers.Authorization).toBe('Bearer test-openrouter-key');
    expect(JSON.parse(request.body).model).toBe(FREE_MODEL_PREFERENCES[0]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toMatchObject({
      model: FREE_MODEL_PREFERENCES[0],
      actualModel: 'meta-llama/llama-free',
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    window.removeEventListener('caltemp:ai-usage', listener);
  });

  it('only tries GPT OSS 120B free and Gemma free models', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      choices: [{ message: { content: 'Réponse Gemma' } }],
    }));
    vi.spyOn(window, 'fetch').mockImplementation(fetchMock);

    await generateText({ messages: [{ role: 'user', content: 'Bonjour' }] });

    expect(OPENROUTER_FREE_MODEL_ID).toBe('openai/gpt-oss-120b:free');
    expect(OPENROUTER_FREE_MODEL_IDS).toEqual([
      'openai/gpt-oss-120b:free',
      'google/gemma-3-27b-it:free',
      'google/gemma-3-12b-it:free',
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('openai/gpt-oss-120b:free');
  });

  it('falls back from GPT OSS 120B free to Gemma when the first model fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'provider down' } }),
      })
      .mockResolvedValueOnce(jsonResponse({
        choices: [{ message: { content: 'Réponse Gemma' } }],
      }));
    vi.spyOn(window, 'fetch').mockImplementation(fetchMock);

    const result = await generateText({ messages: [{ role: 'user', content: 'Bonjour' }] });

    expect(result).toBe('Réponse Gemma');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).model).toBe('openai/gpt-oss-120b:free');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).model).toBe('google/gemma-3-27b-it:free');
  });

  it('streams the first normal chunk to Dexter immediately', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"Salut"}}]}\n\n'));
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        controller.close();
      },
    });
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: true,
      body: stream,
    });
    const onChunk = vi.fn();

    const result = await generateText({
      messages: [{ role: 'user', content: 'Bonjour' }],
      onChunk,
    });

    expect(result).toBe('Salut');
    expect(onChunk).toHaveBeenCalledWith('Salut', 'Salut', true);
  });

  it('reports build configuration when no OpenRouter key is bundled', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '');

    expect(isAiConfigured()).toBe(false);
    await expect(generateText({ messages: [{ role: 'user', content: 'Bonjour' }] }))
      .rejects
      .toThrow("L'intégration IA n'est pas configurée dans ce build.");
  });
});
