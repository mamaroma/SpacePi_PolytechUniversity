/** Единая тёмная подложка для всех Leaflet-карт.
 *
 * CARTO basemaps с осени 2026 требуют API-ключ и вместо карты отдают плитки
 * с водяным знаком «API KEY REQUIRED». Esri World Dark Gray Canvas бесплатен,
 * не требует ключа и уже используется на странице «Снимки».
 * Нативный зум у Esri — 16; дальше Leaflet масштабирует плитки сам.
 */
export const DARK_TILE_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}";

export const DARK_TILE_ATTRIBUTION =
  'Tiles &copy; <a href="https://www.esri.com/" target="_blank" rel="noreferrer">Esri</a>';

export const DARK_TILE_MAX_NATIVE_ZOOM = 16;

/** Готовый набор пропсов для `<TileLayer {...DARK_TILE_PROPS} />`. */
export const DARK_TILE_PROPS = {
  url: DARK_TILE_URL,
  attribution: DARK_TILE_ATTRIBUTION,
  maxNativeZoom: DARK_TILE_MAX_NATIVE_ZOOM,
  maxZoom: 19,
};
