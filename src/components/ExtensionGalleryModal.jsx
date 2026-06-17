import React from 'react';
import { ExternalLink, ImageOff, X } from 'lucide-react';
import { open as openLink } from '@tauri-apps/plugin-shell';

function normalizeItems(items = []) {
  if (!Array.isArray(items)) return [];

  return items
    .map((item, index) => ({
      id: item.id || `${item.name || 'item'}-${index}`,
      name: typeof item.name === 'string' ? item.name : 'Photo',
      description: typeof item.description === 'string' ? item.description : '',
      imageUrl: typeof item.imageUrl === 'string' ? item.imageUrl : '',
      alt: typeof item.alt === 'string' ? item.alt : item.name || 'Photo',
      sourceUrl: typeof item.sourceUrl === 'string' ? item.sourceUrl : '',
      sourceLabel: typeof item.sourceLabel === 'string' ? item.sourceLabel : 'Source',
    }))
    .filter((item) => item.imageUrl.startsWith('https://'));
}

export default function ExtensionGalleryModal({ gallery, onClose }) {
  if (!gallery) return null;

  const items = normalizeItems(gallery.items);
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
              <p className="text-sm">Aucune image HTTPS valide à afficher.</p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04]"
                >
                  <div className="aspect-[4/3] bg-black/30">
                    <img
                      src={item.imageUrl}
                      alt={item.alt}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-4">
                    <h3 className="font-semibold text-white">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-white/55 mt-1">{item.description}</p>
                    )}
                    {item.sourceUrl.startsWith('https://') && (
                      <button
                        type="button"
                        onClick={() => openLink(item.sourceUrl)}
                        className="inline-flex items-center gap-2 mt-3 text-xs text-red-200 hover:text-white transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {item.sourceLabel}
                      </button>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
