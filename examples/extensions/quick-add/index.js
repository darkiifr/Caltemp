/**
 * @caltemp
 * id: com.caltemp.examples.quick-add
 * name: Ajout rapide
 * version: 1.0.0
 * description: Ajoute un événement en une phrase (« Dentiste demain 14h30 pendant 45 min ») et bloque des créneaux de concentration en un clic.
 * author: Caltemp
 * license: MIT
 * repository: https://github.com/darkiifr/Caltemp
 * permissions: calendar:write
 * settings: [{"key":"defaultHour","type":"number","label":"Heure par défaut sans heure précisée","default":9,"min":0,"max":23},{"key":"defaultDuration","type":"number","label":"Durée par défaut (minutes)","default":60,"min":5,"max":600},{"key":"focusMinutes","type":"number","label":"Durée d’un créneau de concentration (minutes)","default":90,"min":15,"max":480},{"key":"category","type":"select","label":"Catégorie","default":"perso","options":[{"value":"perso","label":"Perso"},{"value":"cours","label":"Cours"},{"value":"devoir","label":"Devoir"},{"value":"examen","label":"Examen"},{"value":"dev","label":"Dev"},{"value":"sport","label":"Sport"}]},{"key":"reminder","type":"boolean","label":"Activer le rappel","default":true}]
 */

const WEEKDAYS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];

function minutesFrom(hours, minutes) {
  return Number(hours || 0) * 60 + Number(minutes || 0);
}

/**
 * Parses a short French sentence. Exported for tests; Caltemp only calls
 * `activate`.
 *
 *   « Dentiste demain 14h30 pendant 45 min »
 *   « Réunion lundi à 9h », « Appeler maman dans 2h », « Partiel 12/06 8h »
 */
export function parseQuickEntry(input, { now = new Date(), defaultHour = 9 } = {}) {
  let text = ` ${String(input || '').trim()} `;
  const take = (pattern) => {
    const match = text.match(pattern);
    if (match) text = text.replace(match[0], ' ');
    return match;
  };

  let durationMinutes = null;
  const duration = take(/\s(?:pendant|durant)\s+(\d+)\s*(?:h|heures?)\s*(\d{1,2})?\s*(?:min)?(?=\s)/i)
    || take(/\s(?:pendant|durant)\s+(\d+)\s*min(?:utes?)?(?=\s)/i);
  if (duration) {
    durationMinutes = /h/i.test(duration[0]) ? minutesFrom(duration[1], duration[2]) : Number(duration[1]);
  }

  const date = new Date(now);
  let hasTime = false;

  const relative = take(/\sdans\s+(\d+)\s*(min(?:utes?)?|h(?:eures?)?|jours?)(?=\s)/i);
  if (relative) {
    const amount = Number(relative[1]);
    const unit = relative[2].toLowerCase();
    if (unit.startsWith('j')) date.setDate(date.getDate() + amount);
    else {
      date.setMinutes(date.getMinutes() + (unit.startsWith('h') ? amount * 60 : amount), 0, 0);
      hasTime = true;
    }
  }

  const explicitDate = take(/\s(?:le\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?=\s)/i);
  if (explicitDate) {
    const year = explicitDate[3] ? Number(explicitDate[3].length === 2 ? `20${explicitDate[3]}` : explicitDate[3]) : date.getFullYear();
    date.setFullYear(year, Number(explicitDate[2]) - 1, Number(explicitDate[1]));
    if (!explicitDate[3] && date < new Date(now.getFullYear(), now.getMonth(), now.getDate())) {
      date.setFullYear(year + 1);
    }
  } else if (take(/\saprès[- ]demain(?=\s)/i)) {
    date.setDate(date.getDate() + 2);
  } else if (take(/\sdemain(?=\s)/i)) {
    date.setDate(date.getDate() + 1);
  } else if (take(/\s(?:aujourd['’]hui|ce\s+matin)(?=\s)/i)) {
    // today
  } else if (take(/\sce\s+soir(?=\s)/i)) {
    if (!hasTime) date.setHours(19, 0, 0, 0);
    hasTime = true;
  } else {
    const weekday = take(new RegExp(`\\s(?:ce\\s+|le\\s+)?(${WEEKDAYS.join('|')})(?:\\s+prochain)?(?=\\s)`, 'i'));
    if (weekday) {
      const target = WEEKDAYS.indexOf(weekday[1].toLowerCase());
      const delta = (target - date.getDay() + 7) % 7 || 7;
      date.setDate(date.getDate() + delta);
    }
  }

  const time = take(/\s(?:à\s+|a\s+|vers\s+)?(\d{1,2})\s*(?:h|:)\s*(\d{2})?(?=\s)/i);
  if (time && Number(time[1]) < 24) {
    date.setHours(Number(time[1]), Number(time[2] || 0), 0, 0);
    hasTime = true;
  } else if (!hasTime) {
    date.setHours(defaultHour, 0, 0, 0);
  }

  const title = text.replace(/\s+(?:à|a|le|pour)\s*$/i, ' ').replace(/\s+/g, ' ').trim();
  return { title, date, durationMinutes, hasTime };
}

function formatWhen(date) {
  return date.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

export function activate(ctx) {
  const create = async ({ title, date, durationMinutes }) => {
    const event = await ctx.calendar.create({
      title,
      date: date.toISOString(),
      durationMinutes: durationMinutes || Number(ctx.config.get('defaultDuration')),
      category: ctx.config.get('category'),
      reminder: Boolean(ctx.config.get('reminder')),
    });
    await ctx.ui.toast(`Ajouté : ${event.title}, ${formatWhen(new Date(event.date))}`, 'success');
    return event;
  };

  ctx.commands.register({
    id: 'add',
    label: 'Ajout rapide d’un événement…',
    run: async () => {
      const input = await ctx.ui.prompt({
        title: 'Ajout rapide',
        description: 'Ex. « Dentiste demain 14h30 pendant 45 min », « Réunion lundi à 9h », « Appeler maman dans 2h ».',
        placeholder: 'Quoi, quand…',
        confirmLabel: 'Ajouter',
      });
      if (!input?.trim()) return;
      const entry = parseQuickEntry(input, { defaultHour: Number(ctx.config.get('defaultHour')) });
      if (!entry.title) {
        await ctx.ui.toast('Ajoutez un titre à l’événement.', 'warning');
        return;
      }
      await create(entry);
    },
  });

  ctx.commands.register({
    id: 'focus',
    label: 'Bloquer un créneau de concentration maintenant',
    run: () => {
      const date = new Date();
      date.setSeconds(0, 0);
      return create({ title: 'Concentration', date, durationMinutes: Number(ctx.config.get('focusMinutes')) });
    },
  });

  ctx.commands.register({
    id: 'lunch',
    label: 'Bloquer la pause déjeuner aujourd’hui',
    run: () => {
      const date = new Date();
      date.setHours(12, 0, 0, 0);
      return create({ title: 'Pause déjeuner', date, durationMinutes: 60 });
    },
  });
}
