// Free raster sources that need no API key. Both are light maps; the dark
// theme is obtained with a CSS filter on the tile layers (one GPU pass).
export const TILE_PROVIDERS = {
    osm: {
        label: 'OpenStreetMap',
        attribution: '© les contributeurs OpenStreetMap',
        url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
    },
    ign: {
        label: 'Plan IGN',
        attribution: '© IGN – Géoplateforme',
        url: (z, x, y) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}`,
    },
};
export const DEFAULT_TILE_PROVIDER = 'osm';

export function getTileProviderId(settings = {}) {
    return TILE_PROVIDERS[settings.mapProvider] ? settings.mapProvider : DEFAULT_TILE_PROVIDER;
}
