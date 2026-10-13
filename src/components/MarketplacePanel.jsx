import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Download,
  ExternalLink,
  FileUp,
  PackageCheck,
  Power,
  RefreshCw,
  RotateCw,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { open as openLink } from '@tauri-apps/plugin-shell';
import CustomSelect from './CustomSelect';
import {
  DEFAULT_EXTENSION_REGISTRY_URL,
  ExtensionStore,
  PERMISSION_LABELS,
  fetchExtensionRegistry,
  getBundledExtensionExamples,
  getInstalledVersionState,
  prepareExtension,
  prepareExtensionFromFiles,
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

const RUNTIME_BADGES = {
  active: { label: 'Actif', className: 'bg-emerald-500/15 text-emerald-300' },
  disabled: { label: 'Désactivé', className: 'bg-white/10 text-white/45' },
  error: { label: 'Erreur', className: 'bg-red-500/15 text-red-300' },
};

function PermissionList({ manifest }) {
  const permissions = manifest.permissions || [];
  if (permissions.length === 0) {
    return <p className="text-xs text-white/40 mt-3">Aucune permission : n’accède ni à vos événements ni à Internet.</p>;
  }
  return (
    <ul className="mt-3 space-y-1">
      {permissions.map((permission) => (
        <li key={permission} className="flex items-center gap-2 text-xs text-white/60">
          <ShieldCheck className="w-3.5 h-3.5 text-amber-300 shrink-0" />
          <span>
            {PERMISSION_LABELS[permission] || permission}
            {permission === 'network' && manifest.hosts?.length > 0 && ` : ${manifest.hosts.join(', ')}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function SettingField({ setting, value, onChange }) {
  if (setting.type === 'boolean') {
    return (
      <label className="flex items-center justify-between gap-4 cursor-pointer">
        <span className="text-sm text-white/80">{setting.label}</span>
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(event) => onChange(event.target.checked)}
          className="w-4 h-4 accent-blue-500"
        />
      </label>
    );
  }

  return (
    <label className="block space-y-1.5">
      <span className="text-sm text-white/80">{setting.label}</span>
      {setting.type === 'select' ? (
        <CustomSelect
          value={value}
          options={setting.options}
          onChange={onChange}
          ariaLabel={setting.label}
        />
      ) : (
        <input
          type={setting.type === 'number' ? 'number' : 'text'}
          value={value ?? ''}
          min={setting.min}
          max={setting.max}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-white outline-none focus:ring-2 focus:ring-blue-500/50"
        />
      )}
    </label>
  );
}

function ExtensionSettingsForm({ extension, onSave }) {
  const [values, setValues] = useState(extension.config || {});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      setValues(await onSave(values));
      setSaved(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-4 p-4 rounded-xl bg-black/20 border border-white/10 space-y-4">
      {extension.manifest.settings.map((setting) => (
        <div key={setting.key}>
          <SettingField
            setting={setting}
            value={values[setting.key]}
            onChange={(value) => {
              setSaved(false);
              setValues((current) => ({ ...current, [setting.key]: value }));
            }}
          />
          {setting.description && <p className="text-xs text-white/40 mt-1">{setting.description}</p>}
        </div>
      ))}
      <div className="flex items-center justify-end gap-3">
        {saved && <span className="text-xs text-emerald-300">Enregistré</span>}
        <button
          onClick={save}
          disabled={saving}
          className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm"
        >
          Enregistrer
        </button>
      </div>
    </div>
  );
}

function readFiles(fileList) {
  return Promise.all(Array.from(fileList || []).map(async (file) => ({ name: file.name, text: await file.text() })));
}

export default function MarketplacePanel({
  installedExtensions = [],
  extensionErrors = [],
  extensionControls,
}) {
  const [registry, setRegistry] = useState([]);
  const [loading, setLoading] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null);
  const [openSettingsId, setOpenSettingsId] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const bundledExamples = useMemo(() => getBundledExtensionExamples(), []);

  const installedById = useMemo(() => {
    return new Map(installedExtensions.map((extension) => [extension.manifest.id, extension]));
  }, [installedExtensions]);

  const availableExamples = useMemo(() => {
    return bundledExamples.filter((example) => !installedById.has(example.manifest.id));
  }, [bundledExamples, installedById]);

  // Errors not tied to an installed extension (invalid manifest, runtime).
  const orphanErrors = useMemo(
    () => extensionErrors.filter((item) => !installedById.has(item.extensionId)),
    [extensionErrors, installedById],
  );

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

  const run = async (id, action, fallbackMessage) => {
    setWorkingId(id);
    setError('');
    try {
      return await action();
    } catch (err) {
      setError(err.message || fallbackMessage);
      return null;
    } finally {
      setWorkingId(null);
    }
  };

  // Every install goes through a preview showing what the extension asks for.
  const preview = (prepared, source) => {
    setPending({ ...prepared, source, update: installedById.has(prepared.manifest.id) });
  };

  const handleFiles = async (fileList) => {
    setError('');
    try {
      preview(prepareExtensionFromFiles(await readFiles(fileList)), 'local-file');
    } catch (err) {
      setError(err.message || 'Fichier d’extension invalide.');
    }
  };

  const confirmInstall = () => run(pending.manifest.id, async () => {
    await extensionControls.install({ manifest: pending.manifest, code: pending.code }, { source: pending.source });
    setPending(null);
  }, 'Installation impossible.');

  const previewRegistryEntry = (entry) => run(entry.id, async () => {
    preview(await store.prepareFromRegistryEntry(entry), entry.repository);
  }, 'Téléchargement impossible.');

  const previewExample = (example) => run(example.manifest.id, async () => {
    preview(prepareExtension({ manifestText: example.manifestText, code: example.entryCode || '' }), 'bundled-example');
  }, 'Exemple invalide.');

  return (
    <div
      className="space-y-6"
      onDragOver={(event) => {
        if (!event.dataTransfer?.types?.includes('Files')) return;
        event.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setIsDragging(false);
      }}
      onDrop={(event) => {
        if (!event.dataTransfer?.files?.length) return;
        event.preventDefault();
        setIsDragging(false);
        handleFiles(event.dataTransfer.files);
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-sm font-medium text-gray-400 uppercase tracking-wider">Extensions</h4>
          <p className="text-sm text-gray-400 mt-2">
            Thèmes et plugins. Chaque plugin tourne isolé de Caltemp et n’accède qu’à ce que ses permissions autorisent ; les changements s’appliquent sans redémarrer.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors text-sm"
            title="Installer un plugin (.js) ou un thème (manifest.json)"
          >
            <FileUp className="w-4 h-4" />
            Installer un fichier
          </button>
          <button
            onClick={() => run('all', () => extensionControls.refresh(), 'Rechargement impossible.')}
            disabled={workingId === 'all'}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50"
            title="Recharger toutes les extensions"
          >
            <RotateCw className={`w-4 h-4 ${workingId === 'all' ? 'animate-spin' : ''}`} />
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".js,.mjs,.json"
            multiple
            className="hidden"
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </div>
      </div>

      {isDragging && (
        <div className="p-6 rounded-xl border-2 border-dashed border-blue-400/60 bg-blue-500/10 text-center text-sm text-blue-100">
          Déposez un fichier .js (plugin) ou manifest.json (thème, ou avec son fichier .js)
        </div>
      )}

      {error && (
        <div className="flex gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-200 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {pending && (
        <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-400/30">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-blue-300" />
                <h6 className="font-semibold text-white truncate">{pending.manifest.name}</h6>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                  {extensionKindLabel(pending.manifest.type)}
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {pending.manifest.id} · {pending.manifest.version}
                {pending.manifest.author && ` · ${pending.manifest.author}`}
              </p>
              {pending.manifest.description && (
                <p className="text-sm text-gray-300 mt-3">{pending.manifest.description}</p>
              )}
              {pending.manifest.type === 'plugin' && <PermissionList manifest={pending.manifest} />}
            </div>
            <button
              onClick={() => setPending(null)}
              className="p-2 rounded-lg hover:bg-white/10 text-white/50 hover:text-white"
              title="Annuler"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex justify-end mt-4">
            <button
              onClick={confirmInstall}
              disabled={workingId === pending.manifest.id}
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm"
            >
              <Download className="w-4 h-4" />
              {pending.update ? 'Mettre à jour' : 'Installer et activer'}
            </button>
          </div>
        </div>
      )}

      {orphanErrors.length > 0 && (
        <div className="space-y-2">
          {orphanErrors.map((item, index) => (
            <div key={`${item.extensionId || 'extension'}-${index}`} className="flex gap-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-100 text-sm">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{item.extensionId ? `${item.extensionId}: ` : ''}{item.message}</span>
            </div>
          ))}
        </div>
      )}

      <section className="space-y-3">
        <div>
          <h5 className="text-sm font-semibold text-white">Installées</h5>
          <p className="text-xs text-white/40 mt-1">
            Dans AppData/extensions. Après avoir modifié un plugin sur le disque, utilisez « Recharger ».
          </p>
        </div>

        {installedExtensions.length === 0 ? (
          <div className="p-5 rounded-xl bg-white/5 border border-dashed border-white/10 text-sm text-gray-400">
            Aucune extension installée. Glissez un fichier .js ici pour essayer un plugin.
          </div>
        ) : (
          <div className="grid gap-3">
            {installedExtensions.map((extension) => {
              const { manifest, enabled, source, status, error: runtimeError } = extension;
              const badge = RUNTIME_BADGES[status] || RUNTIME_BADGES.disabled;
              const busy = workingId === manifest.id;
              const hasSettings = manifest.type === 'plugin' && manifest.settings?.length > 0;
              return (
                <div key={manifest.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <PackageCheck className="w-4 h-4 text-cyan-300" />
                        <h6 className="font-semibold text-white truncate">{manifest.name}</h6>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                          {extensionKindLabel(manifest.type)}
                        </span>
                        <span className={`text-[11px] px-2 py-0.5 rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {manifest.version} · {source || 'local'}
                      </p>
                      {manifest.description && (
                        <p className="text-sm text-gray-300 mt-3">{manifest.description}</p>
                      )}
                      {runtimeError && (
                        <p className="flex gap-2 text-xs text-red-300 mt-3">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{runtimeError}</span>
                        </p>
                      )}
                      {manifest.type === 'plugin' && <PermissionList manifest={manifest} />}
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
                      {hasSettings && (
                        <button
                          onClick={() => setOpenSettingsId((current) => (current === manifest.id ? null : manifest.id))}
                          className={`p-2 rounded-lg hover:bg-white/10 ${openSettingsId === manifest.id ? 'bg-white/15 text-white' : 'bg-white/5 text-white/60 hover:text-white'}`}
                          title="Réglages de l’extension"
                        >
                          <Settings2 className="w-4 h-4" />
                        </button>
                      )}
                      {enabled && manifest.type === 'plugin' && (
                        <button
                          onClick={() => run(manifest.id, () => extensionControls.reload(manifest.id), 'Rechargement impossible.')}
                          disabled={busy}
                          className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white disabled:opacity-50"
                          title="Recharger depuis le disque"
                        >
                          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                      <button
                        onClick={() => run(manifest.id, () => extensionControls.setEnabled(manifest.id, !enabled), 'Changement d’état impossible.')}
                        disabled={busy}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg disabled:opacity-50 text-white text-sm ${enabled ? 'bg-white/10 hover:bg-white/15' : 'bg-emerald-600 hover:bg-emerald-500'}`}
                      >
                        <Power className="w-4 h-4" />
                        {enabled ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        onClick={() => run(manifest.id, () => extensionControls.remove(manifest.id), 'Suppression impossible.')}
                        disabled={busy}
                        className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 disabled:opacity-50"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  {hasSettings && openSettingsId === manifest.id && (
                    <ExtensionSettingsForm
                      key={manifest.version}
                      extension={extension}
                      onSave={(values) => extensionControls.saveConfig(manifest.id, values)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-3">
        <div>
          <h5 className="text-sm font-semibold text-white">Exemples inclus</h5>
          <p className="text-xs text-white/40 mt-1">
            Thèmes et plugins fournis avec Caltemp, utiles comme point de départ.
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
                      onClick={() => previewExample(example)}
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <h5 className="text-sm font-semibold text-white">Marketplace GitHub</h5>
            <p className="text-xs text-white/40 mt-1">
              Registry officiel: {DEFAULT_EXTENSION_REGISTRY_URL}
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

        {registry.length === 0 && !loading && (
          <div className="p-6 rounded-xl bg-white/5 border border-dashed border-white/10 text-center text-sm text-gray-400">
            Aucune extension publiée dans le registry officiel pour le moment.
          </div>
        )}

        <div className="grid gap-3">
          {registry.map((entry) => {
            const installed = installedById.get(entry.id);
            const status = getInstalledVersionState(entry, installed);
            const description = installed?.manifest?.description || entry.description;

            return (
              <div key={entry.id} className="p-4 rounded-xl bg-white/5 border border-white/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <PackageCheck className="w-4 h-4 text-cyan-300" />
                      <h5 className="font-semibold text-white truncate">{installed?.manifest?.name || entry.name || entry.id}</h5>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/60">
                        {statusLabel(status)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {entry.latestVersion} · GitHub · {entry.publishedAt || 'date inconnue'}
                    </p>
                    {description && <p className="text-sm text-gray-300 mt-3">{description}</p>}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {entry.changelogUrl && (
                      <button
                        onClick={() => openLink(entry.changelogUrl)}
                        className="p-2 rounded-lg bg-white/5 hover:bg-white/10 text-white/60 hover:text-white"
                        title="Voir les nouveautés"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => previewRegistryEntry(entry)}
                      disabled={workingId === entry.id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm"
                    >
                      <Download className="w-4 h-4" />
                      {actionLabel(status)}
                    </button>
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
