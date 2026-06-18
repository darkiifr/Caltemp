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
