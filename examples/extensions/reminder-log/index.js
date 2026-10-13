/**
 * @caltemp
 * id: com.caltemp.examples.reminder-log
 * name: Journal des rappels
 * version: 1.0.0
 * description: Garde l’historique des rappels déclenchés, pour retrouver ceux manqués.
 * author: Caltemp
 * license: MIT
 * repository: https://github.com/darkiifr/Caltemp
 * permissions: calendar:read
 * settings: [{"key":"limit","type":"number","label":"Nombre de rappels conservés","default":50,"min":10,"max":500}]
 */

const formatDate = (iso) => new Date(iso).toLocaleString('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function activate(ctx) {
  let panel = null;

  const load = async () => (await ctx.storage.get('log')) || [];

  const view = async () => {
    const log = await load();
    return {
      title: 'Journal des rappels',
      description: log.length ? `${log.length} rappel${log.length > 1 ? 's' : ''} enregistré${log.length > 1 ? 's' : ''}` : 'Aucun rappel pour l’instant.',
      blocks: [
        log.length
          ? {
            type: 'list',
            items: log.map((entry) => ({
              title: entry.title,
              subtitle: `Prévu ${formatDate(entry.occurrence)}`,
              meta: `${entry.phase === 'final' ? 'Maintenant' : 'Bientôt'} · ${formatDate(entry.at)}`,
              color: entry.color,
            })),
          }
          : { type: 'text', text: 'Les rappels apparaîtront ici dès qu’ils se déclencheront.' },
        log.length > 0 && {
          type: 'actions',
          items: [{
            label: 'Vider le journal',
            variant: 'danger',
            onClick: async () => {
              await ctx.storage.set('log', []);
              await render();
            },
          }],
        },
      ].filter(Boolean),
    };
  };

  async function render() {
    if (!panel) return;
    try {
      await panel.update(await view());
    } catch {
      panel = null;
    }
  }

  ctx.on('reminder:triggered', async ({ event, occurrence, phase }) => {
    const log = await load();
    log.unshift({
      title: event.title,
      color: event.color,
      occurrence,
      phase,
      at: new Date().toISOString(),
    });
    await ctx.storage.set('log', log.slice(0, Number(ctx.config.get('limit'))));
    await render();
  });

  ctx.commands.register({
    id: 'open',
    label: 'Journal des rappels',
    run: async () => {
      panel = await ctx.ui.showPanel(await view());
    },
  });
}
