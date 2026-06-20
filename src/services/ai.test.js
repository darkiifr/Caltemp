import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateText, isAiConfigured, FREE_MODEL_PREFERENCES } from './ai';

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

  it('reports build configuration when no OpenRouter key is bundled', async () => {
    vi.stubEnv('VITE_OPENROUTER_API_KEY', '');

    expect(isAiConfigured()).toBe(false);
    await expect(generateText({ messages: [{ role: 'user', content: 'Bonjour' }] }))
      .rejects
      .toThrow("L'intégration IA n'est pas configurée dans ce build.");
  });
});
