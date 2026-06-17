export function activate(ctx) {
  const unsubscribe = ctx.events.on('app:ready', () => {
    ctx.logger.info('Plugin minimal prêt.');
  });

  return unsubscribe;
}
