// Settings of Dexter's local model (settings.localAi).
export const DEFAULT_LOCAL_AI_MODEL_ID = 'qwen2.5-1.5b-instruct';

export const DEFAULT_LOCAL_AI_SETTINGS = Object.freeze({
  modelId: DEFAULT_LOCAL_AI_MODEL_ID,
  gpu: false,
  // 0 = automatic (half the cores, at most 4).
  threads: 0,
  ctxSize: 4096,
  idleTimeoutMinutes: 5,
  offerDismissed: false,
});

export const LOCAL_AI_IDLE_TIMEOUT_CHOICES = [1, 2, 5, 10, 30];
export const LOCAL_AI_CTX_CHOICES = [2048, 4096, 8192];

export function normalizeLocalAiSettings(value = {}) {
  const merged = { ...DEFAULT_LOCAL_AI_SETTINGS, ...(value || {}) };
  const threads = Math.round(Number(merged.threads) || 0);
  return {
    modelId: typeof merged.modelId === 'string' && merged.modelId ? merged.modelId : DEFAULT_LOCAL_AI_MODEL_ID,
    gpu: Boolean(merged.gpu),
    threads: Math.min(32, Math.max(0, threads)),
    ctxSize: LOCAL_AI_CTX_CHOICES.includes(Number(merged.ctxSize)) ? Number(merged.ctxSize) : DEFAULT_LOCAL_AI_SETTINGS.ctxSize,
    idleTimeoutMinutes: LOCAL_AI_IDLE_TIMEOUT_CHOICES.includes(Number(merged.idleTimeoutMinutes))
      ? Number(merged.idleTimeoutMinutes)
      : DEFAULT_LOCAL_AI_SETTINGS.idleTimeoutMinutes,
    offerDismissed: Boolean(merged.offerDismissed),
  };
}
