/**
 * @caltemp
 * id: com.caltemp.examples.week-summary
 * name: Résumé de la semaine
 * version: 2.0.0
 * description: Commande « Résumé de ma semaine » : statistiques, prochains événements et rappel du suivant.
 * author: Caltemp
 * license: MIT
 * repository: https://github.com/darkiifr/Caltemp
 * permissions: calendar:read, notifications:send
 * settings: [{"key":"days","type":"select","label":"Période","default":"7","options":[{"value":"3","label":"3 jours"},{"value":"7","label":"7 jours"},{"value":"14","label":"14 jours"}]},{"key":"showCategories","type":"boolean","label":"Afficher la répartition par catégorie","default":true}]
 */

const DAY = 24 * 60 * 60 * 1000;

function formatWhen(iso) {
  return new Date(iso).toLocaleString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

async function buildPanel(ctx, refresh) {
  const days = Number(ctx.config.get('days')) || 7;
  const now = new Date();
  const occurrences = await ctx.calendar.occurrences({
    from: now.toISOString(),
    to: new Date(now.getTime() + days * DAY).toISOString(),
  });
  const hours = occurrences.reduce((total, event) => total + (event.durationMinutes || 60), 0) / 60;

  const blocks = [
    {
      type: 'stats',
      items: [
        { label: 'Événements', value: occurrences.length },
        { label: 'Heures prévues', value: hours.toFixed(1) },
        { label: 'Ouvertures', value: (await ctx.storage.get('opened')) || 0 },
      ],
    },
  ];

  if (ctx.config.get('showCategories') && occurrences.length > 0) {
    const counts = new Map();
    for (const event of occurrences) counts.set(event.category, (counts.get(event.category) || 0) + 1);
    blocks.push({ type: 'heading', text: 'Par catégorie' });
    for (const [category, count] of counts) {
      blocks.push({ type: 'progress', label: `${category} · ${count}`, value: count / occurrences.length });
    }
  }

  blocks.push({ type: 'heading', text: 'À venir' });
  if (occurrences.length === 0) {
    blocks.push({ type: 'text', text: `Rien de prévu dans les ${days} prochains jours.` });
  } else {
    blocks.push({
      type: 'list',
      items: occurrences.slice(0, 20).map((event) => ({
        title: event.title,
        subtitle: formatWhen(event.date),
        meta: `${event.durationMinutes || 60} min`,
        color: event.color,
      })),
    });
  }

  const next = occurrences[0];
  blocks.push({
    type: 'actions',
    items: [
      next && {
        label: 'Me notifier du prochain',
        variant: 'primary',
        onClick: () => ctx.notify('Prochain événement', `${next.title} · ${formatWhen(next.date)}`),
      },
      { label: 'Actualiser', onClick: refresh },
    ].filter(Boolean),
  });

  return { title: 'Résumé de la semaine', description: `Les ${days} prochains jours`, blocks };
}

export function activate(ctx) {
  let panel = null;

  // Keeps the panel up to date while it is open; `update` fails once the
  // user has closed it.
  const refresh = async () => {
    if (!panel) return;
    try {
      await panel.update(await buildPanel(ctx, refresh));
    } catch {
      panel = null;
    }
  };

  ctx.commands.register({
    id: 'open',
    label: 'Résumé de ma semaine',
    run: async () => {
      await ctx.storage.set('opened', ((await ctx.storage.get('opened')) || 0) + 1);
      panel = await ctx.ui.showPanel(await buildPanel(ctx, refresh));
    },
  });

  // No cleanup needed: Caltemp removes the command, the subscriptions and the
  // panel when the plugin is disabled.
  ctx.on('calendar:event-created', refresh);
  ctx.on('calendar:event-updated', refresh);
  ctx.on('calendar:event-deleted', refresh);
  ctx.config.onChange(refresh);
}
