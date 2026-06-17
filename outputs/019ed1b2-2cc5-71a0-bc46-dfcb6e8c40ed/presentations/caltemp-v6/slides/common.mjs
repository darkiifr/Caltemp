const C = {
  bg: "#0f1117",
  panel: "#171a22",
  panel2: "#20242f",
  text: "#f4f7fb",
  muted: "#aab2c5",
  faint: "#687086",
  blue: "#4f8cff",
  blue2: "#1f5eff",
  green: "#25d17f",
  yellow: "#f5c04f",
  red: "#ff6b6b",
  purple: "#a783ff",
  line: "#343a49",
};

function t(ctx, slide, text, x, y, w, h, opts = {}) {
  return ctx.addText(slide, {
    text,
    x,
    y,
    w,
    h,
    fontSize: opts.size ?? 24,
    color: opts.color ?? C.text,
    bold: opts.bold ?? false,
    typeface: opts.face ?? (opts.title ? ctx.fonts.title : ctx.fonts.body),
    align: opts.align ?? "left",
    valign: opts.valign ?? "top",
    fill: opts.fill ?? "#00000000",
    line: opts.line ?? ctx.line("#00000000", 0),
    insets: opts.insets ?? { left: 0, right: 0, top: 0, bottom: 0 },
  });
}

function rect(ctx, slide, x, y, w, h, fill = C.panel, line = C.line) {
  return ctx.addShape(slide, {
    x,
    y,
    w,
    h,
    fill,
    line: ctx.line(line, line === "#00000000" ? 0 : 1),
  });
}

function line(ctx, slide, x, y, w, h, color = C.line) {
  return ctx.addShape(slide, {
    x,
    y,
    w,
    h,
    fill: color,
    line: ctx.line("#00000000", 0),
  });
}

function dot(ctx, slide, x, y, color = C.blue, size = 10) {
  return ctx.addShape(slide, {
    geometry: "ellipse",
    x,
    y,
    w: size,
    h: size,
    fill: color,
    line: ctx.line("#00000000", 0),
  });
}

function base(ctx, slide, kicker, title, subtitle) {
  rect(ctx, slide, 0, 0, ctx.W, ctx.H, C.bg, "#00000000");
  line(ctx, slide, 0, 0, ctx.W, 5, C.blue, 0);
  t(ctx, slide, kicker.toUpperCase(), 62, 34, 420, 24, { size: 12, color: C.blue, bold: true });
  t(ctx, slide, title, 60, 68, 830, 92, { size: 40, bold: true, title: true });
  if (subtitle) t(ctx, slide, subtitle, 62, 148, 760, 48, { size: 16, color: C.muted });
  t(ctx, slide, "Caltemp v6.0.0", 1058, 664, 160, 20, { size: 11, color: C.faint, align: "right" });
}

function pill(ctx, slide, text, x, y, w, color) {
  rect(ctx, slide, x, y, w, 30, "#11141b", color);
  dot(ctx, slide, x + 12, y + 10, color, 10);
  t(ctx, slide, text, x + 30, y + 7, w - 40, 18, { size: 12, color: C.text, bold: true });
}

function card(ctx, slide, x, y, w, h, title, body, accent = C.blue) {
  rect(ctx, slide, x, y, w, h, C.panel, C.line);
  line(ctx, slide, x, y, 5, h, accent, 0);
  t(ctx, slide, title, x + 22, y + 18, w - 44, 24, { size: 17, bold: true });
  t(ctx, slide, body, x + 22, y + 50, w - 44, h - 64, { size: 13, color: C.muted });
}

export async function cover(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Calendrier local", "Caltemp v6", "Un calendrier desktop moderne pour organiser les journees, les rappels, les imports ICS et les notes sans compte obligatoire.");
  t(ctx, slide, "Productivite locale, rappels clairs, Dexter en option.", 62, 222, 620, 56, { size: 24, color: C.text, bold: true });
  rect(ctx, slide, 770, 90, 380, 460, C.panel, C.line);
  t(ctx, slide, "Vue produit", 800, 122, 180, 24, { size: 14, color: C.muted, bold: true });
  line(ctx, slide, 800, 168, 300, 2, C.line);
  ["09:00  Cours", "11:30  Devoir", "14:00  Note", "17:30  Rappel"].forEach((item, i) => {
    const y = 205 + i * 72;
    dot(ctx, slide, 806, y + 6, [C.green, C.yellow, C.purple, C.blue][i], 12);
    t(ctx, slide, item, 832, y, 220, 24, { size: 18, bold: true });
    t(ctx, slide, "Rappel local et donnees sur l'appareil", 832, y + 28, 240, 20, { size: 11, color: C.faint });
  });
  const metrics = [["6.0.0", "version cible"], ["0", "vulnerabilite npm"], ["local", "donnees par defaut"]];
  metrics.forEach((m, i) => card(ctx, slide, 62 + i * 214, 552, 190, 82, m[0], m[1], [C.blue, C.green, C.purple][i]));
  return slide;
}

export async function dayView(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Lecture quotidienne", "Une journee lisible en un coup d'oeil", "Le calendrier doit aider a comprendre quoi faire maintenant, ensuite, et ce qui demande une preparation.");
  rect(ctx, slide, 70, 215, 720, 360, C.panel, C.line);
  ["08:00", "10:00", "12:00", "14:00", "16:00", "18:00"].forEach((h, i) => {
    const y = 242 + i * 54;
    t(ctx, slide, h, 92, y - 7, 58, 18, { size: 11, color: C.faint });
    line(ctx, slide, 160, y, 585, 1, "#2a2f3c", 0);
  });
  [
    [196, 64, C.green, "Cours", "Programmation avancee"],
    [306, 92, C.yellow, "Devoir", "Rendu a finaliser"],
    [440, 68, C.blue, "Perso", "Rappel administratif"],
  ].forEach(([y, h, color, title, desc]) => {
    rect(ctx, slide, 180, y, 420, h, "#11141b", color);
    t(ctx, slide, title, 202, y + 12, 110, 20, { size: 13, color, bold: true });
    t(ctx, slide, desc, 202, y + 35, 320, 22, { size: 16, bold: true });
  });
  card(ctx, slide, 850, 215, 300, 96, "Maintenant", "Prochain evenement, duree restante et rappel lisible.", C.green);
  card(ctx, slide, 850, 335, 300, 96, "Aujourd'hui", "Regroupement des cours, devoirs et examens de la journee.", C.blue);
  card(ctx, slide, 850, 455, 300, 120, "Focus", "Mettre en avant uniquement les prochains evenements pour reduire le bruit visuel.", C.purple);
  return slide;
}

export async function icsSources(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Imports rapides", "Sources ICS et fichiers calendrier", "La v6 formalise les imports ICS pour recuperer des emplois du temps, anniversaires, examens ou calendriers partages.");
  const steps = [
    ["1", "Choisir", "Fichier .ics ou source connue"],
    ["2", "Importer", "UID et dates normalises"],
    ["3", "Verifier", "Doublons limites avant sauvegarde"],
    ["4", "Utiliser", "Evenements disponibles localement"],
  ];
  steps.forEach((s, i) => {
    const x = 78 + i * 285;
    dot(ctx, slide, x, 250, [C.blue, C.green, C.yellow, C.purple][i], 34);
    t(ctx, slide, s[0], x, 257, 34, 18, { size: 14, bold: true, align: "center" });
    t(ctx, slide, s[1], x - 10, 306, 110, 24, { size: 20, bold: true });
    t(ctx, slide, s[2], x - 10, 340, 180, 42, { size: 13, color: C.muted });
    if (i < 3) line(ctx, slide, x + 50, 267, 190, 2, C.line);
  });
  [["Google Calendar", "URL secrete au format iCal"], ["Outlook", "Lien ICS publie"], ["Pronote / ecole", "Export fichier quand disponible"], ["Calendrier local", "Selection directe du fichier"]].forEach((row, i) => {
    const y = 440 + i * 44;
    rect(ctx, slide, 158, y, 820, 34, i % 2 ? "#131720" : C.panel, "#00000000");
    dot(ctx, slide, 178, y + 11, [C.blue, C.green, C.yellow, C.purple][i], 10);
    t(ctx, slide, row[0], 198, y + 8, 220, 18, { size: 13, bold: true });
    t(ctx, slide, row[1], 450, y + 8, 380, 18, { size: 13, color: C.muted });
    t(ctx, slide, "Aide URL", 865, y + 8, 80, 18, { size: 12, color: C.blue, align: "right" });
  });
  return slide;
}

export async function notifications(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Rappels", "Notifications intelligentes et mode silencieux", "Les rappels doivent signaler l'important sans interrompre inutilement le travail.");
  card(ctx, slide, 70, 225, 300, 130, "Toast applicatif", "Rappel visible dans Caltemp avec action rapide pour le traiter.", C.blue);
  card(ctx, slide, 70, 385, 300, 130, "Snooze", "Reporter de 5, 10, 30 minutes ou jusqu'a la fin de journee.", C.green);
  rect(ctx, slide, 475, 215, 330, 310, C.panel, C.line);
  t(ctx, slide, "3 cours aujourd'hui", 506, 252, 260, 28, { size: 24, bold: true });
  t(ctx, slide, "Les evenements recurrents peuvent etre regroupes pour garder une alerte concise.", 506, 296, 250, 64, { size: 14, color: C.muted });
  ["Snooze 10 min", "Mode silencieux", "Badge compteur"].forEach((label, i) => pill(ctx, slide, label, 506, 390 + i * 42, 185, [C.green, C.purple, C.yellow][i]));
  card(ctx, slide, 895, 225, 285, 130, "Silencieux", "Pas de son ni notification native, mais un compteur reste visible.", C.purple);
  card(ctx, slide, 895, 385, 285, 130, "Clavier", "Raccourcis pour reporter ou fermer le rappel actif.", C.yellow);
  return slide;
}

export async function organisation(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Organisation", "Categories, routines, todos et examens", "Caltemp combine plusieurs niveaux simples : type d'evenement, modele reutilisable, tache associee et preparation examen.");
  const cols = [
    ["Categories", "Cours, devoir, examen, perso, dev", C.blue],
    ["Routines", "Modeles applicables en un clic", C.green],
    ["Todos", "Taches liees a un jour ou evenement", C.yellow],
    ["Examens", "Preparation J-30, J-7, J-1", C.red],
  ];
  cols.forEach((c, i) => {
    const x = 70 + i * 292;
    rect(ctx, slide, x, 240, 252, 250, C.panel, C.line);
    line(ctx, slide, x, 240, 252, 6, c[2], 0);
    t(ctx, slide, c[0], x + 22, 270, 198, 28, { size: 21, bold: true });
    t(ctx, slide, c[1], x + 22, 314, 200, 58, { size: 14, color: C.muted });
    for (let j = 0; j < 3; j += 1) {
      dot(ctx, slide, x + 24, 405 + j * 24, c[2], 8);
      line(ctx, slide, x + 42, 408 + j * 24, 150 - j * 18, 3, "#303748", 0);
    }
  });
  t(ctx, slide, "Resultat utilisateur : moins de saisie repetitive, plus de lisibilite, et une preparation qui part des dates importantes.", 128, 548, 980, 36, { size: 18, color: C.text, bold: true, align: "center" });
  return slide;
}

export async function dexter(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Assistant", "Dexter : utile sans cle API obligatoire", "Dexter garde un mode local deterministe pour les commandes calendrier simples, puis peut utiliser l'IA configuree par l'utilisateur.");
  rect(ctx, slide, 82, 225, 520, 330, C.panel, C.line);
  t(ctx, slide, "Utilisateur", 116, 255, 120, 20, { size: 13, color: C.blue, bold: true });
  rect(ctx, slide, 116, 285, 390, 58, "#11141b", C.blue);
  t(ctx, slide, "Ajoute un examen de maths vendredi a 9h", 136, 303, 340, 22, { size: 16, bold: true });
  t(ctx, slide, "Dexter", 116, 378, 120, 20, { size: 13, color: C.green, bold: true });
  rect(ctx, slide, 116, 408, 425, 82, "#11141b", C.green);
  t(ctx, slide, "Evenement cree localement, avec categorie examen et rappel.", 136, 426, 360, 42, { size: 15, color: C.text });
  card(ctx, slide, 675, 225, 420, 86, "Creation rapide", "Parser local pour les phrases courantes en francais.", C.blue);
  card(ctx, slide, 675, 337, 420, 86, "Resume ma semaine", "Synthese des evenements visibles et priorites locales.", C.green);
  card(ctx, slide, 675, 449, 420, 106, "Planning de revision", "Generation d'etapes a partir des dates d'examens lorsque les donnees existent.", C.red);
  return slide;
}

export async function privacy(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Confiance", "Distribution locale et confidentialite", "La proposition centrale de Caltemp reste simple : organiser son temps sans envoyer le calendrier personnel par defaut.");
  const nodes = [
    [120, 260, "Application Tauri", "Interface desktop"],
    [490, 260, "Stockage local", "events.json, settings.json"],
    [860, 260, "Services optionnels", "Unsplash, IA configuree"],
  ];
  nodes.forEach((n, i) => {
    rect(ctx, slide, n[0], n[1], 260, 150, C.panel, [C.blue, C.green, C.purple][i]);
    t(ctx, slide, n[2], n[0] + 24, n[1] + 32, 205, 26, { size: 21, bold: true });
    t(ctx, slide, n[3], n[0] + 24, n[1] + 78, 205, 44, { size: 14, color: C.muted });
  });
  line(ctx, slide, 382, 334, 86, 3, C.line);
  line(ctx, slide, 752, 334, 86, 3, C.line);
  t(ctx, slide, "Par defaut : local. Les connexions externes restent explicites.", 170, 500, 860, 40, { size: 24, bold: true, align: "center" });
  t(ctx, slide, "La v6 documente aussi la securite des dependances pour faciliter les releases plus fiables.", 245, 552, 720, 28, { size: 15, color: C.muted, align: "center" });
  return slide;
}

export async function security(presentation, ctx) {
  const slide = presentation.slides.add();
  base(ctx, slide, "Release v6", "Securite, mises a jour et prochaines etapes", "La v6 ajoute les controles necessaires pour surveiller les dependances et presenter l'application proprement.");
  const rows = [
    ["Lockfile npm", "Installation reproductible et npm audit debloque", C.green],
    ["Dependabot", "Surveillance npm, Cargo et GitHub Actions", C.blue],
    ["Security Audit", "npm ci, audit, lint, build, cargo check, cargo audit", C.purple],
    ["Release", "Versions synchronisees et workflow Tauri aligne sur npm", C.yellow],
  ];
  rows.forEach((r, i) => {
    const y = 214 + i * 86;
    dot(ctx, slide, 96, y + 12, r[2], 18);
    line(ctx, slide, 104, y + 34, 2, i < rows.length - 1 ? 52 : 0, C.line);
    t(ctx, slide, r[0], 135, y, 240, 24, { size: 20, bold: true });
    t(ctx, slide, r[1], 390, y + 3, 600, 22, { size: 15, color: C.muted });
  });
  rect(ctx, slide, 850, 508, 260, 82, "#11141b", C.blue);
  t(ctx, slide, "Prochaines etapes", 878, 528, 190, 22, { size: 16, bold: true });
  t(ctx, slide, "Sync comptes, presence Discord, portable complet.", 878, 556, 205, 22, { size: 12, color: C.muted });
  return slide;
}

export { C };
