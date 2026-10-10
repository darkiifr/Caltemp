// Bridge to the native llama.cpp manager (src-tauri/src/local_ai.rs).
// The model and the llama.cpp runtime are downloaded on demand, never bundled.
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { normalizeLocalAiSettings } from '../domain/localAiSettings';

export const LOCAL_AI_PROGRESS_EVENT = 'local-ai-progress';
export {
  DEFAULT_LOCAL_AI_MODEL_ID,
  DEFAULT_LOCAL_AI_SETTINGS,
  LOCAL_AI_CTX_CHOICES,
  LOCAL_AI_IDLE_TIMEOUT_CHOICES,
  normalizeLocalAiSettings,
} from '../domain/localAiSettings';

const isTauri = () => typeof window !== 'undefined' && Boolean(window.__TAURI_INTERNALS__);

let cachedStatus = null;
const statusListeners = new Set();

function publishStatus(status) {
  cachedStatus = status;
  for (const listener of statusListeners) listener(status);
  return status;
}

export function getCachedLocalAiStatus() {
  return cachedStatus;
}

export function subscribeLocalAiStatus(listener) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

/** True when the chosen model and the llama.cpp runtime are on disk. */
export function isModelReady(status, settings = {}) {
  if (!status?.supported) return false;
  const { modelId, gpu } = normalizeLocalAiSettings(settings);
  const model = status.models?.find(item => item.id === modelId);
  const runtimeReady = gpu && status.gpuVariantAvailable ? status.gpuRuntimeInstalled : status.runtimeInstalled;
  return Boolean(model?.installed && runtimeReady);
}

export async function refreshLocalAiStatus() {
  if (!isTauri()) {
    return publishStatus({ supported: false, models: [], runtimeInstalled: false, unavailableReason: 'browser' });
  }
  try {
    return publishStatus(await invoke('local_ai_status'));
  } catch (error) {
    console.error('Local AI status failed:', error);
    return publishStatus({ supported: false, models: [], runtimeInstalled: false, error: String(error) });
  }
}

export async function installLocalModel({ modelId, gpu = false }) {
  try {
    await invoke('local_ai_install', { modelId, gpu });
  } finally {
    await refreshLocalAiStatus();
  }
}

export function cancelLocalModelInstall() {
  return invoke('local_ai_cancel_install');
}

export async function removeLocalModel(modelId) {
  try {
    await invoke('local_ai_remove_model', { modelId });
  } finally {
    await refreshLocalAiStatus();
  }
}

export async function uninstallLocalAi() {
  try {
    await invoke('local_ai_uninstall');
  } finally {
    await refreshLocalAiStatus();
  }
}

export function stopLocalServer() {
  if (!isTauri()) return Promise.resolve();
  return invoke('local_ai_stop').then(refreshLocalAiStatus);
}

export function touchLocalServer() {
  if (!isTauri()) return Promise.resolve();
  return invoke('local_ai_touch').catch(() => {});
}

export function ensureLocalServer(settings = {}) {
  const local = normalizeLocalAiSettings(settings);
  return invoke('local_ai_ensure_server', {
    modelId: local.modelId,
    options: {
      gpu: local.gpu,
      threads: local.threads || null,
      ctxSize: local.ctxSize,
      idleTimeoutSecs: local.idleTimeoutMinutes * 60,
    },
  });
}

export function listenLocalAiProgress(handler) {
  if (!isTauri()) return Promise.resolve(() => {});
  return listen(LOCAL_AI_PROGRESS_EVENT, event => handler(event.payload));
}

export function formatBytes(bytes = 0) {
  const value = Number(bytes) || 0;
  if (value >= 1e9) return `${(value / 1e9).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go`;
  if (value >= 1e6) return `${Math.round(value / 1e6).toLocaleString('fr-FR')} Mo`;
  if (value >= 1e3) return `${Math.round(value / 1e3).toLocaleString('fr-FR')} Ko`;
  return `${value} o`;
}

export const PROGRESS_STAGE_LABELS = {
  runtime: 'Téléchargement du moteur llama.cpp',
  extract: 'Préparation du moteur',
  model: 'Téléchargement du modèle',
  done: 'Installation terminée',
  error: 'Installation interrompue',
};
