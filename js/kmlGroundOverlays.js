// Utility helpers to render KML GroundOverlay elements on the map.
const KML_NS = 'http://www.opengis.net/kml/2.2';
const GX_NS = 'http://www.google.com/kml/ext/2.2';

const normalizeHref = (href) => href.replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\\/g, '/');

const parseAlpha = (colorText) => {
  if (!colorText) return 1;
  const clean = colorText.trim().replace('#', '');
  if (clean.length !== 8) return 1;
  const alpha = parseInt(clean.slice(0, 2), 16);
  return Number.isFinite(alpha) ? alpha / 255 : 1;
};

const readLatLonBox = (overlayEl) => {
  const box = overlayEl.getElementsByTagNameNS(KML_NS, 'LatLonBox')[0] || overlayEl.getElementsByTagName('LatLonBox')[0];
  if (!box) return null;

  const north = parseFloat(box.getElementsByTagName('north')[0]?.textContent);
  const south = parseFloat(box.getElementsByTagName('south')[0]?.textContent);
  const east = parseFloat(box.getElementsByTagName('east')[0]?.textContent);
  const west = parseFloat(box.getElementsByTagName('west')[0]?.textContent);

  if ([north, south, east, west].some((v) => Number.isNaN(v))) return null;
  return [west, south, east, north];
};

const readLatLonQuad = (overlayEl) => {
  const quad = overlayEl.getElementsByTagNameNS(GX_NS, 'LatLonQuad')[0] || overlayEl.querySelector('gx\\:LatLonQuad');
  if (!quad) return null;

  const coordsText = (quad.querySelector('coordinates') || quad).textContent || '';
  const pairs = coordsText
    .trim()
    .split(/\s+/)
    .map((pair) => pair.trim())
    .filter(Boolean);

  const coords = pairs
    .map((pair) => {
      const [lonStr, latStr] = pair.split(',').map((p) => p.trim());
      const lon = parseFloat(lonStr);
      const lat = parseFloat(latStr);
      return Number.isNaN(lon) || Number.isNaN(lat) ? null : [lon, lat];
    })
    .filter(Boolean);

  if (coords.length < 4) return null;

  const lons = coords.map((c) => c[0]);
  const lats = coords.map((c) => c[1]);
  return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
};

const readOverlayExtent = (overlayEl) => readLatLonBox(overlayEl) || readLatLonQuad(overlayEl);

const readHref = (overlayEl) => {
  const icon = overlayEl.getElementsByTagName('Icon')[0];
  const hrefNode =
    icon?.getElementsByTagName('href')[0] ||
    overlayEl.querySelector('href') ||
    overlayEl.querySelector('gx\\:href');
  return hrefNode?.textContent?.trim() || '';
};

const findZipEntry = (zipArchive, href) => {
  const normalized = normalizeHref(href);
  let entry = zipArchive.file(normalized);
  if (!entry && normalized.includes('/')) {
    const fileName = normalized.split('/').pop();
    entry = fileName ? zipArchive.file(fileName) : null;
  }
  return entry || null;
};

const resolveOverlayUrl = async (href, zipArchive, baseHref) => {
  if (!href) return null;

  if (zipArchive) {
    const entry = findZipEntry(zipArchive, href);
    if (entry) {
      const blob = await entry.async('blob');
      return URL.createObjectURL(blob);
    }
  }

  if (/^(https?:)?\/\//i.test(href) || href.startsWith('data:')) {
    return href;
  }

  if (baseHref) {
    try {
      return new URL(href, baseHref).href;
    } catch (err) {
      // ignore
    }
  }

  return null;
};

/**
 * Parses KML text and renders GroundOverlay images on the map.
 * @param {ol.Map} map
 * @param {string} kmlText
 * @param {{zipArchive?: any, baseHref?: string, zIndex?: number}} options
 * @returns {Promise<Array<{layer: ol.layer.Image, extent: ol.Extent}>>}
 */
export async function renderKmlGroundOverlays(map, kmlText, options = {}) {
  if (!kmlText) return [];

  const xml = new DOMParser().parseFromString(kmlText, 'application/xml');
  if (xml.querySelector('parsererror')) return [];

  const projection = map.getView().getProjection();
  const overlays = [];
  const overlayNodes = Array.from(xml.getElementsByTagName('GroundOverlay'));

  for (const overlayEl of overlayNodes) {
    const href = readHref(overlayEl);
    const extent4326 = readOverlayExtent(overlayEl);
    if (!href || !extent4326) continue;

    const url = await resolveOverlayUrl(href, options.zipArchive, options.baseHref);
    if (!url) continue;

    const extent = ol.proj.transformExtent(extent4326, 'EPSG:4326', projection);
    const opacity = parseAlpha(overlayEl.querySelector('color')?.textContent);

    const layer = new ol.layer.Image({
      source: new ol.source.ImageStatic({
        url,
        imageExtent: extent,
        projection,
        crossOrigin: 'anonymous'
      }),
      opacity: opacity,
      visible: true
    });

    layer.setZIndex(options.zIndex ?? 5);
    map.addLayer(layer);
    overlays.push({ layer, extent });
  }

  return overlays;
}
