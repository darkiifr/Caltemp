import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import CalendarImportWizard from './CalendarImportWizard';

vi.mock('../services/calendarImportFiles', () => ({
  parseImportSources: vi.fn(),
  pickImportFiles: vi.fn(),
  readImportPaths: vi.fn(),
}));

const categoryOptions = [
  { value: 'perso', label: 'Perso', color: '#60a5fa' },
  { value: 'travail', label: 'Travail', color: '#f97316' },
];

const calendars = [
  {
    id: 'cal-1',
    fileName: 'takeout.zip › travail.ics',
    format: 'ics',
    provider: 'google',
    name: 'Travail',
    warnings: [],
    error: '',
    events: [
      { externalId: 'u1', title: 'Réunion', date: '2030-06-16T08:00:00.000Z', alarms: [{ trigger: '-PT10M' }] },
      { externalId: 'u2', title: 'Déjà là', date: '2030-06-17T08:00:00.000Z' },
    ],
  },
];

function renderWizard(props = {}) {
  const onImport = vi.fn().mockResolvedValue({ added: 1, updated: 0, skipped: 0 });
  const parseSources = vi.fn().mockResolvedValue(calendars);
  const pickFiles = vi.fn().mockResolvedValue([{ name: 'takeout.zip', bytes: new Uint8Array() }]);
  render(
    <CalendarImportWizard
      isOpen
      onClose={vi.fn()}
      existingEvents={[{ id: 'e', externalId: 'u2', title: 'Déjà là', date: '2030-06-17T08:00:00.000Z' }]}
      categoryOptions={categoryOptions}
      onImport={onImport}
      onOpenSubscriptions={vi.fn()}
      pickFiles={pickFiles}
      parseSources={parseSources}
      {...props}
    />,
  );
  return { onImport, parseSources, pickFiles };
}

describe('CalendarImportWizard', () => {
  it('shows export steps for the chosen provider', () => {
    renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Outlook/ }));
    expect(screen.getByText('Exporter depuis Outlook / Microsoft 365')).toBeInTheDocument();
  });

  it('previews detected calendars, skips duplicates and imports with per-calendar choices', async () => {
    const { onImport } = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Choisir des fichiers/ }));

    await screen.findByText('Agendas détectés');
    expect(screen.getByLabelText('Importer Travail')).toBeChecked();
    expect(screen.getByLabelText('Importer Déjà là')).not.toBeChecked();
    expect(screen.getByLabelText('Importer Réunion')).toBeChecked();

    fireEvent.click(screen.getByRole('button', { name: /Importer 1 événement$/ }));

    await screen.findByText('Import terminé');
    const [events, options] = onImport.mock.calls[0];
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ title: 'Réunion', importSourceLabel: 'Travail' });
    // Calendar named "Travail" maps to the matching category; the source alarm is kept.
    expect(Object.values(options.overridesById)).toEqual([{ category: 'travail', reminder: true }]);
    expect(options.allowDuplicates).toBe(false);
  });

  it('lets the user include duplicates when the option is turned off', async () => {
    const { onImport } = renderWizard();
    fireEvent.click(screen.getByRole('button', { name: /Choisir des fichiers/ }));
    await screen.findByText('Agendas détectés');

    fireEvent.click(screen.getByLabelText(/Ignorer les doublons/));
    fireEvent.click(screen.getByRole('button', { name: /Importer 2 événements/ }));

    await waitFor(() => expect(onImport).toHaveBeenCalled());
    expect(onImport.mock.calls[0][1].allowDuplicates).toBe(true);
  });

  it('surfaces unreadable files without leaving the source step', async () => {
    renderWizard({
      parseSources: vi.fn().mockResolvedValue([{ id: 'x', fileName: 'notes.bin', format: 'unknown', provider: 'other', name: 'notes', events: [], warnings: [], error: 'Format non reconnu' }]),
    });
    fireEvent.click(screen.getByRole('button', { name: /Choisir des fichiers/ }));
    expect(await screen.findByText('notes.bin : Format non reconnu')).toBeInTheDocument();
    expect(screen.queryByText('Agendas détectés')).not.toBeInTheDocument();
  });
});
