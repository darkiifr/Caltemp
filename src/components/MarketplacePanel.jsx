import React, { useEffect, useMemo, useState } from 'react';
import {
  Download,
  ExternalLink,
  Power,
  RefreshCw,
  RotateCcw,
  Trash2,
  PackageCheck,
  AlertTriangle,
} from 'lucide-react';
import { open as openLink } from '@tauri-apps/plugin-shell';
import { ExtensionStore } from '../extensions/extensionStore';
import {
  DEFAULT_EXTENSION_REGISTRY_URL,
  fetchExtensionRegistry,
  getBundledExtensionExamples,
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

function extensionKindLabel(type) {
  return type === 'theme' ? 'Thème' : 'Plugin';
}

export default function MarketplacePanel({
  installedExtensions = [],
  extensionErrors = [],
  onRefreshExtensions,
  onRequestRestart,
}) {
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState('');
  const bundledExamples = useMemo(() => getBundledExtensionExamples(), []);

  const installedById = useMemo(() => {
    return new Map(installedExtensions.map((extension) => [extension.manifest.id, extension]));
  }, [installedExtensions]);

  const availableExamples = useMemo(() => {
    return bundledExamples.filter((example) => !installedById.has(example.manifest.id));
  }, [bundledExamples, installedById]);

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

  const installExample = async (example) => {
    setWorkingId(example.manifest.id);
    setError('');
    try {
      await store.installFromLocalExample(example);
      await onRefreshExtensions?.();
    } catch (err) {
      setError(err.message || 'Installation locale impossible.');
    } finally {
      setWorkingId(null);
    }
  };

  const setEnabled = async (extensionId, enabled) => {
    setWorkingId(extensionId);
    setError('');
    try {
      await store.setEnabled(extensionId, enabled);
      await onRefreshExtensions?.();
    } catch (err) {
      setError(err.message || 'Changement d’état impossible.');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Extensions</h4>
          <p className="text-sm text-gray-400 mt-2">
            Gérez les thèmes et plugins locaux, les exemples inclus et les extensions publiées via GitHub.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRequestRestart}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors text-sm"
            title="Redémarrer Caltemp"
          >
            <RotateCcw className="w-4 h-4" />
            Redémarrer
          </button>
          <button
            onClick={loadRegistry}
            disabled={loading}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors"
            title="Rafraîchir le registry"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
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

      <section className="space-y-3">
        <div>
          <h5 className="text-sm font-semibold text-white">Installées localement</h5>
          <p className="text-xs text-white/40 mt-1">
            Extensions détectées dans AppData/extensions et exemples installés depuis Caltemp.
          </p>
        </div>

        {installedExtensions.length === 0 ? (
          <div className="p-5 rounded-xl bg-white/5 border border-dashed border-white/10 text-sm text-gray-400">
            Aucune extension locale installée.
          </div>
        ) : (
          <div className="grid gap-3">
            {installedExtensions.map(({ manifest, enabled, source }) => (
              <div key={manifest.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="w-4 h-4 text-cyan-300" />
                      <h6 className="font-semibold text-white truncate">{manifest.name}</h6>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                        {extensionKindLabel(manifest.type)}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full ${enabled ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/45'}`}>
                        {enabled ? 'Actif' : 'Désactivé'}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {manifest.version} · {source || 'local'}
                    </p>
                    {manifest.description && (
                      <p className="text-sm text-gray-300 mt-3">{manifest.description}</p>
                    )}
                    {manifest.permissions?.length > 0 && (
                      <p className="text-xs text-gray-500 mt-3">
                        Permissions: {manifest.permissions.join(', ')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {manifest.repository && (
                      <button
                        onClick={() => openLink(manifest.repository)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                        title="Ouvrir la source"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => setEnabled(manifest.id, !enabled)}
                      disabled={workingId === manifest.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg disabled:opacity-50 text-white text-sm ${enabled ? 'bg-white/10 hover:bg-white/15' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                    >
                      <Power className="w-4 h-4" />
                      {enabled ? 'Désactiver' : 'Activer'}
                    </button>
                    <button
                      onClick={() => removeExtension(manifest.id)}
                      disabled={workingId === manifest.id}
                      className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 disabled:opacity-50"
                      title="Supprimer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h5 className="text-sm font-semibold text-white">Exemples inclus</h5>
          <p className="text-xs text-white/40 mt-1">
            Thèmes et plugins fournis dans le repo au format dossier avec manifest.
          </p>
        </div>
        {availableExamples.length === 0 ? (
          <div className="p-5 rounded-xl bg-white/5 border border-dashed border-white/10 text-sm text-gray-400">
            Tous les exemples inclus sont installés.
          </div>
        ) : (
          <div className="grid gap-3">
            {availableExamples.map((example) => {
              const { manifest } = example;
              return (
                <div key={manifest.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <PackageCheck className="w-4 h-4 text-red-300" />
                        <h6 className="font-semibold text-white truncate">{manifest.name}</h6>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                          {extensionKindLabel(manifest.type)}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{manifest.version} · {example.folderPath}</p>
                      <p className="text-sm text-gray-300 mt-3">{manifest.description}</p>
                    </div>
                    <button
                      onClick={() => installExample(example)}
                      disabled={workingId === manifest.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm"
                    >
                      <Download className="w-4 h-4" />
                      Installer
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h5 className="text-sm font-semibold text-white">Marketplace GitHub</h5>
          <p className="text-xs text-white/40 mt-1">
            Registry officiel: {DEFAULT_EXTENSION_REGISTRY_URL}
          </p>
        </div>

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
      </section>
    </div>
  );
}
