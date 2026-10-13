/**
 * @caltemp
 * id: com.caltemp.examples.countdown
 * name: Compte à rebours
 * version: 1.0.0
 * description: Jours restants avant vos échéances (examens, rendus…) et alerte au démarrage quand l’une approche.
 * author: Caltemp
 * license: MIT
 * repository: https://github.com/darkiifr/Caltemp
 * permissions: calendar:read, notifications:send
 * settings: [{"key":"keywords","label":"Mots-clés ou catégories suivis","default":"examen, partiel, devoir, rendu","description":"Séparés par des virgules ; cherchés dans le titre et la catégorie."},{"key":"horizonDays","type":"number","label":"Regarder jusqu’à (jours)","default":60,"min":7,"max":365},{"key":"warnDays","type":"number","label":"Alerter à partir de J-","default":3,"min":0,"max":30}]
 */

const DAY = 24 * 60 * 60 * 1000;

const keywords = (ctx) => String(ctx.config.get('keywords') || '')
  .split(',')
  .map((word) => word.trim().toLocaleLowerCase('fr-FR'))
  .filter(Boolean);

function matches(event, words) {
  const haystack = `${event.title} ${event.category || ''}`.toLocaleLowerCase('fr-FR');
  return words.some((word) => haystack.includes(word));
}

function daysUntil(iso, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(iso);
  const day = new Date(target.getFullYear(), target.getMonth(), target.getDate());
  return Math.round((day - start) / DAY);
}

const label = (days) => (days === 0 ? 'Aujourd’hui' : days === 1 ? 'Demain' : `J-${days}`);

async function upcoming(ctx) {
  const now = new Date();
  const occurrences = await ctx.calendar.occurrences({
    from: now.toISOString(),
    to: new Date(now.getTime() + Number(ctx.config.get('horizonDays')) * DAY).toISOString(),
  });
  const words = keywords(ctx);
  return occurrences
    .filter((event) => matches(event, words))
    .map((event) => ({ ...event, days: daysUntil(event.date, now) }));
}

export function activate(ctx) {
  ctx.commands.register({
    id: 'open',
    label: 'Compte à rebours des échéances',
    run: async () => {
      const items = await upcoming(ctx);
      const warnDays = Number(ctx.config.get('warnDays'));
      await ctx.ui.showPanel({
        title: 'Compte à rebours',
        description: `Suivi : ${keywords(ctx).join(', ') || 'aucun mot-clé'}`,
        blocks: items.length
          ? [
            {
              type: 'stats',
              items: [
                { label: 'À venir', value: items.length },
                { label: 'Prochaine', value: label(items[0].days) },
                { label: 'Cette semaine', value: items.filter((item) => item.days < 7).length },
              ],
            },
            {
              type: 'list',
              items: items.map((item) => ({
                title: item.title,
                subtitle: new Date(item.date).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
                meta: label(item.days),
                color: item.days <= warnDays ? '#ef4444' : item.color,
              })),
            },
          ]
          : [{ type: 'text', text: 'Aucune échéance suivie dans la période. Ajustez les mots-clés dans les réglages du plugin.' }],
      });
    },
  });

  // One reminder per day for deadlines inside the warning window.
  ctx.on('app:ready', async () => {
    const today = new Date().toISOString().slice(0, 10);
    if ((await ctx.storage.get('warnedOn')) === today) return;
    const soon = (await upcoming(ctx)).filter((item) => item.days <= Number(ctx.config.get('warnDays')));
    if (soon.length > 0) {
      const first = soon[0];
      await ctx.notify(
        soon.length > 1 ? `${soon.length} échéances approchent` : 'Échéance proche',
        `${first.title} · ${label(first.days)}`,
        'warning',
      );
    }
    await ctx.storage.set('warnedOn', today);
  });
}
