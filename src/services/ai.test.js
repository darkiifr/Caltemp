import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invokeMock, tauriFetchMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  tauriFetchMock: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({ invoke: invokeMock }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn(async () => () => {}) }));
vi.mock('@tauri-apps/plugin-http', () => ({ fetch: tauriFetchMock }));

import { chatCompletion, generateText, isAiConfigured, mergeToolCallDeltas, readChatStream } from './ai';
import { refreshLocalAiStatus } from './localAi';

function sseBody(events) {
  const text = events.map(event => `data: ${typeof event === 'string' ? event : JSON.stringify(event)}\n\n`).join('');
  const bytes = new TextEncoder().encode(text);
  let sent = false;
  return {
    getReader: () => ({
      read: async () => {
        if (sent) return { done: true };
        sent = true;
        return { done: false, value: bytes };
      },
    }),
  };
}

const SERVER = { baseUrl: 'http://127.0.0.1:5555', apiKey: 'secret', modelId: 'qwen2.5-1.5b-instruct' };

describe('local AI service', () => {
  beforeEach(() => {
    window.__TAURI_INTERNALS__ = {};
    invokeMock.mockImplementation(async (command) => {
      if (command === 'local_ai_ensure_server') return SERVER;
      if (command === 'local_ai_status') {
        return {
          supported: true,
          runtimeInstalled: true,
          gpuRuntimeInstalled: false,
          gpuVariantAvailable: true,
          models: [{ id: 'qwen2.5-1.5b-instruct', installed: true }, { id: 'qwen2.5-0.5b-instruct', installed: false }],
        };
      }
      return undefined;
    });
  });

  afterEach(() => {
    delete window.__TAURI_INTERNALS__;
    vi.restoreAllMocks();
    invokeMock.mockReset();
    tauriFetchMock.mockReset();
  });

  it('reports the model as configured only when it and the runtime are installed', async () => {
    await refreshLocalAiStatus();
    expect(isAiConfigured({ modelId: 'qwen2.5-1.5b-instruct' })).toBe(true);
    expect(isAiConfigured({ modelId: 'qwen2.5-0.5b-instruct' })).toBe(false);
    // The Vulkan runtime is a separate download.
    expect(isAiConfigured({ modelId: 'qwen2.5-1.5b-instruct', gpu: true })).toBe(false);
  });

  it('streams a completion from the local llama-server with its API key', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      body: sseBody([
        { model: 'x', choices: [{ delta: { content: 'Bon' } }] },
        { choices: [{ delta: { content: 'jour' } }] },
        { choices: [], usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } },
        '[DONE]',
      ]),
    }));
    vi.spyOn(window, 'fetch').mockImplementation(fetchMock);
    const usage = vi.fn();
    window.addEventListener('caltemp:ai-usage', usage);
    const chunks = [];

    const result = await chatCompletion({
      messages: [{ role: 'user', content: 'Salut' }],
      settings: { modelId: 'qwen2.5-1.5b-instruct', threads: 2 },
      onDelta: (text) => chunks.push(text),
    });

    expect(result.content).toBe('Bonjour');
    expect(chunks).toEqual(['Bon', 'Bonjour']);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:5555/v1/chat/completions');
    expect(init.headers.Authorization).toBe('Bearer secret');
    expect(JSON.parse(init.body)).toMatchObject({ stream: true, model: 'qwen2.5-1.5b-instruct' });
    expect(invokeMock).toHaveBeenCalledWith('local_ai_ensure_server', expect.objectContaining({
      modelId: 'qwen2.5-1.5b-instruct',
      options: expect.objectContaining({ threads: 2, idleTimeoutSecs: 300 }),
    }));
    expect(usage).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ usage: expect.objectContaining({ total_tokens: 12 }) }),
    }));
    window.removeEventListener('caltemp:ai-usage', usage);
  });

  it('falls back to the HTTP plugin when the WebView refuses the loopback request', async () => {
    vi.spyOn(window, 'fetch').mockRejectedValue(new TypeError('Load failed'));
    tauriFetchMock.mockResolvedValue({ ok: true, body: sseBody([{ choices: [{ delta: { content: 'ok' } }] }, '[DONE]']) });

    await expect(generateText({ messages: [{ role: 'user', content: 'test' }] })).resolves.toBe('ok');
    expect(tauriFetchMock).toHaveBeenCalledTimes(1);
  });

  it('turns a context overflow into an actionable message', async () => {
    vi.spyOn(window, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: 'the request exceeds the available context size' } }),
    });
    await expect(chatCompletion({ messages: [] })).rejects.toThrow(/nouvelle discussion/);
  });
});

describe('stream parsing', () => {
  it('rebuilds tool calls streamed in pieces', async () => {
    const result = await readChatStream(sseBody([
      { choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'create_', arguments: '{"title":' } }] } }] },
      { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'event', arguments: '"Sport"}' } }] } }] },
      '[DONE]',
    ]));
    expect(result.toolCalls).toEqual([
      { id: 'call_1', type: 'function', function: { name: 'create_event', arguments: '{"title":"Sport"}' } },
    ]);
  });

  it('merges deltas without an index in order', () => {
    const calls = mergeToolCallDeltas([], [{ function: { name: 'a' } }, { function: { name: 'b' } }]);
    expect(calls.map(call => call.function.name)).toEqual(['a', 'b']);
  });

  it('surfaces errors sent in the stream', async () => {
    await expect(readChatStream(sseBody([{ error: { message: 'boom' } }]))).rejects.toThrow('boom');
  });
});
