const players = [
  {
    name: 'Kylian Mbappé',
    description: 'Attaquant français, champion du monde 2018.',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Kylian_Mbapp%C3%A9_2018.jpg',
    alt: 'Kylian Mbappé avec la France en 2018',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Kylian_Mbapp%C3%A9_2018.jpg',
    sourceLabel: 'Wikimedia Commons',
  },
  {
    name: 'Antoine Griezmann',
    description: 'International français, champion du monde 2018.',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Antoine_Griezmann_2018.jpg',
    alt: 'Antoine Griezmann en 2018',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Antoine_Griezmann_2018.jpg',
    sourceLabel: 'Wikimedia Commons',
  },
  {
    name: 'Thierry Henry',
    description: 'Ancien attaquant français, champion du monde 1998.',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Thierry_Henry.jpg',
    alt: 'Thierry Henry',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Thierry_Henry.jpg',
    sourceLabel: 'Wikimedia Commons',
  },
  {
    name: 'Zinedine Zidane',
    description: 'Ancien meneur de jeu français, Ballon d’Or 1998.',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Zinedine_Zidane_by_Tasnim_03.jpg',
    alt: 'Zinedine Zidane en conférence de presse',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Zinedine_Zidane_by_Tasnim_03.jpg',
    sourceLabel: 'Wikimedia Commons',
  },
  {
    name: 'Wendie Renard',
    description: 'Défenseure française, cadre de l’équipe de France.',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/Wendie_Renard_in_2011.JPG',
    alt: 'Wendie Renard avec la France en 2011',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Wendie_Renard_in_2011.JPG',
    sourceLabel: 'Wikimedia Commons',
  },
  {
    name: 'Marie-Antoinette Katoto',
    description: 'Attaquante française, référence offensive du football féminin français.',
    imageUrl: 'https://commons.wikimedia.org/wiki/Special:FilePath/20141015_-_PSG-Twente_-_Marie-Antoinette_Katoto_01.jpg',
    alt: 'Marie-Antoinette Katoto avec le PSG',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:20141015_-_PSG-Twente_-_Marie-Antoinette_Katoto_01.jpg',
    sourceLabel: 'Wikimedia Commons',
  },
];

export function activate(ctx) {
  return ctx.ui.registerAction({
    id: 'french-football-gallery',
    label: 'Afficher les footballeurs français',
    run: () => {
      ctx.ui.openGallery({
        title: 'Galerie Bleus',
        description: 'Photos de footballeurs et footballeuses français connus.',
        items: players,
      });
    },
  });
}
