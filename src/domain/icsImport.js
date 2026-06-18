export function buildImportEventKey(event = {}, index = 0) {
  return event.externalId || event.uid || `${event.title || 'event'}:${event.date || index}`;
}

export function isValidIcsUrl(value = '') {
  try {
    const url = new URL(value);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function applyIcsImportOptions(importedEvents = [], options = {}) {
  const defaultCategory = options.defaultCategory || 'perso';
  const defaultReminder = Boolean(options.defaultReminder);
  const overridesById = options.overridesById || {};

  return importedEvents.map((event, index) => {
    const key = buildImportEventKey(event, index);
    const override = overridesById[key] || {};
    const category = override.category || defaultCategory;
    const reminder = typeof override.reminder === 'boolean' ? override.reminder : defaultReminder;

    return {
      ...event,
      category,
      reminder,
      importKey: key,
      importSourceLabel: options.sourceLabel || event.importSourceLabel || '',
    };
  });
}
