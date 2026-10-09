import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import EventModal from './EventModal';

describe('EventModal', () => {
  it('shows a simple creation flow before advanced options', () => {
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onSave={() => {}}
        initialDate={new Date('2026-06-16T09:00:00.000Z')}
        settings={{}}
      />,
    );

    expect(screen.getByText('Nouvel événement')).toBeInTheDocument();
    expect(screen.getByText('L’essentiel')).toBeInTheDocument();
    expect(screen.getByText('Quand ?')).toBeInTheDocument();
    expect(screen.queryByText('Options avancées')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /afficher les options avancées/i }));

    expect(screen.getByText('Options avancées')).toBeInTheDocument();
  });
});

describe('EventModal smart scheduling', () => {
  const tomorrow = () => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    date.setHours(0, 0, 0, 0);
    return date;
  };
  const at = (base, hours, minutes = 0) => {
    const date = new Date(base);
    date.setHours(hours, minutes, 0, 0);
    return date.toISOString();
  };

  it('suggests free slots and applies one on click', () => {
    const day = tomorrow();
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onSave={() => {}}
        initialDate={day}
        settings={{}}
        events={[{ id: 'busy', title: 'Réunion', date: at(day, 9), durationMinutes: 180 }]}
      />,
    );

    expect(screen.getByText('Créneaux suggérés')).toBeInTheDocument();
    const chips = screen.getAllByRole('button', { name: /\d{2}:\d{2} – \d{2}:\d{2}/ });
    expect(chips.length).toBeGreaterThan(0);
    for (const chip of chips) {
      const [hours] = chip.textContent.split(':').map(Number);
      expect(hours >= 9 && hours < 12).toBe(false);
    }
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('warns when the chosen time overlaps another event', () => {
    const day = tomorrow();
    const start = new Date(day);
    start.setHours(10, 0, 0, 0);
    render(
      <EventModal
        isOpen
        onClose={() => {}}
        onSave={() => {}}
        initialDate={start}
        settings={{}}
        events={[{ id: 'busy', title: 'Réunion', date: at(day, 9, 30), durationMinutes: 60 }]}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Chevauche un événement : Réunion');
  });
});
