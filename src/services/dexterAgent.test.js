import { describe, expect, it, vi } from 'vitest';
import {
  buildDexterSystemPrompt,
  extractInlineToolCalls,
  parseToolArguments,
  runDexterAgent,
  visibleAssistantText,
} from './dexterAgent';

describe('runDexterAgent', () => {
  it('runs tool calls and feeds the results back until the final answer', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({
        content: '',
        toolCalls: [{ id: 't1', function: { name: 'list_events', arguments: '{"from":"2026-10-11"}' } }],
      })
      .mockResolvedValueOnce({ content: 'Demain vous avez Sport à 18 h.', toolCalls: [] });
    const executeTool = vi.fn(async () => ({ ok: true, result: { events: [{ title: 'Sport' }] } }));

    const result = await runDexterAgent({
      messages: [{ role: 'user', content: 'Qu’ai-je demain ?' }],
      complete,
      executeTool,
    });

    expect(executeTool).toHaveBeenCalledWith('list_events', { from: '2026-10-11' });
    expect(result.text).toBe('Demain vous avez Sport à 18 h.');
    const secondCall = complete.mock.calls[1][0].messages;
    expect(secondCall.at(-2)).toMatchObject({ role: 'assistant', tool_calls: [{ id: 't1' }] });
    expect(secondCall.at(-1)).toMatchObject({ role: 'tool', tool_call_id: 't1', content: '{"events":[{"title":"Sport"}]}' });
  });

  it('understands tool calls written as text by small models', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({ content: '<tool_call>\n{"name": "show_calendar", "arguments": {"view": "week"}}\n</tool_call>' });
    const executeTool = vi.fn(async () => ({ ok: true, result: {}, closesDexter: true }));

    const result = await runDexterAgent({ messages: [], complete, executeTool });

    expect(executeTool).toHaveBeenCalledWith('show_calendar', { view: 'week' });
    expect(result.closesDexter).toBe(true);
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('collects confirmations and displays, and survives failing tools', async () => {
    const complete = vi.fn()
      .mockResolvedValueOnce({
        toolCalls: [
          { function: { name: 'delete_event', arguments: { id: 'a' } } },
          { function: { name: 'create_event', arguments: '{}' } },
        ],
      })
      .mockResolvedValueOnce({ content: 'Confirmez la suppression.' });
    const executeTool = vi.fn(async (name) => {
      if (name === 'create_event') throw new Error('disque plein');
      return { ok: true, result: {}, confirmation: { kind: 'delete_event', eventId: 'a' }, display: 'x' };
    });

    const result = await runDexterAgent({ messages: [], complete, executeTool });

    expect(result.confirmations).toEqual([{ kind: 'delete_event', eventId: 'a' }]);
    expect(result.actions).toEqual([
      { name: 'delete_event', ok: true, display: 'x' },
      { name: 'create_event', ok: false, display: '' },
    ]);
    expect(complete.mock.calls[1][0].messages.at(-1).content).toContain('disque plein');
  });

  it('stops after the step limit', async () => {
    const complete = vi.fn(async () => ({ toolCalls: [{ function: { name: 'list_events', arguments: '{}' } }] }));
    const result = await runDexterAgent({
      messages: [],
      complete,
      executeTool: async () => ({ ok: true, result: {} }),
      maxSteps: 2,
    });
    expect(complete).toHaveBeenCalledTimes(2);
    expect(result.text).toMatch(/pas pu conclure/);
  });

  it('honours aborts', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runDexterAgent({ messages: [], complete: vi.fn(), executeTool: vi.fn(), signal: controller.signal }))
      .rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('agent helpers', () => {
  it('parses tolerant tool arguments', () => {
    expect(parseToolArguments('{"a":1}')).toEqual({ a: 1 });
    expect(parseToolArguments('"{\\"a\\":1}"')).toEqual({ a: 1 });
    expect(parseToolArguments('voici {"a":2} ok')).toEqual({ a: 2 });
    expect(parseToolArguments('n/a')).toEqual({});
  });

  it('maps legacy JSON actions onto tools and ignores unknown names', () => {
    expect(extractInlineToolCalls('```json\n{"action":"create_event","data":{"title":"A","date":"2026-10-12T10:00"}}\n```'))
      .toEqual([{ name: 'create_event', arguments: { title: 'A', date: '2026-10-12T10:00' } }]);
    expect(extractInlineToolCalls('<tool_call>{"name":"rm_rf","arguments":{}}</tool_call>')).toEqual([]);
    expect(extractInlineToolCalls('{"name":"week_summary","arguments":{}}')).toEqual([{ name: 'week_summary', arguments: {} }]);
  });

  it('hides tool markup from the streamed text', () => {
    expect(visibleAssistantText('Je regarde.<tool_call>{"name":')).toBe('Je regarde.');
  });

  it('builds a prompt with today, categories and upcoming events', () => {
    const prompt = buildDexterSystemPrompt({
      now: new Date(2026, 9, 10, 9, 5),
      settings: { categoryLegend: { sport: { label: 'Sport' } } },
      upcoming: [{ id: 'e1', title: 'Match', date: '2026-10-11T15:00' }],
    });
    expect(prompt).toContain('2026-10-10T09:05');
    expect(prompt).toContain('sport (Sport)');
    expect(prompt).toContain('Match [id=e1]');
  });
});
