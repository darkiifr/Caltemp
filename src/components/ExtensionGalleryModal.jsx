import React, { useMemo, useState } from 'react';
import { ArrowLeft, BarChart3, ExternalLink, ImageOff, X } from 'lucide-react';
import { open as openLink } from '@tauri-apps/plugin-shell';

const BLEUS_PLAYER_DETAILS = [
  {
    name: 'Kylian Mbappé',
    description: 'Attaquant français, champion du monde 2018.',
    position: 'Attaquant',
    era: '2017-',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kylian_Mbapp%C3%A9_2018.jpg',
    details: 'Vitesse, finition et capacité à décider les grands matchs. Profil central de l’attaque française moderne.',
    stats: { Sélections: 86, Buts: 48, Passes: 35, Trophées: 16 },
    performanceSeries: [{ label: '2018', value: 12 }, { label: '2021', value: 18 }, { label: '2022', value: 21 }, { label: '2023', value: 25 }],
    honors: ['Champion du monde 2018', 'Finaliste Coupe du monde 2022', 'Meilleur buteur Coupe du monde 2022'],
  },
  {
    name: 'Antoine Griezmann',
    description: 'International français, champion du monde 2018.',
    position: 'Attaquant / milieu',
    era: '2014-',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Antoine_Griezmann_2018.jpg',
    details: 'Joueur de liaison majeur, précieux entre les lignes par son volume, sa créativité et son sens collectif.',
    stats: { Sélections: 135, Buts: 44, Passes: 38, Trophées: 7 },
    performanceSeries: [{ label: '2016', value: 18 }, { label: '2018', value: 17 }, { label: '2021', value: 13 }, { label: '2022', value: 16 }],
    honors: ['Champion du monde 2018', 'Meilleur joueur Euro 2016', 'Ligue des Nations 2021'],
  },
  {
    name: 'Désiré Doué',
    description: 'Milieu offensif français, grand espoir de la nouvelle génération.',
    position: 'Milieu offensif / ailier',
    era: '2024-',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/D%C3%A9sir%C3%A9_Dou%C3%A9_2023.jpg',
    details: 'Profil créatif, très fort dans les prises de balle orientées, les petits espaces et la percussion depuis l’axe ou le côté.',
    stats: { Sélections: 6, Buts: 1, Passes: 2, Note: 'Espoir' },
    performanceSeries: [{ label: '2022', value: 5 }, { label: '2023', value: 9 }, { label: '2024', value: 14 }, { label: '2025', value: 18 }],
    honors: ['International français', 'Formé au Stade Rennais', 'Révélation offensive de sa génération'],
  },
  {
    name: 'Rayan Cherki',
    description: 'Milieu offensif français, créateur technique et imprévisible.',
    position: 'Milieu offensif',
    era: '2025-',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Rayan_Cherki_2020.jpg',
    details: 'Joueur de déséquilibre, excellent dans la dernière passe, les dribbles courts et la création face aux blocs bas.',
    stats: { Sélections: 4, Buts: 1, Passes: 3, Note: 'Créateur' },
    performanceSeries: [{ label: '2021', value: 7 }, { label: '2022', value: 10 }, { label: '2024', value: 16 }, { label: '2025', value: 21 }],
    honors: ['International français', 'Formé à l’Olympique Lyonnais', 'Finaliste olympique 2024'],
  },
  {
    name: 'Ousmane Dembélé',
    description: 'Ailier français, champion du monde 2018.',
    position: 'Ailier',
    era: '2016-',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Ousmane_Demb%C3%A9l%C3%A9_2018.jpg',
    details: 'Ailier ambidextre, capable d’accélérer très vite, d’éliminer en un contre un et de créer des décalages constants.',
    stats: { Sélections: 55, Buts: 7, Passes: 14, Trophées: 18 },
    performanceSeries: [{ label: '2018', value: 12 }, { label: '2021', value: 10 }, { label: '2023', value: 17 }, { label: '2025', value: 24 }],
    honors: ['Champion du monde 2018', 'Finaliste Coupe du monde 2022', 'Champion de France avec le PSG'],
  },
  {
    name: 'Paul Pogba',
    description: 'Milieu français, champion du monde 2018.',
    position: 'Milieu',
    era: '2013-',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Paul_Pogba_2018.jpg',
    details: 'Milieu complet, puissant et créatif, décisif dans la projection, la passe longue et les grands rendez-vous internationaux.',
    stats: { Sélections: 91, Buts: 11, Passes: 12, Trophées: 14 },
    performanceSeries: [{ label: '2014', value: 15 }, { label: '2016', value: 18 }, { label: '2018', value: 25 }, { label: '2021', value: 16 }],
    honors: ['Champion du monde 2018', 'Ligue des Nations 2021', 'Golden Boy 2013'],
  },
  {
    name: 'Bradley Barcola',
    description: 'Ailier français, joueur de percussion et de profondeur.',
    position: 'Ailier',
    era: '2023-',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Bradley_Barcola_2024.jpg',
    details: 'Ailier très vertical, utile pour attaquer l’espace, provoquer balle au pied et étirer les défenses adverses.',
    stats: { Sélections: 18, Buts: 3, Passes: 5, Note: 'Percussion' },
    performanceSeries: [{ label: '2022', value: 6 }, { label: '2023', value: 13 }, { label: '2024', value: 20 }, { label: '2025', value: 22 }],
    honors: ['International français', 'Champion de France avec le PSG', 'Révélation offensive en Ligue 1'],
  },
];

const BLEUS_PLAYER_MAP = new Map(BLEUS_PLAYER_DETAILS.map((player) => [player.name.toLocaleLowerCase('fr-FR'), player]));

const isBleusGallery = (gallery) => {
  const title = String(gallery?.title || '').toLocaleLowerCase('fr-FR');
  const description = String(gallery?.description || '').toLocaleLowerCase('fr-FR');
  return title.includes('bleus') || description.includes('footballeur') || description.includes('footballeuse');
};

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => ({
      id: item.id || `${item.name || 'item'}-${index}`,
      name: typeof item.name === 'string' ? item.name : 'Photo',
      description: typeof item.description === 'string' ? item.description : '',
      imageUrl: typeof item.imageUrl === 'string' && item.imageUrl.startsWith('https://') ? item.imageUrl : '',
      alt: typeof item.alt === 'string' ? item.alt : item.name || 'Photo',
      sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : '',
      sourceLabel: typeof item.sourceLabel === 'string' ? item.sourceLabel : 'Source',
      position: typeof item.position === 'string' ? item.position : '',
      era: typeof item.era === 'string' ? item.era : '',
      details: typeof item.details === 'string' ? item.details : '',
      stats: item.stats && typeof item.stats === 'object' ? item.stats : {},
      performanceSeries: Array.isArray(item.performanceSeries)
        ? item.performanceSeries
            .map((point) => ({
              label: typeof point.label === 'string' ? point.label : '',
              value: Number(point.value || 0),
            }))
            .filter((point) => point.label && Number.isFinite(point.value))
        : [],
      honors: Array.isArray(item.honors) ? item.honors.filter((honor) => typeof honor === 'string') : [],
    }));
}

function enrichBleusItems(gallery, items) {
  if (!isBleusGallery(gallery)) return items;

  const merged = items.map((item) => {
    const fallback = BLEUS_PLAYER_MAP.get(item.name.toLocaleLowerCase('fr-FR'));
    if (!fallback) return item;
    return {
      ...fallback,
      ...item,
      description: item.description || fallback.description || '',
      imageUrl: item.imageUrl || fallback.imageUrl || '',
      alt: item.alt || fallback.alt || fallback.name,
      sourceUrl: item.sourceUrl || fallback.sourceUrl || '',
      sourceLabel: item.sourceLabel || fallback.sourceLabel || 'Source',
      position: item.position || fallback.position || '',
      era: item.era || fallback.era || '',
      details: item.details || fallback.details || '',
      stats: Object.keys(item.stats || {}).length > 0 ? item.stats : fallback.stats || {},
      performanceSeries: (item.performanceSeries || []).length > 0 ? item.performanceSeries : fallback.performanceSeries || [],
      honors: (item.honors || []).length > 0 ? item.honors : fallback.honors || [],
    };
  });

  const existingNames = new Set(merged.map((item) => item.name.toLocaleLowerCase('fr-FR')));
  BLEUS_PLAYER_DETAILS.forEach((player) => {
    if (!existingNames.has(player.name.toLocaleLowerCase('fr-FR'))) {
      merged.push(normalizeItems([player])[0]);
    }
  });

  return merged;
}

function formatStatLabel(label) {
  const labels = {
    selections: 'Sélections',
    Sélections: 'Sélections',
    buts: 'Buts',
    Buts: 'Buts',
    passes: 'Passes',
    Passes: 'Passes',
    trophies: 'Trophées',
    trophées: 'Trophées',
    Trophées: 'Trophées',
    cleanSheets: 'Clean sheets',
    CleanSheets: 'Clean sheets',
    note: 'Note',
    Note: 'Note',
  };
  return labels[label] || label;
}

function formatStatValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toLocaleString('fr-FR').replace(/\u202f/g, ' ');
  }
  return String(value ?? '');
}

function GalleryImage({ src, alt, className = '' }) {
  const [hasError, setHasError] = useState(false);
  const canRender = src && !hasError;

  if (!canRender) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-blue-500/15 via-white/[0.04] to-red-500/10 text-white/35 ${className}`}>
        <ImageOff className="h-8 w-8" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setHasError(true)}
    />
  );
}

export default function ExtensionGalleryModal({ gallery, onClose }) {
  const [selectedId, setSelectedId] = useState(null);
  const items = useMemo(() => enrichBleusItems(gallery, normalizeItems(gallery?.items)), [gallery]);
  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedId) || null,
    [items, selectedId],
  );

  if (!gallery) return null;

  const title = typeof gallery.title === 'string' && gallery.title.trim()
    ? gallery.title.trim()
    : 'Galerie';
  const description = typeof gallery.description === 'string' ? gallery.description.trim() : '';

  return (
    <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-md flex items-center justify-center p-5">
      <div className="w-full max-w-5xl max-h-[86vh] overflow-hidden rounded-2xl border border-white/10 bg-[#101010]/95 shadow-2xl">
        <div className="flex items-start justify-between gap-4 px-5 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-white truncate">{title}</h2>
            {description && <p className="text-sm text-white/50 mt-1">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/10 transition-colors"
            title="Fermer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="max-h-[calc(86vh-82px)] overflow-y-auto custom-scrollbar p-5">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-3 min-h-64 text-white/40">
              <ImageOff className="w-10 h-10" />
              <p className="text-sm">Aucun joueur à afficher.</p>
            </div>
          ) : selectedItem ? (
            <div className="space-y-5">
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.05] px-3 py-2 text-sm font-medium text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <ArrowLeft className="h-4 w-4" />
                Retour aux joueurs
              </button>

              <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
                <div className="overflow-hidden rounded-xl border border-white/10 bg-black/25">
                  <div className="aspect-[4/5] bg-black/30">
                    <GalleryImage src={selectedItem.imageUrl} alt={selectedItem.alt} className="h-full w-full object-cover" />
                  </div>
                  <div className="p-4">
                    <h3 className="text-xl font-semibold text-white">{selectedItem.name}</h3>
                    <p className="mt-1 text-xs uppercase tracking-wider text-white/35">
                      {[selectedItem.position, selectedItem.era].filter(Boolean).join(' - ')}
                    </p>
                    {selectedItem.sourceUrl.startsWith('https://') && (
                      <button
                        type="button"
                        onClick={() => openLink(selectedItem.sourceUrl)}
                        className="mt-4 inline-flex items-center gap-2 text-xs text-red-200 transition-colors hover:text-white"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        {selectedItem.sourceLabel}
                      </button>
                    )}
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 p-5">
                  <div className="flex items-start gap-3">
                    <BarChart3 className="mt-1 h-5 w-5 text-blue-200" />
                    <div>
                      <h3 className="text-lg font-semibold text-white">Performances de {selectedItem.name}</h3>
                      {selectedItem.details && (
                        <p className="mt-2 text-sm leading-relaxed text-white/60">{selectedItem.details}</p>
                      )}
                    </div>
                  </div>

                  {Object.keys(selectedItem.stats).length > 0 && (
                    <div className="mt-5">
                      <h4 className="text-sm font-semibold text-white">Statistiques</h4>
                      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
                        {Object.entries(selectedItem.stats).map(([label, value]) => (
                          <div key={label} className="rounded-lg bg-white/[0.06] p-3">
                            <div className="text-lg font-semibold text-white">{formatStatValue(value)}</div>
                            <div className="text-xs text-white/40">{formatStatLabel(label)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedItem.performanceSeries.length > 0 && (
                    <div className="mt-5">
                      <h4 className="mb-2 text-sm font-semibold text-white">Évolution</h4>
                      <div
                        className="flex h-40 items-end gap-2 rounded-lg bg-white/[0.04] p-3"
                        role="img"
                        aria-label={`Graphique de performances de ${selectedItem.name}`}
                      >
                        {selectedItem.performanceSeries.map((point) => {
                          const max = Math.max(...selectedItem.performanceSeries.map((item) => item.value), 1);
                          const height = Math.max(10, Math.round((point.value / max) * 112));
                          return (
                            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                              <div className="text-[10px] text-white/45">{point.value}</div>
                              <div className="w-full rounded-t bg-blue-400/80" style={{ height }} />
                              <div className="max-w-full truncate text-[10px] text-white/35">{point.label}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {selectedItem.honors.length > 0 && (
                    <div className="mt-5">
                      <h4 className="text-sm font-semibold text-white">Palmarès</h4>
                      <ul className="mt-2 space-y-1 text-sm text-white/55">
                        {selectedItem.honors.map((honor) => (
                          <li key={honor}>- {honor}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((item) => {
                  return (
                  <article
                    key={item.id}
                    className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.04] text-left transition-colors hover:border-white/20 hover:bg-white/[0.06]"
                  >
                    <div className="aspect-[4/3] bg-black/30">
                      <GalleryImage
                        src={item.imageUrl}
                        alt={item.alt}
                        className="h-full w-full object-cover"
                      />
                    </div>
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-white">{item.name}</h3>
                          {(item.position || item.era) && (
                            <p className="mt-0.5 text-xs uppercase tracking-wider text-white/35">
                              {[item.position, item.era].filter(Boolean).join(' - ')}
                            </p>
                          )}
                        </div>
                      </div>
                      {item.description && (
                        <p className="text-sm text-white/55 mt-1">{item.description}</p>
                      )}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedId(item.id)}
                          className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-xs font-medium text-white/80 hover:bg-white/15 hover:text-white transition-colors"
                        >
                          <BarChart3 className="h-3.5 w-3.5" />
                          Voir les performances
                        </button>
                        {item.sourceUrl.startsWith('https://') && (
                          <button
                            type="button"
                            onClick={() => openLink(item.sourceUrl)}
                            className="inline-flex items-center gap-2 text-xs text-red-200 hover:text-white transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            {item.sourceLabel}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                  );
                })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
