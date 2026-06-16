import { describe, expect, it } from 'vitest';
import { handleLocalDexterCommand, parseFrenchEventCommand } from './dexterLocal';

describe('Dexter local commands', () => {
  it('parses a simple French event creation command', () => {
    const result = parseFrenchEventCommand('Ajoute cours de maths demain à 9h');

    expect(result?.title).toBe('Cours de maths');
    expect(result?.category).toBe('cours');
    expect(new Date(result.date).getHours()).toBe(9);
  });

  it('handles weekly summary locally', () => {
    const response = handleLocalDexterCommand('Résume ma semaine', {
      events: [{ title: 'Cours maths', date: '2026-06-16T08:00:00.000Z', category: 'cours' }],
      now: new Date('2026-06-16T12:00:00.000Z'),
    });

    expect(response.handled).toBe(true);
    expect(response.message).toContain('semaine');
  });
});
