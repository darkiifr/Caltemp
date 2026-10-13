/**
 * @caltemp
 * id: com.caltemp.examples.pomodoro
 * name: Pomodoro
 * version: 1.0.0
 * description: Minuteur de concentration avec pauses, notifications et compteur de sessions du jour.
 * author: Caltemp
 * license: MIT
 * repository: https://github.com/darkiifr/Caltemp
 * permissions: notifications:send
 * settings: [{"key":"focusMinutes","type":"number","label":"Concentration (minutes)","default":25,"min":1,"max":120},{"key":"breakMinutes","type":"number","label":"Pause (minutes)","default":5,"min":1,"max":60},{"key":"dailyGoal","type":"number","label":"Objectif de sessions par jour","default":8,"min":1,"max":24}]
 */

const MINUTE = 60 * 1000;

// Timers live in the plugin's worker: Caltemp stops them when the plugin is
// disabled, so there is nothing to clean up.
export function activate(ctx) {
  let phase = 'idle'; // idle | focus | break
  let endsAt = 0;
  let endTimer = null;
  let tickTimer = null;
  let panel = null;

  const todayKey = () => `sessions:${new Date().toISOString().slice(0, 10)}`;
  const remaining = () => Math.max(0, endsAt - Date.now());
  const format = (ms) => {
    const seconds = Math.ceil(ms / 1000);
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };

  const stopTimers = () => {
    clearTimeout(endTimer);
    clearInterval(tickTimer);
    endTimer = null;
    tickTimer = null;
  };

  const start = (nextPhase) => {
    stopTimers();
    phase = nextPhase;
    const minutes = Number(ctx.config.get(nextPhase === 'focus' ? 'focusMinutes' : 'breakMinutes'));
    endsAt = Date.now() + minutes * MINUTE;
    endTimer = setTimeout(finish, remaining());
    // The display refreshes once per second, and only while the panel is open.
    if (panel) tickTimer = setInterval(render, 1000);
    else ctx.ui.toast(`${nextPhase === 'focus' ? 'Concentration' : 'Pause'} : ${minutes} min`, 'info');
    render();
  };

  const stop = () => {
    stopTimers();
    phase = 'idle';
    render();
  };

  async function finish() {
    stopTimers();
    if (phase === 'focus') {
      const done = ((await ctx.storage.get(todayKey())) || 0) + 1;
      await ctx.storage.set(todayKey(), done);
      await ctx.notify('Pomodoro terminé', `Session n°${done} bouclée. Place à la pause !`, 'success');
      start('break');
    } else {
      await ctx.notify('Pause terminée', 'On reprend ?', 'info');
      phase = 'idle';
      render();
    }
  }

  async function view() {
    const done = (await ctx.storage.get(todayKey())) || 0;
    const goal = Number(ctx.config.get('dailyGoal'));
    const total = Number(ctx.config.get(phase === 'break' ? 'breakMinutes' : 'focusMinutes')) * MINUTE;
    const label = { idle: 'Prêt', focus: 'Concentration', break: 'Pause' }[phase];

    return {
      title: 'Pomodoro',
      description: phase === 'idle' ? 'Lancez une session de concentration.' : `${label} · ${format(remaining())}`,
      blocks: [
        {
          type: 'stats',
          items: [
            { label: 'État', value: label },
            { label: 'Restant', value: phase === 'idle' ? '—' : format(remaining()) },
            { label: 'Aujourd’hui', value: `${done} / ${goal}` },
          ],
        },
        phase !== 'idle' && { type: 'progress', label: 'Session en cours', value: 1 - remaining() / total },
        { type: 'progress', label: 'Objectif du jour', value: Math.min(1, done / goal) },
        {
          type: 'actions',
          items: phase === 'idle'
            ? [
              { label: 'Démarrer', variant: 'primary', onClick: () => start('focus') },
              { label: 'Pause courte', onClick: () => start('break') },
            ]
            : [
              { label: phase === 'focus' ? 'Passer à la pause' : 'Reprendre', variant: 'primary', onClick: () => (phase === 'focus' ? finish() : start('focus')) },
              { label: 'Arrêter', variant: 'danger', onClick: stop },
            ],
        },
      ].filter(Boolean),
    };
  }

  async function render() {
    if (!panel) return;
    try {
      await panel.update(await view());
    } catch {
      // Closed by the user: stop refreshing, the timer itself keeps running.
      panel = null;
      clearInterval(tickTimer);
      tickTimer = null;
    }
  }

  ctx.commands.register({
    id: 'open',
    label: 'Pomodoro : ouvrir le minuteur',
    run: async () => {
      panel = await ctx.ui.showPanel(await view());
      if (phase !== 'idle' && !tickTimer) tickTimer = setInterval(render, 1000);
    },
  });
  ctx.commands.register({ id: 'start', label: 'Pomodoro : démarrer une session', run: () => start('focus') });
  ctx.commands.register({ id: 'stop', label: 'Pomodoro : arrêter', run: stop });
}
