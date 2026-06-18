import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ExtensionGalleryModal from './ExtensionGalleryModal';

vi.mock('@tauri-apps/plugin-shell', () => ({
  open: vi.fn(),
}));

describe('ExtensionGalleryModal', () => {
  it('shows detailed player stats and performance chart when a card is selected', () => {
    render(
      <ExtensionGalleryModal
        gallery={{
          title: 'Galerie test',
          items: [
            {
              name: 'Kylian Mbappé',
              description: 'Attaquant français.',
              imageUrl: 'https://example.com/mbappe.jpg',
              stats: { selections: 86, buts: 48 },
              performanceSeries: [
                { label: '2022', value: 18 },
                { label: '2023', value: 12 },
              ],
              honors: ['Champion du monde 2018'],
            },
          ],
        }}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /voir les performances/i }));

    expect(screen.getByText(/Performances de Kylian Mbappé/)).toBeInTheDocument();
    expect(screen.getByText('Sélections')).toBeInTheDocument();
    expect(screen.getByText(/Champion du monde 2018/)).toBeInTheDocument();
    expect(screen.getByLabelText(/graphique de performances/i)).toBeInTheDocument();
  });

  it('selects a player when the whole card is clicked', () => {
    render(
      <ExtensionGalleryModal
        gallery={{
          title: 'Galerie test',
          items: [
            {
              name: 'Joueur un',
              description: 'Premier profil.',
              imageUrl: 'https://example.com/one.jpg',
              stats: { buts: 1 },
            },
            {
              name: 'Joueur deux',
              description: 'Deuxième profil.',
              imageUrl: 'https://example.com/two.jpg',
              stats: { buts: 22 },
            },
          ],
        }}
        onClose={() => {}}
      />,
    );

    const buttons = screen.getAllByRole('button', { name: /voir les performances/i });
    fireEvent.click(buttons[1]);

    expect(screen.getByText(/Performances de Joueur deux/)).toBeInTheDocument();
    expect(screen.getByText('22')).toBeInTheDocument();
  });

  it('keeps gallery items visible when an image url is missing or not HTTPS', () => {
    render(
      <ExtensionGalleryModal
        gallery={{
          title: 'Galerie test',
          items: [
            {
              name: 'Joueur sans image',
              description: 'Profil encore affiché.',
              imageUrl: 'http://example.com/player.jpg',
              stats: { Buts: 10 },
            },
          ],
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Joueur sans image')).toBeInTheDocument();
    expect(screen.getByText('Profil encore affiché.')).toBeInTheDocument();
  });

  it('formats player statistics with readable labels and values', () => {
    render(
      <ExtensionGalleryModal
        gallery={{
          title: 'Galerie test',
          items: [
            {
              name: 'Gardien test',
              imageUrl: '',
              stats: {
                selections: 1234,
                cleanSheets: 87,
                note: 'Capitaine',
              },
            },
          ],
        }}
        onClose={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /voir les performances/i }));

    expect(screen.getByText('1 234')).toBeInTheDocument();
    expect(screen.getByText('Clean sheets')).toBeInTheDocument();
    expect(screen.getByText('Capitaine')).toBeInTheDocument();
  });

  it('enrichit la galerie Bleus quand un ancien plugin renvoie des joueurs sans stats', () => {
    render(
      <ExtensionGalleryModal
        gallery={{
          title: 'Galerie Bleus',
          description: 'Photos de footballeurs français connus.',
          items: [
            {
              name: 'Antoine Griezmann',
              description: 'Ancienne entrée sans détail.',
              imageUrl: 'https://example.com/griezmann.jpg',
            },
          ],
        }}
        onClose={() => {}}
      />,
    );

    expect(screen.getByText('Désiré Doué')).toBeInTheDocument();
    expect(screen.getByText('Rayan Cherki')).toBeInTheDocument();
    expect(screen.getByText('Ousmane Dembélé')).toBeInTheDocument();
    expect(screen.getByText('Paul Pogba')).toBeInTheDocument();
    expect(screen.getByText('Bradley Barcola')).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: /voir les performances/i })[0]);

    expect(screen.getByText(/Performances de Antoine Griezmann/)).toBeInTheDocument();
    expect(screen.getByText('135')).toBeInTheDocument();
    expect(screen.getByText(/Champion du monde 2018/)).toBeInTheDocument();
  });
});
