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

  it('lists configured categories locally', () => {
    const response = handleLocalDexterCommand('Montre les catégories', {
      settings: {
        categoryLegend: {
          sport: { label: 'Sport', color: '#22c55e' },
        },
      },
    });

    expect(response.handled).toBe(true);
    expect(response.message).toContain('Sport');
  });

  it('opens the safe ICS import flow instead of importing directly', () => {
    const response = handleLocalDexterCommand('importe un fichier ics');

    expect(response.handled).toBe(true);
    expect(response.type).toBe('open-settings');
    expect(response.tab).toBe('general');
  });

  it('opens AI settings from a local prompt', () => {
    const response = handleLocalDexterCommand('ouvre les paramètres IA');

    expect(response.handled).toBe(true);
    expect(response.type).toBe('open-settings');
    expect(response.tab).toBe('ai');
  });

  it('explains alert status for upcoming events', () => {
    const response = handleLocalDexterCommand('explique mes alertes', {
      events: [
        { title: 'Cours', date: '2026-06-18T09:00:00.000Z', reminder: true },
        { title: 'Sport', date: '2026-06-18T10:00:00.000Z', reminder: false },
      ],
    });

    expect(response.handled).toBe(true);
    expect(response.message).toContain('1 événement');
    expect(response.message).toContain('alertes actives');
    expect(response.message).not.toContain('reminder');
  });

  it('answers next matching reminder questions from local events', () => {
    const response = handleLocalDexterCommand("c'est quand le prochain match de la france", {
      now: new Date('2026-06-18T12:00:00.000Z'),
      events: [
        { title: 'Courses', date: '2026-06-19T09:00:00.000Z', reminder: false, category: 'perso' },
        { title: 'France - Allemagne', date: '2026-06-21T19:00:00.000Z', reminder: true, category: 'sport' },
      ],
      settings: {
        categoryLegend: {
          sport: { label: 'Sport', color: '#22c55e' },
        },
      },
    });

    expect(response.handled).toBe(true);
    expect(response.type).toBe('next-event');
    expect(response.message).toContain('France - Allemagne');
    expect(response.message).toContain('alerte activée');
  });

  it('uses the next occurrence for recurring reminders', () => {
    const response = handleLocalDexterCommand('quand est mon prochain cours', {
      now: new Date('2026-06-18T12:00:00.000Z'),
      events: [
        { title: 'Cours collectif', date: '2026-06-11T18:00:00.000Z', recurrence: 'weekly', reminder: true, category: 'cours' },
      ],
    });

    expect(response.handled).toBe(true);
    expect(response.message).toContain('Cours collectif');
    expect(response.message).toContain('jeudi 18 juin 2026');
  });

  it('lists upcoming reminders locally', () => {
    const response = handleLocalDexterCommand('liste mes rappels', {
      now: new Date('2026-06-18T12:00:00.000Z'),
      events: [
        { title: 'Dentiste', date: '2026-06-19T08:00:00.000Z', reminder: true, category: 'perso' },
        { title: 'Réunion', date: '2026-06-20T09:00:00.000Z', reminder: false, category: 'dev' },
      ],
    });

    expect(response.handled).toBe(true);
    expect(response.type).toBe('reminder-list');
    expect(response.message).toContain('Dentiste');
    expect(response.message).toContain('Réunion');
  });

  it('uses display category labels in local statistics instead of internal keys', () => {
    const response = handleLocalDexterCommand('montre les stats', {
      events: [
        { title: 'Sprint', date: '2026-06-18T09:00:00.000Z', category: 'dev' },
      ],
      settings: {
        categoryLegend: {
          dev: { label: 'Technique', color: '#a78bfa' },
        },
      },
    });

    expect(response.handled).toBe(true);
    expect(response.message).toContain('Technique : 1');
    expect(response.message).not.toContain('dev : 1');
  });

  it('updates the alert status of a matching reminder locally', () => {
    const response = handleLocalDexterCommand("désactive l'alerte du match france", {
      now: new Date('2026-06-18T12:00:00.000Z'),
      events: [
        { id: 'france-1', title: 'France - Allemagne', date: '2026-06-21T19:00:00.000Z', reminder: true, category: 'sport' },
      ],
    });

    expect(response.handled).toBe(true);
    expect(response.type).toBe('update-event');
    expect(response.event).toMatchObject({
      id: 'france-1',
      reminder: false,
    });
    expect(response.message).toContain('sans alerte');
  });

  it('updates the time of a matching reminder locally', () => {
    const response = handleLocalDexterCommand('déplace france à 21h30', {
      now: new Date('2026-06-18T12:00:00.000Z'),
      events: [
        { id: 'france-1', title: 'France - Allemagne', date: '2026-06-21T19:00:00.000Z', reminder: true, category: 'sport' },
      ],
    });

    expect(response.handled).toBe(true);
    expect(response.type).toBe('update-event');
    expect(new Date(response.event.date).getHours()).toBe(21);
    expect(new Date(response.event.date).getMinutes()).toBe(30);
  });

  it('updates the previously referenced reminder when the next command is short', () => {
    const response = handleLocalDexterCommand("active l'alerte", {
      now: new Date('2026-06-18T12:00:00.000Z'),
      referencedEventId: 'france-irak',
      events: [
        { id: 'france-irak', title: 'France — Irak', date: '2026-06-22T19:00:00.000Z', reminder: false, category: 'perso' },
      ],
    });

    expect(response.handled).toBe(true);
    expect(response.type).toBe('update-event');
    expect(response.event).toMatchObject({
      id: 'france-irak',
      reminder: true,
    });
  });

  it('understands "met une alerte pour ce match" with the referenced reminder', () => {
    const response = handleLocalDexterCommand('met une alerte pour ce match', {
      now: new Date('2026-06-18T12:00:00.000Z'),
      referencedEventId: 'france-irak',
      events: [
        { id: 'france-irak', title: 'France — Irak', date: '2026-06-22T19:00:00.000Z', reminder: false, category: 'perso' },
      ],
    });

    expect(response.handled).toBe(true);
    expect(response.type).toBe('update-event');
    expect(response.event.reminder).toBe(true);
  });
});
