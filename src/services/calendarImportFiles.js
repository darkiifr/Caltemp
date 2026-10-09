import { open } from '@tauri-apps/plugin-dialog';
import { readFile } from '@tauri-apps/plugin-fs';
import { parseICS } from '../utils/ics';
import { isZipBuffer, readZipEntries } from '../utils/zip';
import {
  IMPORT_FILE_EXTENSIONS,
  detectIcsProvider,
  detectImportFormat,
  getIcsCalendarName,
  isSupportedImportFile,
  parseCalendarCsv,
} from '../domain/calendarImport';

/**
 * Decodes an exported file. Outlook (Windows) still writes CSV in
 * Windows-1252, so fall back to it when the bytes are not valid UTF-8.
 */
export function decodeImportText(bytes) {
  if (typeof bytes === 'string') return bytes;
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view[0] === 0xff && view[1] === 0xfe) return new TextDecoder('utf-16le').decode(view.subarray(2));
  if (view[0] === 0xfe && view[1] === 0xff) return new TextDecoder('utf-16be').decode(view.subarray(2));
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(view).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(view);
  }
}

export function getBaseName(path = '') {
  return String(path).split(/[\\/]/).pop() || String(path);
}

function stripExtension(name = '') {
  return name.replace(/\.[^.]+$/, '');
}

let calendarCounter = 0;

function buildCalendar({ fileName, format, provider, name, events = [], warnings = [], error = '' }) {
  calendarCounter += 1;
  return {
    id: `import-${Date.now().toString(36)}-${calendarCounter}`,
    fileName,
    format,
    provider,
    name: name || stripExtension(getBaseName(fileName)) || 'Agenda importé',
    events,
    warnings,
    error,
  };
}

/**
 * Turns one file (or pasted text) into one or more importable calendars.
 * A ZIP archive yields one calendar per supported file it contains.
 * @param {{ name: string, bytes?: Uint8Array, text?: string }} file
 */
export async function parseImportSource(file, { now } = {}) {
  const fileName = getBaseName(file.name || 'Texte collé');
  try {
    if (file.bytes && isZipBuffer(file.bytes)) {
      const entries = await readZipEntries(file.bytes, {
        filter: name => isSupportedImportFile(name) && !name.toLowerCase().endsWith('.zip'),
      });
      if (!entries.length) {
        return [buildCalendar({ fileName, format: 'zip', provider: 'other', error: 'Aucun agenda (.ics ou .csv) dans cette archive.' })];
      }
      const nested = await Promise.all(entries.map(entry => parseImportSource({ name: entry.name, bytes: entry.bytes }, { now })));
      return nested.flat().map(calendar => ({ ...calendar, fileName: `${fileName} › ${calendar.fileName}` }));
    }

    const text = file.text ?? decodeImportText(file.bytes || new Uint8Array());
    const format = detectImportFormat(fileName, text);

    if (format === 'ics') {
      const events = parseICS(text, now ? { now } : {});
      return [buildCalendar({
        fileName,
        format,
        provider: detectIcsProvider(text),
        name: getIcsCalendarName(text),
        events,
        error: events.length ? '' : 'Aucun événement trouvé dans ce fichier.',
      })];
    }

    if (format === 'csv') {
      const { events, provider, warnings } = parseCalendarCsv(text);
      return [buildCalendar({
        fileName,
        format,
        provider,
        events,
        warnings,
        error: events.length ? '' : (warnings[0] || 'Aucun événement trouvé dans ce fichier.'),
      })];
    }

    return [buildCalendar({ fileName, format: 'unknown', provider: 'other', error: 'Format non reconnu (attendu : .ics, .csv ou .zip).' })];
  } catch (error) {
    console.error('Calendar import failed:', fileName, error);
    return [buildCalendar({ fileName, format: 'unknown', provider: 'other', error: error?.message || String(error) })];
  }
}

export async function parseImportSources(files = [], options) {
  const calendars = await Promise.all(files.map(file => parseImportSource(file, options)));
  return calendars.flat();
}

/** Opens the native picker (several files at once) and reads the selection. */
export async function pickImportFiles() {
  const selected = await open({
    multiple: true,
    filters: [
      { name: 'Agendas (ICS, CSV, ZIP)', extensions: IMPORT_FILE_EXTENSIONS },
    ],
  });
  if (!selected) return [];
  const paths = Array.isArray(selected) ? selected : [selected];
  return Promise.all(paths.map(async path => ({ name: path, bytes: await readFile(path) })));
}

export function readImportPaths(paths = []) {
  return Promise.all(paths
    .filter(isSupportedImportFile)
    .map(async path => ({ name: path, bytes: await readFile(path) })));
}
