import { describe, expect, it } from 'vitest';
import {
  buildExamRevisionPlan,
  buildWeeklySummary,
  suggestFromHabits,
} from './planning';

describe('planning domain', () => {
  it('creates J-30, J-7 and J-1 revision milestones for exams', () => {
    const plan = buildExamRevisionPlan([
      {
        id: 'exam-1',
        title: 'Examen maths',
        date: '2026-07-16T09:00:00.000Z',
        category: 'examen',
      },
    ]);

    expect(plan.map(item => item.offsetLabel)).toEqual(['J-30', 'J-7', 'J-1']);
  });

  it('summarizes the current week by category', () => {
    const summary = buildWeeklySummary([
      { title: 'Cours maths', date: '2026-06-16T08:00:00.000Z', category: 'cours' },
      { title: 'Devoir français', date: '2026-06-18T08:00:00.000Z', category: 'devoir' },
    ], new Date('2026-06-16T12:00:00.000Z'));

    expect(summary.total).toBe(2);
    expect(summary.byCategory.cours).toBe(1);
    expect(summary.text).toContain('2 événements');
  });

  it('suggests habits from repeated local events', () => {
    const suggestions = suggestFromHabits([
      { title: 'Sport', date: '2026-06-02T18:00:00.000Z', category: 'perso' },
      { title: 'Sport', date: '2026-06-09T18:00:00.000Z', category: 'perso' },
      { title: 'Sport', date: '2026-06-16T18:00:00.000Z', category: 'perso' },
    ]);

    expect(suggestions[0].title).toContain('Sport');
    expect(suggestions[0].reason).toContain('habitude');
  });
});
