import React, { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Bell, CalendarPlus, Check, Clock3, Link as LinkIcon, RefreshCw, X } from 'lucide-react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import CustomSelect from './CustomSelect';
import { isValidIcsUrl } from '../domain/icsImport';

gsap.registerPlugin(useGSAP);

const DEFAULT_REFRESH_MINUTES = 15;

export function deriveIcsAssistantState({ label = '', url = '' } = {}) {
  const normalizedUrl = url.trim();
  const trimmedLabel = label.trim();

  if (!normalizedUrl) {
    return {
      canAdd: false,
      error: '',
      normalizedUrl,
      suggestedLabel: '',
      finalLabel: trimmedLabel,
    };
  }

  if (!isValidIcsUrl(normalizedUrl)) {
    return {
      canAdd: false,
      error: 'Seules les URL ICS en HTTPS sont acceptées.',
      normalizedUrl,
      suggestedLabel: '',
      finalLabel: trimmedLabel,
    };
  }

  const parsed = new URL(normalizedUrl);
  const suggestedLabel = parsed.hostname.replace(/^www\./, '');
  const finalLabel = trimmedLabel || suggestedLabel;

  return {
    canAdd: Boolean(finalLabel),
    error: '',
    normalizedUrl,
    suggestedLabel,
    finalLabel,
  };
}

export default function IcsAssistantPanel({
  categoryOptions = [],
  onAddAndSyncSource,
  onAddSource,
  onSyncSource,
  disabled = false,
}) {
  const containerRef = useRef(null);
  const shouldReduceMotion = useReducedMotion();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState({
    label: '',
    url: '',
    defaultCategory: categoryOptions[0]?.value || 'perso',
    defaultReminder: false,
    refreshMinutes: DEFAULT_REFRESH_MINUTES,
  });
  const [status, setStatus] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const derived = useMemo(() => deriveIcsAssistantState(draft), [draft]);

  useGSAP(() => {
    if (shouldReduceMotion || !isOpen) return;
    gsap.from('.ics-modal-step', {
      opacity: 0,
      y: 8,
      duration: 0.28,
      stagger: 0.04,
      ease: 'power2.out',
    });
  }, { scope: containerRef, dependencies: [isOpen, shouldReduceMotion] });

  const updateDraft = (changes) => {
    setStatus('');
    setDraft(prev => ({ ...prev, ...changes }));
  };

  const handleAdd = async () => {
    if (!derived.canAdd || disabled || isSubmitting) return;
    setIsSubmitting(true);
    setStatus('Ajout de la source et actualisation en cours...');
    const source = {
      id: `custom-${Date.now()}`,
      label: derived.finalLabel,
      type: 'url',
      url: derived.normalizedUrl,
      enabled: true,
      defaultCategory: draft.defaultCategory,
      defaultReminder: Boolean(draft.defaultReminder),
      refreshMinutes: Number(draft.refreshMinutes) || DEFAULT_REFRESH_MINUTES,
    };
    try {
      const syncResult = onAddAndSyncSource
        ? await onAddAndSyncSource(source)
        : await (async () => {
          const createdId = await onAddSource?.(source);
          const sourceWithId = { ...source, id: createdId || source.id };
          return onSyncSource?.(sourceWithId.id, sourceWithId);
        })();
      if (syncResult?.duplicate) {
        setStatus(`Cette URL existe déjà dans « ${syncResult.source?.label || 'Sources ICS'} ».`);
        return;
      }
      if (syncResult?.error) {
        throw syncResult.error;
      }
      setStatus(syncResult?.source?.lastSyncMessage
        ? `Source ajoutée. ${syncResult.source.lastSyncMessage}.`
        : 'Source ajoutée et actualisation lancée.');
      setDraft(prev => ({
        ...prev,
        label: '',
        url: '',
      }));
    } catch (error) {
      setStatus(`Impossible d’actualiser cette URL : ${error.message || error}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section ref={containerRef} className="flex justify-center">
      <motion.button
        type="button"
        onClick={() => setIsOpen(true)}
        disabled={disabled}
        className="group flex w-full max-w-lg items-center justify-between gap-5 rounded-lg border border-white/10 bg-[#191b1d] px-5 py-4 text-left transition-colors hover:border-white/20 hover:bg-[#202326] disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Ajouter une URL de calendrier"
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 text-white/80">
            <CalendarPlus size={18} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-white">Ajouter une URL de calendrier</span>
            <span className="mt-0.5 block text-xs leading-5 text-white/50">
              Source ICS synchronisée automatiquement.
            </span>
          </span>
        </span>
        <span className="hidden shrink-0 rounded-md border border-white/10 px-2.5 py-1.5 text-xs font-medium text-white/65 group-hover:text-white sm:inline-flex">
          Ouvrir
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
            initial={shouldReduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={shouldReduceMotion ? undefined : { opacity: 0 }}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setIsOpen(false);
            }}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Ajouter une URL de calendrier"
              className="relative max-h-[92vh] w-full max-w-4xl overflow-hidden rounded-lg border border-white/12 bg-[#17191b] shadow-2xl shadow-black/45"
              initial={shouldReduceMotion ? false : { opacity: 0, y: 14, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, y: 10, scale: 0.99 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
            >
              <div className="flex items-start justify-between gap-6 border-b border-white/10 px-8 py-6">
                <div className="flex min-w-0 items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-white/10 bg-black/20 text-white/80">
                    <CalendarPlus size={20} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-white">Ajouter une URL de calendrier</h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                      Collez une URL ICS, choisissez les réglages, puis lancez la première synchronisation.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md p-2 text-white/50 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="Fermer"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="max-h-[calc(92vh-106px)] overflow-y-auto p-8 custom-scrollbar">
                <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
                  <div className="ics-modal-step min-w-0 space-y-6">
                    <fieldset className="space-y-5 rounded-lg border border-white/10 bg-black/15 p-5">
                      <legend className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                        <LinkIcon size={14} />
                        Adresse
                      </legend>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/70">URL du calendrier</span>
                        <div className="flex items-center gap-3 rounded-md border border-white/12 bg-black/25 px-4 py-3 focus-within:border-white/35">
                          <LinkIcon size={15} className="shrink-0 text-white/35" />
                          <input
                            value={draft.url}
                            onChange={(event) => updateDraft({ url: event.target.value })}
                            placeholder="https://.../calendrier.ics"
                            aria-label="URL du calendrier"
                            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder-white/25"
                          />
                        </div>
                      </label>

                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/70">Nom affiché</span>
                        <input
                          value={draft.label}
                          onChange={(event) => updateDraft({ label: event.target.value })}
                          placeholder={derived.suggestedLabel || 'Coupe du Monde 2026'}
                          aria-label="Nom affiché"
                          className="w-full rounded-md border border-white/12 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder-white/25 focus:border-white/35"
                        />
                      </label>
                    </fieldset>

                    <AnimatePresence mode="popLayout">
                      {(derived.error || status || derived.canAdd) && (
                        <motion.div
                          key={derived.error || status || derived.normalizedUrl}
                          layout
                          initial={shouldReduceMotion ? false : { opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={shouldReduceMotion ? undefined : { opacity: 0, y: -6 }}
                          className={`rounded-md border px-4 py-3 text-xs ${
                            derived.error || status.startsWith('Impossible')
                              ? 'border-red-300/20 bg-red-500/10 text-red-200'
                              : status
                                ? 'border-emerald-300/20 bg-emerald-500/10 text-emerald-100'
                                : 'border-white/12 bg-white/[0.06] text-white/70'
                          }`}
                        >
                          {derived.error || status || `Prêt à ajouter ${derived.finalLabel}.`}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="ics-modal-step grid gap-6">
                    <fieldset className="space-y-5 rounded-lg border border-white/10 bg-black/15 p-5">
                      <legend className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white/55">
                        <Clock3 size={14} />
                        Réglages
                      </legend>
                      <label className="block space-y-2">
                        <span className="text-xs font-medium text-white/70">Catégorie</span>
                        <CustomSelect
                          value={draft.defaultCategory}
                          onChange={(value) => updateDraft({ defaultCategory: value })}
                          options={categoryOptions}
                          ariaLabel="Catégorie par défaut"
                        />
                      </label>

                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs font-medium text-white/70">
                          <Clock3 size={13} />
                          Fréquence
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                          {[5, 15, 60].map((minutes) => {
                            const active = Number(draft.refreshMinutes) === minutes;
                            return (
                              <button
                                key={minutes}
                                type="button"
                                onClick={() => updateDraft({ refreshMinutes: minutes })}
                                className={`rounded-md border px-4 py-3 text-sm font-semibold transition-colors ${
                                  active
                                    ? 'border-white/35 bg-white/15 text-white'
                                    : 'border-white/10 bg-black/20 text-white/55 hover:bg-white/[0.08] hover:text-white'
                                }`}
                                aria-pressed={active}
                              >
                                {minutes} min
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => updateDraft({ defaultReminder: !draft.defaultReminder })}
                        disabled={isSubmitting}
                        className={`flex items-center justify-between gap-4 rounded-md border px-4 py-3 text-left transition-colors ${
                          draft.defaultReminder
                            ? 'border-emerald-300/35 bg-emerald-400/10 text-emerald-50'
                            : 'border-white/10 bg-black/20 text-white/65 hover:bg-white/[0.08] hover:text-white'
                        }`}
                        aria-pressed={draft.defaultReminder}
                      >
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <Bell size={15} />
                          Alertes automatiques
                        </span>
                        <span className={`h-5 w-9 rounded-full p-0.5 transition-colors ${draft.defaultReminder ? 'bg-emerald-300/80' : 'bg-white/15'}`}>
                          <span className={`block h-4 w-4 rounded-full bg-white transition-transform ${draft.defaultReminder ? 'translate-x-4' : ''}`} />
                        </span>
                      </button>
                    </fieldset>

                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={!derived.canAdd || disabled || isSubmitting}
                      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-semibold text-neutral-950 transition-colors hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/10 disabled:text-white/35"
                    >
                      {isSubmitting ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : status && status.startsWith('Source ajoutée') ? (
                        <Check size={16} />
                      ) : (
                        <CalendarPlus size={16} />
                      )}
                      {isSubmitting ? 'Actualisation...' : 'Ajouter et actualiser'}
                      {!isSubmitting && !status && <RefreshCw size={14} className="opacity-70" />}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
