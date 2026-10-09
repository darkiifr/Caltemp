import { describe, expect, it } from 'vitest';
import { buildMapItems } from './mapItems';

const now = new Date('2026-07-07T12:00:00.000Z');
const events = [
  { id: 'pin', title: 'Épinglé', date: '2026-07-08T08:00:00.000Z', geo: { lat: 48.85, lng: 2.35 }, reminder: true },
  { id: 'text', title: 'Coordonnées', date: '2026-07-09T08:00:00.000Z', location: '45.76, 4.83' },
  { id: 'cached', title: 'Adresse connue', date: '2026-07-10T08:00:00.000Z', location: 'Zénith de Lille' },
  { id: 'unknown', title: 'À localiser', date: '2026-07-11T08:00:00.000Z', location: 'Stade de France' },
  { id: 'miss', title: 'Introuvable', date: '2026-07-11T08:00:00.000Z', location: 'Chez Mamie' },
  { id: 'visio', title: 'Visio', date: '2026-07-11T08:00:00.000Z', location: 'Microsoft Teams' },
  { id: 'far', title: 'Plus tard', date: '2026-12-01T08:00:00.000Z', geo: { lat: 43.3, lng: 5.4 } },
  { id: 'none', title: 'Sans lieu', date: '2026-07-08T08:00:00.000Z' },
];
const lookup = (text) => ({ 'zénith de lille': { lat: 50.63, lng: 3.06 }, 'chez mamie': null }[text.toLowerCase()]);

describe('map items', () => {
  it('positions events from pins, typed coordinates and the geocode cache', () => {
    const { items, unresolved, notFound } = buildMapItems(events, { now, period: '30', lookup });
    expect(items.map(item => item.key)).toEqual(['pin', 'text', 'cached']);
    expect(unresolved).toEqual(['Stade de France']);
    expect(notFound).toBe(1);
  });

  it('filters by period and alerts', () => {
    expect(buildMapItems(events, { now, period: 'all', lookup }).items.map(item => item.key)).toContain('far');
    expect(buildMapItems(events, { now, period: '30', alertsOnly: true, lookup }).items.map(item => item.key)).toEqual(['pin']);
  });
});
