import React, { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, RefreshCw, Trash2, PackageCheck, AlertTriangle } from 'lucide-react';
import { open as openLink } from '@tauri-apps/plugin-shell';
import { ExtensionStore } from '../extensions/extensionStore';
import {
  DEFAULT_EXTENSION_REGISTRY_URL,
  fetchExtensionRegistry,
  getInstalledVersionState,
} from '../extensions';

const store = new ExtensionStore();

function statusLabel(status) {
  if (status === 'installed') return 'Installé';
  if (status === 'update') return 'Mise à jour';
  return 'Disponible';
}

function actionLabel(status) {
  if (status === 'installed') return 'Réinstaller';
  if (status === 'update') return 'Mettre à jour';
  return 'Installer';
}

export default function MarketplacePanel({ installedExtensions = [], extensionErrors = [], onRefreshExtensions }) {
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState('');

  const installedById = useMemo(() => {
    return new Map(installedExtensions.map((extension) => [extension.manifest.id, extension]));
  }, [installedExtensions]);

  const loadRegistry = async () => {
    setLoading(true);
    setError('');
    try {
      setRegistry(await fetchExtensionRegistry(DEFAULT_EXTENSION_REGISTRY_URL));
    } catch (err) {
      setError(err.message || 'Registry indisponible.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRegistry();
  }, []);

  const install = async (entry) => {
    setWorkingId(entry.id);
    setError('');
    try {
      await store.installFromRegistryEntry(entry);
      await onRefreshExtensions?.();
    } catch (err) {
      setError(err.message || 'Installation impossible.');
    } finally {
      setWorkingId(null);
    }
  };

  const removeExtension = async (extensionId) => {
    setWorkingId(extensionId);
    setError('');
    try {
      await store.removeExtension(extensionId);
      await onRefreshExtensions?.();
    } catch (err) {
      setError(err.message || 'Suppression impossible.');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Marketplace GitHub</h4>
          <p className="text-sm text-gray-400 mt-2">
            Découvrez, installez et mettez à jour les thèmes et plugins validés pour Caltemp.
          </p>
        </div>
        <button
          onClick={loadRegistry}
          disabled={loading}
          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          title="Rafraîchir le registry"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="flex gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {extensionErrors.length > 0 && (
        <div className="space-y-2">
          {extensionErrors.map((item, index) => (
            <div key={`${item.extensionId || 'extension'}-${index}`} className="flex gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{item.extensionId ? `${item.extensionId}: ` : ''}{item.message}</span>
            </div>
          ))}
        </div>
      )}

      {registry.length === 0 && !loading && !error && (
        <div className="p-6 rounded-xl bg-white/5 border border-dashed border-white/10 text-center text-sm text-gray-400">
          Aucune extension publiée dans le registry officiel pour le moment.
        </div>
      )}

      <div className="grid gap-3">
        {registry.map((entry) => {
          const installed = installedById.get(entry.id);
          const status = getInstalledVersionState(entry, installed);
          const manifest = installed?.manifest;

          return (
            <div key={entry.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="w-4 h-4 text-cyan-300" />
                    <h5 className="font-semibold text-white truncate">{manifest?.name || entry.id}</h5>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                      {statusLabel(status)}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {entry.latestVersion} · GitHub · {entry.publishedAt || 'date inconnue'}
                  </p>
                  {manifest?.description && (
                    <p className="text-sm text-gray-300 mt-3">{manifest.description}</p>
                  )}
                  {manifest?.permissions?.length > 0 && (
                    <p className="text-xs text-gray-500 mt-3">
                      Permissions: {manifest.permissions.join(', ')}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openLink(entry.changelogUrl)}
                    className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                    title="Voir les nouveautés"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => install(entry)}
                    disabled={workingId === entry.id}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm"
                  >
                    <Download className="w-4 h-4" />
                    {actionLabel(status)}
                  </button>
                  {installed && (
                    <button
                      onClick={() => removeExtension(entry.id)}
                      disabled={workingId === entry.id}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 disabled:opacity-50"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
