/**
 * @caltemp
 * id: com.caltemp.examples.weather
 * name: Météo
 * version: 1.0.0
 * description: Météo actuelle et prévisions sur 3 jours (Open-Meteo, sans compte), avec alerte pluie au démarrage.
 * author: Caltemp
 * license: MIT
 * repository: https://github.com/darkiifr/Caltemp
 * permissions: network, notifications:send
 * hosts: api.open-meteo.com, geocoding-api.open-meteo.com
 * settings: [{"key":"city","label":"Ville","default":"Paris","description":"Seul ce nom est envoyé à Open-Meteo."},{"key":"rainAlert","type":"boolean","label":"Prévenir au démarrage s’il va pleuvoir","default":true},{"key":"rainThreshold","type":"number","label":"Seuil d’alerte pluie (%)","default":60,"min":10,"max":100}]
 */

const CACHE_MS = 30 * 60 * 1000;

// WMO weather codes used by Open-Meteo.
const CONDITIONS = [
  [0, 'Ciel dégagé'],
  [1, 'Plutôt dégagé'],
  [2, 'Partiellement nuageux'],
  [3, 'Couvert'],
  [48, 'Brouillard'],
  [57, 'Bruine'],
  [67, 'Pluie'],
  [77, 'Neige'],
  [82, 'Averses'],
  [86, 'Averses de neige'],
  [99, 'Orage'],
];

const describe = (code) => (CONDITIONS.find(([max]) => code <= max) || CONDITIONS.at(-1))[1];

async function getJson(ctx, url) {
  const response = await ctx.http.fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo a répondu ${response.status}.`);
  return response.json();
}

async function loadForecast(ctx, { force = false } = {}) {
  const city = String(ctx.config.get('city') || '').trim();
  if (!city) throw new Error('Indiquez une ville dans les réglages du plugin.');

  const cached = await ctx.storage.get('forecast');
  if (!force && cached && cached.city === city && Date.now() - cached.at < CACHE_MS) return cached;

  const geo = await getJson(ctx, `https://geocoding-api.open-meteo.com/v1/search?count=1&language=fr&format=json&name=${encodeURIComponent(city)}`);
  const place = geo.results?.[0];
  if (!place) throw new Error(`Ville introuvable : ${city}`);

  const data = await getJson(ctx, 'https://api.open-meteo.com/v1/forecast'
    + `?latitude=${place.latitude}&longitude=${place.longitude}&timezone=auto&forecast_days=3`
    + '&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m'
    + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max');

  const forecast = {
    city,
    at: Date.now(),
    place: [place.name, place.admin1, place.country].filter(Boolean).join(', '),
    current: data.current,
    days: data.daily.time.map((date, index) => ({
      date,
      code: data.daily.weather_code[index],
      max: data.daily.temperature_2m_max[index],
      min: data.daily.temperature_2m_min[index],
      rain: data.daily.precipitation_probability_max[index] ?? 0,
    })),
  };
  await ctx.storage.set('forecast', forecast);
  return forecast;
}

function view(forecast, refresh) {
  const { current } = forecast;
  return {
    title: `Météo · ${forecast.place}`,
    description: `${describe(current.weather_code)} · mis à jour à ${new Date(forecast.at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`,
    blocks: [
      {
        type: 'stats',
        items: [
          { label: 'Température', value: `${Math.round(current.temperature_2m)} °C` },
          { label: 'Ressenti', value: `${Math.round(current.apparent_temperature)} °C` },
          { label: 'Vent', value: `${Math.round(current.wind_speed_10m)} km/h` },
        ],
      },
      { type: 'heading', text: 'Prochains jours' },
      {
        type: 'list',
        items: forecast.days.map((day) => ({
          title: new Date(`${day.date}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'short' }),
          subtitle: `${describe(day.code)} · pluie ${day.rain} %`,
          meta: `${Math.round(day.min)}° / ${Math.round(day.max)}°`,
          color: day.rain >= 60 ? '#60a5fa' : '#fbbf24',
        })),
      },
      { type: 'actions', items: [{ label: 'Actualiser', onClick: refresh }] },
      { type: 'text', text: 'Données : Open-Meteo.com (CC BY 4.0).' },
    ],
  };
}

export function activate(ctx) {
  let panel = null;

  const refresh = async () => {
    const forecast = await loadForecast(ctx, { force: true });
    await panel?.update(view(forecast, refresh)).catch(() => {
      panel = null;
    });
  };

  ctx.commands.register({
    id: 'open',
    label: 'Météo du jour',
    run: async () => {
      panel = await ctx.ui.showPanel(view(await loadForecast(ctx), refresh));
    },
  });

  // Once per day at most, warn about rain when Caltemp starts.
  ctx.on('app:ready', async () => {
    if (!ctx.config.get('rainAlert')) return;
    const today = new Date().toISOString().slice(0, 10);
    if ((await ctx.storage.get('alertedOn')) === today) return;
    try {
      const day = (await loadForecast(ctx)).days[0];
      if (day && day.rain >= Number(ctx.config.get('rainThreshold'))) {
        await ctx.notify('Pluie prévue aujourd’hui', `${day.rain} % de risque · ${Math.round(day.min)}° / ${Math.round(day.max)}°`, 'warning');
      }
      await ctx.storage.set('alertedOn', today);
    } catch (error) {
      ctx.logger.warn('Météo indisponible :', error.message);
    }
  });

  // A new city invalidates the cache on the next request.
  ctx.config.onChange(() => panel && refresh().catch((error) => ctx.ui.toast(error.message, 'error')));
}
