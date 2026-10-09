import { describe, expect, it, vi } from 'vitest';
import { createGeocoder } from './geocoding';

function setup(answer = [{ lat: '50.63', lon: '3.06', display_name: 'Lille' }]) {
  let clock = 0;
  const waits = [];
  const fetcher = vi.fn(async () => ({ ok: true, json: async () => answer }));
  const saved = [];
  const geocoder = createGeocoder({
    fetcher,
    now: () => clock,
    wait: async (ms) => { waits.push(ms); clock += ms; },
    storage: { load: async () => ({ entries: { 'cached place': { lat: 1, lng: 2, at: 0 } } }), save: async (_name, value) => { saved.push(value); } },
  });
  return { geocoder, fetcher, waits, saved, tick: ms => { clock += ms; } };
}

describe('geocoder', () => {
  it('shares identical lookups and throttles to one request per second', async () => {
    const { geocoder, fetcher, waits } = setup();
    const [a, b] = await Promise.all([geocoder.geocode('Zénith de Lille'), geocoder.geocode('zenith de  lille')]);
    expect(a).toMatchObject({ lat: 50.63, lng: 3.06, source: 'geocoded' });
    expect(b).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toContain('nominatim.openstreetmap.org/search?q=Z%C3%A9nith+de+Lille');
    expect(options.headers['User-Agent']).toMatch(/^Caltemp/);

    await geocoder.geocode('Gare de Lyon');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(waits.at(-1)).toBeGreaterThanOrEqual(1000);
  });

  it('uses the persisted cache, caches misses and skips virtual places', async () => {
    const { geocoder, fetcher } = setup([]);
    await geocoder.load();
    expect(geocoder.peek('Cached place')).toMatchObject({ lat: 1, lng: 2 });
    expect(await geocoder.geocode('Nulle part du tout')).toBeNull();
    expect(geocoder.peek('Nulle part du tout')).toBeNull();
    expect(await geocoder.geocode('Nulle part du tout')).toBeNull();
    expect(await geocoder.geocode('Google Meet')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('does not cache network errors', async () => {
    const { geocoder, fetcher } = setup();
    fetcher.mockRejectedValueOnce(new Error('offline'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await geocoder.geocode('Lille')).toBeNull();
    expect(geocoder.peek('Lille')).toBeUndefined();
    expect(await geocoder.geocode('Lille')).toMatchObject({ lat: 50.63 });
  });
});
