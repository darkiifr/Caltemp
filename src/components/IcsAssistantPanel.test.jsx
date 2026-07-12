import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import IcsAssistantPanel, { deriveIcsAssistantState } from './IcsAssistantPanel';

describe('IcsAssistantPanel', () => {
  it('derives a ready state with a readable label from a HTTPS calendar URL', () => {
    const state = deriveIcsAssistantState({
      label: '',
      url: 'https://coupedumonde2026.net/api/calendrier-ical?filter=all',
    });

    expect(state).toMatchObject({
      canAdd: true,
      suggestedLabel: 'coupedumonde2026.net',
      normalizedUrl: 'https://coupedumonde2026.net/api/calendrier-ical?filter=all',
    });
  });

  it('rejects non-HTTPS URLs before creating a source', () => {
    const state = deriveIcsAssistantState({
      label: 'Test',
      url: 'http://example.com/calendar.ics',
    });

    expect(state.canAdd).toBe(false);
    expect(state.error).toContain('HTTPS');
  });

  it('adds an enabled source and asks for immediate sync', async () => {
    const onAddAndSyncSource = vi.fn(async () => ({
      source: { lastSyncMessage: '1 ajouté(s), 0 mis à jour, 0 retiré(s)' },
      stats: { added: 1, updated: 0, removed: 0 },
    }));

    render(
      <IcsAssistantPanel
        categoryOptions={[
          { value: 'sport', label: 'Sport', color: '#14b8a6' },
          { value: 'perso', label: 'Perso', color: '#22c55e' },
        ]}
        onAddAndSyncSource={onAddAndSyncSource}
      />,
    );

    expect(screen.queryByLabelText(/url du calendrier/i)).not.toBeInTheDocument();

    expect(screen.queryByText(/vue assistée/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /ajouter une url de calendrier/i }));

    const dialog = screen.getByRole('dialog', { name: /ajouter une url de calendrier/i });
    expect(dialog).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/url du calendrier/i), {
      target: { value: 'https://coupedumonde2026.net/api/calendrier-ical?filter=all' },
    });
    fireEvent.change(screen.getByLabelText(/nom affiché/i), {
      target: { value: 'Coupe du Monde 2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ajouter et actualiser/i }));

    await waitFor(() => {
      expect(onAddAndSyncSource).toHaveBeenCalledWith(expect.objectContaining({
        label: 'Coupe du Monde 2026',
        url: 'https://coupedumonde2026.net/api/calendrier-ical?filter=all',
        enabled: true,
        type: 'url',
        refreshMinutes: 15,
      }));
    });
    expect(await screen.findByText(/source ajoutée/i)).toBeInTheDocument();
  });

  it('shows a duplicate URL result without creating another source', async () => {
    const onAddAndSyncSource = vi.fn(async () => ({
      duplicate: true,
      source: { label: 'Coupe du Monde 2026' },
      stats: { added: 0, updated: 0, removed: 0 },
    }));

    render(
      <IcsAssistantPanel
        categoryOptions={[{ value: 'sport', label: 'Sport', color: '#14b8a6' }]}
        onAddAndSyncSource={onAddAndSyncSource}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ajouter une url de calendrier/i }));
    fireEvent.change(screen.getByLabelText(/url du calendrier/i), {
      target: { value: 'https://coupedumonde2026.net/api/calendrier-ical?filter=all' },
    });
    fireEvent.click(screen.getByRole('button', { name: /ajouter et actualiser/i }));

    expect(await screen.findByText(/existe déjà/i)).toBeInTheDocument();
  });

  it('closes the popup without creating a source', async () => {
    const onAddSource = vi.fn();

    render(
      <IcsAssistantPanel
        categoryOptions={[{ value: 'sport', label: 'Sport', color: '#14b8a6' }]}
        onAddSource={onAddSource}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /ajouter une url de calendrier/i }));
    fireEvent.click(screen.getByRole('button', { name: /fermer/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /ajouter une url de calendrier/i })).not.toBeInTheDocument();
    });
    expect(onAddSource).not.toHaveBeenCalled();
  });
});
