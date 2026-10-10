import React, { useCallback, useEffect, useState } from 'react';
import { Check, Cpu, Download, HardDrive, Loader2, Trash2, X } from 'lucide-react';
import {
  cancelLocalModelInstall,
  formatBytes,
  getCachedLocalAiStatus,
  installLocalModel,
  isModelReady,
  listenLocalAiProgress,
  normalizeLocalAiSettings,
  PROGRESS_STAGE_LABELS,
  refreshLocalAiStatus,
  removeLocalModel,
  subscribeLocalAiStatus,
} from '../services/localAi';

export function useLocalAiStatus() {
  const [status, setStatus] = useState(getCachedLocalAiStatus);
  useEffect(() => {
    const unsubscribe = subscribeLocalAiStatus(setStatus);
    refreshLocalAiStatus();
    return unsubscribe;
  }, []);
  return status;
}

/**
 * Picks and installs Dexter's local model (llama.cpp + GGUF). Used in Dexter
 * when nothing is installed yet and in Settings › IA.
 * `localAi` is settings.localAi; `onChange(patch)` updates it.
 */
export default function LocalModelSetup({ localAi, onChange, compact = false, onReady }) {
  const status = useLocalAiStatus();
  const settings = normalizeLocalAiSettings(localAi);
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const installing = busy || Boolean(status?.installing);

  useEffect(() => {
    let unlisten = null;
    let disposed = false;
    listenLocalAiProgress((payload) => {
      if (payload.stage === 'done' || payload.stage === 'error') setProgress(null);
      else setProgress(payload);
    }).then((cleanup) => {
      if (disposed) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  const ready = isModelReady(status, settings);
  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  const install = useCallback(async (modelId) => {
    setError('');
    setBusy(true);
    onChange?.({ modelId });
    try {
      await installLocalModel({ modelId, gpu: settings.gpu });
    } catch (installError) {
      setError(String(installError?.message || installError));
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }, [onChange, settings.gpu]);

  const remove = useCallback(async (modelId) => {
    setError('');
    try {
      await removeLocalModel(modelId);
    } catch (removeError) {
      setError(String(removeError?.message || removeError));
    }
  }, []);

  if (!status) {
    return (
      <div className="flex items-center gap-2 text-sm text-white/50">
        <Loader2 className="h-4 w-4 animate-spin" /> Vérification du modèle local…
      </div>
    );
  }

  if (!status.supported) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/60">
        {status.unavailableReason === 'browser'
          ? 'Le modèle local de Dexter fonctionne uniquement dans l’application de bureau Caltemp.'
          : 'Cette plateforme n’est pas prise en charge par llama.cpp.'}
      </div>
    );
  }

  const runtimeReady = settings.gpu && status.gpuVariantAvailable ? status.gpuRuntimeInstalled : status.runtimeInstalled;
  const percent = progress?.total ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100)) : null;

  return (
    <div className="space-y-3">
      {!compact && (
        <p className="text-sm leading-6 text-white/55">
          Dexter fonctionne entièrement sur cet ordinateur grâce à llama.cpp : vos événements ne quittent jamais la machine.
          Le modèle n’est chargé en mémoire que pendant l’utilisation de Dexter, puis libéré après quelques minutes d’inactivité.
        </p>
      )}

      {installing && (
        <div className="rounded-xl border border-blue-400/20 bg-blue-500/[0.06] p-4">
          <div className="flex items-center justify-between gap-3 text-sm text-white">
            <span className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              {PROGRESS_STAGE_LABELS[progress?.stage] || 'Installation en cours'}
              {percent !== null && ` · ${percent} %`}
            </span>
            <button
              type="button"
              onClick={() => cancelLocalModelInstall()}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white"
            >
              <X className="h-3.5 w-3.5" /> Annuler
            </button>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-blue-400 transition-[width] duration-300"
              style={{ width: `${percent ?? 8}%` }}
            />
          </div>
          {progress?.total > 0 && (
            <div className="mt-2 text-[11px] text-white/45">
              {formatBytes(progress.downloaded)} / {formatBytes(progress.total)}
            </div>
          )}
        </div>
      )}

      <div className="space-y-2">
        {status.models.map((model) => {
          const selected = model.id === settings.modelId;
          return (
            <div
              key={model.id}
              className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center ${selected ? 'border-blue-400/40 bg-blue-500/[0.07]' : 'border-white/10 bg-white/[0.03]'}`}
            >
              <button
                type="button"
                onClick={() => onChange?.({ modelId: model.id })}
                disabled={installing}
                className="flex min-w-0 flex-1 items-start gap-3 text-left disabled:cursor-default"
              >
                <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${selected ? 'border-blue-300 bg-blue-500 text-white' : 'border-white/25'}`}>
                  {selected && <Check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-white">
                    {model.label}
                    {model.recommended && <span className="rounded-md bg-emerald-400/10 px-1.5 py-0.5 text-[11px] text-emerald-200">Recommandé</span>}
                    {model.installed && <span className="rounded-md bg-white/10 px-1.5 py-0.5 text-[11px] text-white/70">Installé</span>}
                  </span>
                  <span className="mt-1 block text-xs leading-5 text-white/50">{model.description}</span>
                  <span className="mt-1 flex items-center gap-1 text-[11px] text-white/35">
                    <HardDrive className="h-3 w-3" />
                    {formatBytes(model.sizeBytes || model.approxBytes)} · licence {model.license}
                  </span>
                </span>
              </button>
              <div className="flex shrink-0 gap-2">
                {model.installed && selected && !runtimeReady && (
                  <button
                    type="button"
                    onClick={() => install(model.id)}
                    disabled={installing}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" /> Installer le moteur
                  </button>
                )}
                {model.installed ? (
                  <button
                    type="button"
                    onClick={() => remove(model.id)}
                    disabled={installing}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs text-white/50 hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"
                    title="Supprimer ce modèle du disque"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Supprimer
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => install(model.id)}
                    disabled={installing}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-3 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
                  >
                    <Download className="h-3.5 w-3.5" /> Installer
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {status.gpuVariantAvailable && (
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <input
            type="checkbox"
            className="mt-1"
            checked={settings.gpu}
            disabled={installing}
            onChange={(event) => onChange?.({ gpu: event.target.checked })}
          />
          <span>
            <span className="flex items-center gap-2 text-sm font-medium text-white"><Cpu className="h-4 w-4" /> Accélération GPU (Vulkan)</span>
            <span className="mt-1 block text-xs leading-5 text-white/50">
              Décharge le calcul sur la carte graphique : moins de processeur utilisé et des réponses plus rapides.
              Nécessite un pilote compatible Vulkan ; installe une variante du moteur (~30 Mo).
              {settings.gpu && !status.gpuRuntimeInstalled && ' Utilisez « Installer » pour la télécharger.'}
            </span>
          </span>
        </label>
      )}

      {error && (
        <div className="rounded-xl border border-red-400/20 bg-red-500/[0.06] p-3 text-xs leading-5 text-red-100 whitespace-pre-wrap">{error}</div>
      )}

      {!compact && (
        <p className="text-[11px] leading-5 text-white/35">
          Sources : moteur llama.cpp {status.llamaCppBuild} (GitHub ggml-org) et modèles GGUF (Hugging Face), vérifiés par empreinte SHA-256.
          Dossier : {status.dataDir}
        </p>
      )}
    </div>
  );
}
