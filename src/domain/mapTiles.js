// Free OpenStreetMap raster tiles (no API key). The tiles are light; the dark
// theme is obtained with a CSS filter on the tile layers (one GPU pass).
// Usage policy: https://operations.osmfoundation.org/policies/tiles/
export const OSM_TILES = {
    label: 'OpenStreetMap',
    attribution: '© les contributeurs OpenStreetMap',
    url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`,
};
