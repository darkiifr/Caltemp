export function buildImportEventKey(event = {}, index = 0) {
  return event.externalId || event.uid || `${event.title || 'event'}:${event.date || index}`;
}

function isPrivateIpv4(hostname) {
  const parts = hostname.split('.').map(part => Number(part));
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  return a === 10
    || a === 127
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 169 && b === 254)
    || a === 0;
}

function isBlockedHost(hostname = '') {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost'
    || host.endsWith('.localhost')
    || host === '::1'
    || host.startsWith('fc')
    || host.startsWith('fd')
    || host.startsWith('fe80')
    || isPrivateIpv4(host);
}

export function validateIcsUrl(value = '') {
  const raw = String(value || '').trim();
  if (!raw) {
    return { ok: false, normalizedUrl: '', reason: 'URL manquante.' };
  }

  try {
    const url = new URL(raw);
    url.hash = '';

    if (url.protocol !== 'https:') {
      return { ok: false, normalizedUrl: raw, reason: 'Seules les URL HTTPS sont acceptées.' };
    }

    if (url.username || url.password) {
      return { ok: false, normalizedUrl: raw, reason: 'Les identifiants dans l’URL ne sont pas acceptés.' };
    }

    if (isBlockedHost(url.hostname)) {
      return { ok: false, normalizedUrl: raw, reason: 'Cette adresse locale ou privée n’est pas acceptée.' };
    }

    return {
      ok: true,
      normalizedUrl: url.toString(),
      hostname: url.hostname.toLowerCase(),
    };
  } catch {
    return { ok: false, normalizedUrl: raw, reason: 'URL invalide.' };
  }
}

export function isValidIcsUrl(value = '') {
  return validateIcsUrl(value).ok;
}

export function getIcsUrlFingerprint(value = '') {
  const validation = validateIcsUrl(value);
  if (!validation.ok) return '';
  const url = new URL(validation.normalizedUrl);
  url.protocol = url.protocol.toLowerCase();
  url.hostname = url.hostname.toLowerCase();
  if (url.port === '443') url.port = '';
  url.hash = '';
  return url.toString();
}

import { inferCategory } from './events';

export function applyIcsImportOptions(importedEvents = [], options = {}) {
  const hasDefaultCategory = typeof options.defaultCategory === 'string' && options.defaultCategory.trim();
  const defaultCategory = hasDefaultCategory ? options.defaultCategory.trim() : '';
  const defaultReminder = Boolean(options.defaultReminder);
  const overridesById = options.overridesById || {};
  const sourceId = options.sourceId || '';

  return importedEvents.map((event, index) => {
    const key = buildImportEventKey(event, index);
    const override = overridesById[key] || {};
    const inferredCategory = inferCategory([
      options.sourceLabel,
      event.title,
      event.description,
      event.location,
    ].filter(Boolean).join(' '), 'perso');
    const category = override.category
      || (options.preferInferredCategory && inferredCategory !== 'perso' ? inferredCategory : defaultCategory)
      || inferredCategory;
    const reminder = typeof override.reminder === 'boolean' ? override.reminder : defaultReminder;
    const importKey = sourceId ? `${sourceId}:${event.externalId || key}` : key;

    return {
      ...event,
      source: sourceId ? 'ics-url' : event.source || 'ics',
      importSourceId: sourceId || event.importSourceId || null,
      category,
      reminder,
      importKey,
      importSourceLabel: options.sourceLabel || event.importSourceLabel || '',
    };
  });
}
