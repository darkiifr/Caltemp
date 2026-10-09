import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CalendarView from './CalendarView';

vi.mock('../utils/sound', () => ({ playBubbleSound: vi.fn() }));

const todayAt = (hours, minutes = 0) => {
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return date.toISOString();
};

describe('CalendarView', () => {
  const events = [
    { id: 'a', title: 'Cours long', date: todayAt(9), durationMinutes: 120 },
    { id: 'b', title: 'Appel', date: todayAt(10), durationMinutes: 30 },
  ];

  it('shows events in the month grid', () => {
    render(<CalendarView events={events} onAddEvent={() => {}} onEditEvent={() => {}} onDeleteEvent={() => {}} showHolidays={false} showNamedays={false} />);
    expect(screen.getAllByText('Cours long').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Mois' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lays overlapping events side by side with their real duration in day view', () => {
    render(<CalendarView events={events} onAddEvent={() => {}} onEditEvent={() => {}} onDeleteEvent={() => {}} showHolidays={false} showNamedays={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Jour' }));

    const longEvent = screen.getByText('Cours long').closest('[title]');
    const shortEvent = screen.getByText('Appel').closest('[title]');
    expect(longEvent.style.height).toBe('158px');
    expect(longEvent.style.width).toBe('calc(50% - 0px)');
    expect(shortEvent.style.left).toBe('calc(50% + 2px)');
  });
});
