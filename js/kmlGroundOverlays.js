// Utility helpers to render KML GroundOverlay elements on the map.
const KML_NS = 'http://www.opengis.net/kml/2.2';
const GX_NS = 'http://www.google.com/kml/ext/2.2';

const normalizeHref = (href) => href.replace(/^(\.\/)+/, '').replace(/^\/+/, '').replace(/\\/g, '/');
const DEFAULT_OVERSAMPLE = 4; // draw overlays at higher DPI to keep text sharp

const parseAlpha = (colorText) => {
  if (!colorText) return 1;
  const clean = colorText.trim().replace('#', '');
  if (clean.length !== 8) return 1;
  const alpha = parseInt(clean.slice(0, 2), 16);
  return Number.isFinite(alpha) ? alpha / 255 : 1;
};

const parseRotation = (overlayEl) => {
  const node = overlayEl.getElementsByTagName('rotation')[0];
  const val = parseFloat(node?.textContent);
  return Number.isFinite(val) ? val : 0;
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

const readLatLonQuadCoords = (overlayEl) => {
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

  return coords.length === 4 ? coords : null;
};

const readOverlayExtent = (overlayEl) => {
  const quad = readLatLonQuadCoords(overlayEl);
  if (quad) {
    return ol.extent.boundingExtent(quad);
  }
  return readLatLonBox(overlayEl);
};

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

const getRotatedExtent = (extent4326, rotationDeg, projection) => {
  if (!extent4326) return null;

  const [minX, minY, maxX, maxY] = extent4326;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const halfW = (maxX - minX) / 2;
  const halfH = (maxY - minY) / 2;
  const radians = (rotationDeg * Math.PI) / 180;

  const corners = [
    [-halfW, -halfH],
    [halfW, -halfH],
    [halfW, halfH],
    [-halfW, halfH]
  ].map(([dx, dy]) => {
    const rx = dx * Math.cos(radians) - dy * Math.sin(radians);
    const ry = dx * Math.sin(radians) + dy * Math.cos(radians);
    return [centerX + rx, centerY + ry];
  });

  const targetExtent = ol.extent.createEmpty();
  corners.forEach((coord4326) => {
    const projected = ol.proj.transform(coord4326, 'EPSG:4326', projection);
    ol.extent.extendCoordinate(targetExtent, projected);
  });

  return targetExtent;
};

const applyTriangleWarp = (ctx, img, srcTri, destTri) => {
  const [sx0, sy0, sx1, sy1, sx2, sy2] = srcTri;
  const [dx0, dy0, dx1, dy1, dx2, dy2] = destTri;

  const denom = sx0 * (sy2 - sy1) + sx1 * (sy0 - sy2) + sx2 * (sy1 - sy0);
  if (denom === 0) return;

  const a = (dx0 * (sy2 - sy1) + dx1 * (sy0 - sy2) + dx2 * (sy1 - sy0)) / denom;
  const b = (dy0 * (sy2 - sy1) + dy1 * (sy0 - sy2) + dy2 * (sy1 - sy0)) / denom;
  const c = (dx0 * (sx1 - sx2) + dx1 * (sx2 - sx0) + dx2 * (sx0 - sx1)) / denom;
  const d = (dy0 * (sx1 - sx2) + dy1 * (sx2 - sx0) + dy2 * (sx0 - sx1)) / denom;
  const e = (dx0 * (sx2 * sy1 - sx1 * sy2) + dx1 * (sx0 * sy2 - sx2 * sy0) + dx2 * (sx1 * sy0 - sx0 * sy1)) / denom;
  const f = (dy0 * (sx2 * sy1 - sx1 * sy2) + dy1 * (sx0 * sy2 - sx2 * sy0) + dy2 * (sx1 * sy0 - sx0 * sy1)) / denom;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(dx0, dy0);
  ctx.lineTo(dx1, dy1);
  ctx.lineTo(dx2, dy2);
  ctx.closePath();
  ctx.clip();
  ctx.transform(a, b, c, d, e, f);
  ctx.drawImage(img, 0, 0);
  ctx.restore();
};

const buildQuadWarpLoadFunction = (quadCoords4326, projection, oversample = DEFAULT_OVERSAMPLE) => {
  // KML order for gx:LatLonQuad is lower-left, lower-right, upper-right, upper-left
  const quadProjected = quadCoords4326.map((coord) => ol.proj.transform(coord, 'EPSG:4326', projection));
  const quadExtent = ol.extent.boundingExtent(quadProjected);

  return {
    extent: quadExtent,
    loadFunc: (imageWrapper, src) => {
      const loaderImg = new Image();
      loaderImg.crossOrigin = 'anonymous';

      loaderImg.onload = () => {
        const width = loaderImg.naturalWidth || loaderImg.width;
        const height = loaderImg.naturalHeight || loaderImg.height;
        const canvas = document.createElement('canvas');
        const canvasWidth = width * oversample;
        const canvasHeight = height * oversample;
        canvas.width = canvasWidth;
        canvas.height = canvasHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
        }

        const [minX, minY, maxX, maxY] = quadExtent;
        const toCanvas = ([x, y]) => [
          ((x - minX) / (maxX - minX)) * canvasWidth,
          ((maxY - y) / (maxY - minY)) * canvasHeight
        ];
        const destPts = quadProjected.map(toCanvas);

        // Source corners matching KML order (lower-left, lower-right, upper-right, upper-left)
        const srcPts = [
          [0, height],
          [width, height],
          [width, 0],
          [0, 0]
        ];

        // Split into two triangles: 0-1-2 and 0-2-3
        applyTriangleWarp(
          ctx,
          loaderImg,
          [...srcPts[0], ...srcPts[1], ...srcPts[2]],
          [...destPts[0], ...destPts[1], ...destPts[2]]
        );
        applyTriangleWarp(
          ctx,
          loaderImg,
          [...srcPts[0], ...srcPts[2], ...srcPts[3]],
          [...destPts[0], ...destPts[2], ...destPts[3]]
        );

        const targetImg = imageWrapper.getImage();
        targetImg.crossOrigin = 'anonymous';
        targetImg.src = canvas.toDataURL();

        if (src?.startsWith('blob:')) {
          URL.revokeObjectURL(src);
        }
      };

      loaderImg.onerror = () => {
        const targetImg = imageWrapper.getImage();
        targetImg.crossOrigin = 'anonymous';
        targetImg.src = src;
      };

      loaderImg.src = src;
    }
  };
};

const buildRotatedLoadFunction = (rotationDeg, crossOrigin, oversample = DEFAULT_OVERSAMPLE) => {
  const radians = (rotationDeg * Math.PI) / 180;

  return (imageWrapper, src) => {
    const loaderImg = new Image();
    if (crossOrigin) {
      loaderImg.crossOrigin = crossOrigin;
    }

    loaderImg.onload = () => {
      const width = loaderImg.naturalWidth || loaderImg.width;
      const height = loaderImg.naturalHeight || loaderImg.height;
      const rotatedWidth = (Math.abs(width * Math.cos(radians)) + Math.abs(height * Math.sin(radians))) * oversample;
      const rotatedHeight = (Math.abs(width * Math.sin(radians)) + Math.abs(height * Math.cos(radians))) * oversample;
      const canvas = document.createElement('canvas');
      canvas.width = rotatedWidth;
      canvas.height = rotatedHeight;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
        ctx.rotate(radians);
        ctx.scale(oversample, oversample);
        ctx.drawImage(loaderImg, -width / 2, -height / 2, width, height);
      }

      const targetImg = imageWrapper.getImage();
      if (crossOrigin) {
        targetImg.crossOrigin = crossOrigin;
      }
      targetImg.src = canvas.toDataURL();

      if (src?.startsWith('blob:')) {
        URL.revokeObjectURL(src);
      }
    };

    loaderImg.onerror = () => {
      const targetImg = imageWrapper.getImage();
      if (crossOrigin) {
        targetImg.crossOrigin = crossOrigin;
      }
      targetImg.src = src;
    };

    loaderImg.src = src;
  };
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
    const quadCoords4326 = readLatLonQuadCoords(overlayEl);
    const extent4326 = quadCoords4326 ? ol.extent.boundingExtent(quadCoords4326) : readOverlayExtent(overlayEl);
    if (!href || !extent4326) continue;

    const url = await resolveOverlayUrl(href, options.zipArchive, options.baseHref);
    if (!url) continue;

    const opacity = parseAlpha(overlayEl.querySelector('color')?.textContent);
    const rotationDeg = parseRotation(overlayEl);
    const hasRotation = Math.abs(rotationDeg) > 0.0001;
    const crossOrigin = 'anonymous';

    let imageExtent;
    let imageLoadFunction;

    const oversample = options.oversample || DEFAULT_OVERSAMPLE;

    if (quadCoords4326 && quadCoords4326.length === 4) {
      const quadWarp = buildQuadWarpLoadFunction(quadCoords4326, projection, oversample);
      imageExtent = quadWarp.extent;
      imageLoadFunction = quadWarp.loadFunc;
    } else {
      imageExtent = hasRotation
        ? getRotatedExtent(extent4326, rotationDeg, projection)
        : ol.proj.transformExtent(extent4326, 'EPSG:4326', projection);
      imageLoadFunction = hasRotation ? buildRotatedLoadFunction(rotationDeg, crossOrigin, oversample) : undefined;
    }

    if (!imageExtent) continue;

    const layer = new ol.layer.Image({
      source: new ol.source.ImageStatic({
        url,
        imageExtent: imageExtent,
        projection,
        crossOrigin,
        imageLoadFunction
      }),
      opacity: opacity,
      visible: true
    });

    layer.setZIndex(options.zIndex ?? 5);
    map.addLayer(layer);
    overlays.push({ layer, extent: imageExtent });
  }

  return overlays;
}
