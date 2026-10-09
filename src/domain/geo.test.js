import { describe, expect, it } from 'vitest';
import {
  clusterPoints, fitBounds, getVisibleTiles, isGeocodableLocation, normalizeLocationKey, parseCoordinates, project, unproject,
} from './geo';

describe('map geometry', () => {
  it('projects to Web Mercator and back', () => {
    const paris = project(48.8566, 2.3522);
    expect(Math.floor(paris.x * 2 ** 10)).toBe(518); // tile x of Paris at z10
    expect(Math.floor(paris.y * 2 ** 10)).toBe(352);
    const back = unproject(paris.x, paris.y);
    expect(back.lat).toBeCloseTo(48.8566, 6);
    expect(back.lng).toBeCloseTo(2.3522, 6);
  });

  it('lists visible tiles centre first, wrapped horizontally and clamped vertically', () => {
    const tiles = getVisibleTiles({ cx: 0.001, cy: 0.5, z: 2, width: 512, height: 512, buffer: 0 });
    expect(tiles[0]).toMatchObject({ x: 0, wrappedX: 0 });
    expect(tiles.some(tile => tile.x === -1 && tile.wrappedX === 3)).toBe(true);
    expect(tiles.every(tile => tile.y >= 0 && tile.y <= 3)).toBe(true);
    expect(tiles.rangeKey).toMatch(/^2:/);
  });

  it('fits bounds and clusters nearby points', () => {
    const points = [project(48.85, 2.35), project(48.86, 2.34), project(43.3, 5.4)];
    const view = fitBounds(points, { width: 800, height: 600 });
    expect(view.zoom).toBeGreaterThan(4);
    expect(view.zoom).toBeLessThan(8);
    expect(clusterPoints(points, 5).length).toBe(2);
    expect(clusterPoints(points, 16).length).toBe(3);
  });
});

describe('location parsing', () => {
  it('reads coordinates from text and map links', () => {
    expect(parseCoordinates('48.8566, 2.3522')).toMatchObject({ lat: 48.8566, lng: 2.3522 });
    expect(parseCoordinates('geo:45.75,4.85')).toMatchObject({ lat: 45.75, lng: 4.85 });
    expect(parseCoordinates('https://www.google.com/maps/@45.7640,4.8357,14z')).toMatchObject({ lat: 45.764, lng: 4.8357 });
    expect(parseCoordinates('https://www.openstreetmap.org/?mlat=43.29&mlon=5.37')).toMatchObject({ lat: 43.29, lng: 5.37 });
    expect(parseCoordinates('12 rue de la Paix')).toBeNull();
    expect(parseCoordinates('95.00, 2.00')).toBeNull();
  });

  it('only geocodes physical places and normalises cache keys', () => {
    expect(isGeocodableLocation('Lycée Henri IV, Paris')).toBe(true);
    expect(isGeocodableLocation('Microsoft Teams')).toBe(false);
    expect(isGeocodableLocation('https://zoom.us/j/123')).toBe(false);
    expect(isGeocodableLocation('48.85, 2.35')).toBe(false);
    expect(normalizeLocationKey('  Zénith   de LILLE! ')).toBe('zenith de lille');
  });
});
