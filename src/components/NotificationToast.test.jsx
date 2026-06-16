import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import NotificationToast from './NotificationToast';

describe('NotificationToast', () => {
  it('renders snooze actions for reminders', () => {
    render(
      <NotificationToast
        notification={{ id: 'n1', title: 'Rappel', body: 'Maintenant : Maths', type: 'reminder' }}
        onClose={vi.fn()}
        onSnooze={vi.fn()}
      />
    );

    expect(screen.getByRole('button', { name: 'Reporter de 5 minutes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reporter à la fin de journée' })).toBeInTheDocument();
  });

  it('uses keyboard shortcuts to snooze and dismiss', () => {
    const onSnooze = vi.fn();
    const onClose = vi.fn();
    render(
      <NotificationToast
        notification={{ id: 'n1', title: 'Rappel', body: 'Maintenant : Maths', type: 'reminder' }}
        onClose={onClose}
        onSnooze={onSnooze}
      />
    );

    fireEvent.keyDown(window, { key: 's' });
    expect(onSnooze).toHaveBeenCalledWith(5);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
