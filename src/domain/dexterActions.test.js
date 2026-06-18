import { describe, expect, it } from 'vitest';
import { parseDexterAction } from './dexterActions';

describe('Dexter action parsing', () => {
  it('extracts a valid create_event action from fenced JSON', () => {
    const result = parseDexterAction('```json\n{"action":"create_event","data":{"title":"Cours","date":"2026-06-16T08:00:00.000Z","category":"cours","reminder":true}}\n```');

    expect(result.ok).toBe(true);
    expect(result.action).toBe('create_event');
    expect(result.data).toMatchObject({
      title: 'Cours',
      category: 'cours',
      reminder: true,
    });
  });

  it('returns a non-throwing error for malformed JSON', () => {
    const result = parseDexterAction('```json\n{"action":"create_event","data":\n```');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/JSON/i);
  });

  it('extracts a valid update_event action from fenced JSON', () => {
    const result = parseDexterAction('```json\n{"action":"update_event","data":{"id":"event-1","date":"2026-06-16T10:00:00.000Z","reminder":false}}\n```');

    expect(result.ok).toBe(true);
    expect(result.action).toBe('update_event');
    expect(result.data).toMatchObject({
      id: 'event-1',
      reminder: false,
    });
  });

  it('rejects update_event without an event id', () => {
    const result = parseDexterAction('{"action":"update_event","data":{"reminder":false}}');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Identifiant/i);
  });

  it('rejects unsupported actions without throwing', () => {
    const result = parseDexterAction('{"action":"delete_everything"}');

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non prise en charge/i);
  });
});
