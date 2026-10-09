// Geometry and data helpers for the reminders map. Pure functions only, so the
// map component stays a thin, fast rendering layer.

export const TILE_SIZE = 256;
export const MIN_ZOOM = 2;
export const MAX_ZOOM = 18;
const MAX_VISIBLE_TILES = 400;
const MAX_LAT = 85.05112878;

export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/** Longitude/latitude -> normalised Web Mercator coordinates in [0, 1]. */
export function project(lat, lng) {
  const safeLat = clamp(lat, -MAX_LAT, MAX_LAT);
  const sin = Math.sin((safeLat * Math.PI) / 180);
  return {
    x: (lng + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

export function unproject(x, y) {
  const n = Math.PI - 2 * Math.PI * y;
  return {
    lat: (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))),
    lng: wrapLng(x * 360 - 180),
  };
}

export function wrapLng(lng) {
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function worldSize(zoom) {
  return TILE_SIZE * 2 ** zoom;
}

/**
 * Tiles covering a viewport of `width`x`height` pixels centred on the
 * normalised point (`cx`, `cy`) at integer zoom `z`, nearest-to-centre first so
 * the middle of the screen fills in before the edges.
 */
export function getVisibleTiles({ cx, cy, z, width, height, scale = 1, buffer = 1 }) {
  const size = worldSize(z);
  const centerX = cx * size;
  const centerY = cy * size;
  const halfW = width / 2 / scale;
  const halfH = height / 2 / scale;
  if (halfW * halfH > MAX_VISIBLE_TILES * TILE_SIZE * TILE_SIZE) {
    // Safety net: never ask for more tiles than a screen can need.
    const empty = [];
    empty.rangeKey = `${z}:empty`;
    return empty;
  }
  const minX = Math.floor((centerX - halfW) / TILE_SIZE) - buffer;
  const maxX = Math.floor((centerX + halfW) / TILE_SIZE) + buffer;
  const minY = Math.max(0, Math.floor((centerY - halfH) / TILE_SIZE) - buffer);
  const maxY = Math.min(2 ** z - 1, Math.floor((centerY + halfH) / TILE_SIZE) + buffer);
  const count = 2 ** z;
  const midX = centerX / TILE_SIZE;
  const midY = centerY / TILE_SIZE;
  const tiles = [];
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      tiles.push({
        key: `${z}/${x}/${y}`,
        z,
        x,
        y,
        // Horizontal wrap for the tile URL; the position stays unwrapped.
        wrappedX: ((x % count) + count) % count,
        distance: (x + 0.5 - midX) ** 2 + (y + 0.5 - midY) ** 2,
      });
    }
  }
  tiles.sort((a, b) => a.distance - b.distance);
  // Identifies the covered range: the tile list only needs rebuilding when it changes.
  tiles.rangeKey = `${z}:${minX}:${maxX}:${minY}:${maxY}`;
  return tiles;
}

/** Viewport (centre + zoom) that fits `points` ({x, y} normalised) with padding. */
export function fitBounds(points, { width, height, padding = 48, maxZoom = 15 } = {}) {
  if (!points.length || !width || !height) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const usableW = Math.max(1, width - padding * 2);
  const usableH = Math.max(1, height - padding * 2);
  const zoom = Math.log2(Math.min(usableW / (spanX * TILE_SIZE), usableH / (spanY * TILE_SIZE)));
  return {
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
    zoom: clamp(Number.isFinite(zoom) ? zoom : maxZoom, MIN_ZOOM, maxZoom),
  };
}

/**
 * Grid clustering in screen space, O(n). Points closer than `radius` pixels at
 * `zoom` share a cell; each cluster is placed at its members' centroid.
 */
export function clusterPoints(points, zoom, radius = 56) {
  const size = worldSize(zoom);
  const cells = new Map();
  for (const point of points) {
    const key = `${Math.floor((point.x * size) / radius)}:${Math.floor((point.y * size) / radius)}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { key, items: [], sumX: 0, sumY: 0 };
      cells.set(key, cell);
    }
    cell.items.push(point);
    cell.sumX += point.x;
    cell.sumY += point.y;
  }
  return Array.from(cells.values(), cell => ({
    key: cell.key,
    x: cell.sumX / cell.items.length,
    y: cell.sumY / cell.items.length,
    items: cell.items,
  }));
}

const COORDINATE_PATTERNS = [
  // geo:48.85,2.35 (RFC 5870), Google/Apple/OSM links (@lat,lng / q=lat,lng / mlat=..&mlon=..)
  /geo:\s*(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)/i,
  /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/,
  /[?&](?:q|ll|query|center)=(-?\d{1,2}\.\d+)(?:,|%2C)\s*(-?\d{1,3}\.\d+)/i,
  /mlat=(-?\d{1,2}\.\d+)&mlon=(-?\d{1,3}\.\d+)/i,
  // Plain "48.8566, 2.3522" (decimals required, to avoid matching street numbers)
  /^\s*(-?\d{1,2}\.\d{2,})\s*[,;\s]\s*(-?\d{1,3}\.\d{2,})\s*$/,
];

/** Coordinates written directly in a location string or map link, if any. */
export function parseCoordinates(text = '') {
  const value = String(text || '');
  if (!value) return null;
  for (const pattern of COORDINATE_PATTERNS) {
    const match = value.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      return { lat, lng, source: 'text' };
    }
  }
  return null;
}

/** Cache key for a free-text location (case/spacing/punctuation insensitive). */
export function normalizeLocationKey(text = '') {
  return String(text || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLocaleLowerCase('fr-FR')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Locations that cannot be placed on a map.
const VIRTUAL_LOCATION = /^(?:https?:\/\/|www\.)|\b(?:teams|zoom|meet|google meet|webex|skype|discord|visio|en ligne|online|distanciel|virtuel)\b/i;

export function isGeocodableLocation(text = '') {
  const value = String(text || '').trim();
  if (value.length < 3 || value.length > 200) return false;
  if (parseCoordinates(value)) return false;
  return !VIRTUAL_LOCATION.test(value);
}

/**
 * Resolves where an event happens: explicit geo (manual pin or ICS GEO), then
 * coordinates written in the location text, then the geocoding cache.
 */
export function resolveEventPosition(event, lookupGeocode) {
  if (event?.geo && Number.isFinite(event.geo.lat) && Number.isFinite(event.geo.lng)) return event.geo;
  const fromText = parseCoordinates(event?.location);
  if (fromText) return fromText;
  if (!event?.location || !lookupGeocode) return null;
  return lookupGeocode(event.location) || null;
}

export function haversineKm(a, b) {
  const toRad = deg => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(h)));
}
