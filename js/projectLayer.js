import { map } from './map.js';
import { renderKmlGroundOverlays } from './kmlGroundOverlays.js';

const KML_FILE_REGEX = /\.(kml|kmz)(?:$|[?#])/i;

const ensureMediaUrl = (value) => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('/')) return value;
  return `/media/${value}`;
};

const labelFromUrl = (url) => {
  if (!url) return '';
  const fileName = url.split('/').pop() || '';
  return fileName.replace(KML_FILE_REGEX, '').replace(/[-_]+/g, ' ').trim() || fileName || url;
};

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const findZipKmlFile = (zipArchive) => {
  if (!zipArchive) return null;
  const entries = Object.values(zipArchive.files || {});
  return entries.find((f) => f.name?.toLowerCase().endsWith('.kml')) || null;
};

const kmlPayloadCache = new Map();
const loadKmlPayload = async (url) => {
  if (!url) throw new Error('Missing KML/KMZ url');
  if (kmlPayloadCache.has(url)) {
    return kmlPayloadCache.get(url);
  }

  const loadPromise = (async () => {
    const isKmz = /\.kmz(?:$|[?#])/i.test(url);
    if (!isKmz) {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`Failed to fetch KML (${response.status})`);
      const kmlText = await response.text();
      return { kmlText, zipArchive: null };
    }

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip is required to read KMZ files.');
    }

    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Failed to fetch KMZ (${response.status})`);
    const buffer = await response.arrayBuffer();
    const zipArchive = await JSZip.loadAsync(buffer);
    const kmlEntry = findZipKmlFile(zipArchive);
    if (!kmlEntry) {
      throw new Error('KMZ does not contain a .kml file.');
    }
    const kmlText = await kmlEntry.async('string');
    return { kmlText, zipArchive };
  })();

  kmlPayloadCache.set(url, loadPromise);
  return loadPromise;
};

const projectKmlFormat = new ol.format.KML();

// Kullanılabilir KML sürümlerini topla
const normalizeKmlEntries = (entries) => {
  const seen = new Set();
  return entries
    .filter((item) => item && item.url && KML_FILE_REGEX.test(item.url))
    .map((item, index) => {
      const mediaUrl = ensureMediaUrl(item.url);
      const label = item.label || labelFromUrl(mediaUrl) || item.id || mediaUrl;
      const id = item.id || slugify(label) || `kml-${index}`;
      return { id, label, url: mediaUrl };
    })
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
};

const fallbackKmlList = normalizeKmlEntries([
  { id: 'latest', label: 'Latest project data', url: '/media/latest.kmz' },
  { id: '2025-12-V18', label: 'December 2025 V18', url: '/media/251205_doc.kml' },
  { id: '2025-11-V18', label: 'November 2025 V18', url: '/media/doc.kml' }
]);

let projectKmlEntries = (() => {
  const userList = Array.isArray(window.PROJECT_KML_LIST)
    ? normalizeKmlEntries(window.PROJECT_KML_LIST)
    : [];
  return userList.length ? userList : fallbackKmlList;
})();

let activeEntry = projectKmlEntries[0];
let projectOverlayLayers = [];
let projectOverlayExtents = [];
const projectOverlayGroup = new ol.layer.Group({
  layers: [],
  visible: false,
  title: 'ProjectOverlayGroup'
});
map.addLayer(projectOverlayGroup);
let projectLoadToken = 0;

// KML kaynağı
const projectSource = new ol.source.Vector({
  format: projectKmlFormat
});

// Vektör katmanı
const projectLayer = new ol.layer.Vector({
  source: projectSource,
  visible: false,
  title: 'ProjeKMLKatmani',
  style: new ol.style.Style({
    stroke: new ol.style.Stroke({
      color: 'orange',
      width: 2
    }),
    fill: new ol.style.Fill({
      color: 'rgba(255, 165, 0, 0.2)'
    })
  })
});

// Haritaya ekle
map.addLayer(projectLayer);

// Zoom sadece ilk açışta yapılsın
let zoomDone = false;
let fitTimeoutId = null;

// Checkbox ve sürüm seçimi
const projectToggle = document.getElementById('toggleProjectLayer');
const projectVersionSelect = document.getElementById('projectKmlSelect');

const populateProjectSelect = (entries) => {
  if (!projectVersionSelect) return;
  projectVersionSelect.innerHTML = '';

  const fragment = document.createDocumentFragment();
  entries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    fragment.appendChild(option);
  });

  projectVersionSelect.appendChild(fragment);
  if (activeEntry) {
    projectVersionSelect.value = activeEntry.id;
  }
  projectVersionSelect.disabled = entries.length < 2;
};

const clearProjectOverlays = () => {
  projectOverlayLayers.forEach((layer) => {
    map.removeLayer(layer);
    projectOverlayGroup.getLayers().remove(layer);
  });
  projectOverlayLayers = [];
  projectOverlayExtents = [];
};

const setOverlayVisibility = (visible) => {
  projectOverlayGroup.setVisible(visible);
  projectOverlayLayers.forEach((layer) => layer.setVisible(visible));
};

const mergeOverlayExtent = () => {
  if (!projectOverlayExtents.length) return null;
  return projectOverlayExtents.reduce((acc, ext) => {
    if (!acc) return ol.extent.clone(ext);
    return ol.extent.extend(acc, ext);
  }, null);
};

const loadProjectOverlays = async (entry, loadToken) => {
  clearProjectOverlays();
  if (!entry?.url) return;

  try {
    const { kmlText, zipArchive } = await loadKmlPayload(entry.url);
    if (loadToken && loadToken !== projectLoadToken) return;
    const overlayResults = await renderKmlGroundOverlays(map, kmlText, {
      baseHref: entry.url,
      zipArchive
    });
    if (loadToken && loadToken !== projectLoadToken) return;
    projectOverlayLayers = overlayResults.map((item) => {
      const layer = item.layer;
      map.removeLayer(layer); // move under overlay group for unified visibility
      projectOverlayGroup.getLayers().push(layer);
      return layer;
    });
    projectOverlayExtents = overlayResults.map((item) => item.extent).filter(Boolean);
    setOverlayVisibility(projectLayer.getVisible());

    // Fit again when overlays arrive so they are inside the initial view.
    if (projectLayer.getVisible()) {
      zoomDone = false;
      if (fitTimeoutId) {
        clearTimeout(fitTimeoutId);
        fitTimeoutId = null;
      }
      scheduleFit();
    }
  } catch (error) {
    console.error('Failed to load project KML overlays:', error);
  }
};

const loadProjectSourceFromEntry = async (entry, loadToken) => {
  projectSource.clear(true);
  if (!entry?.url) return;

  try {
    const { kmlText } = await loadKmlPayload(entry.url);
    if (loadToken && loadToken !== projectLoadToken) return;
    const features = projectKmlFormat.readFeatures(kmlText, {
      dataProjection: 'EPSG:4326',
      featureProjection: map.getView().getProjection()
    });
    if (loadToken && loadToken !== projectLoadToken) return;
    projectSource.addFeatures(features);
  } catch (error) {
    console.error('Failed to load project KML source:', error);
  }
};

const scheduleFit = () => {
  if (zoomDone) return;

  const extent = projectSource.getExtent();
  const hasFeatures = !ol.extent.isEmpty(extent);
  const overlayExtent = mergeOverlayExtent();

  let combinedExtent = null;
  if (hasFeatures) {
    combinedExtent = ol.extent.clone(extent);
  }
  if (overlayExtent) {
    combinedExtent = combinedExtent ? ol.extent.extend(combinedExtent, overlayExtent) : ol.extent.clone(overlayExtent);
  }

  if (combinedExtent && !ol.extent.isEmpty(combinedExtent)) {
    map.getView().fit(combinedExtent, {
      duration: 1000,
      padding: [30, 30, 30, 30],
      maxZoom: 20
    });
    zoomDone = true;
    fitTimeoutId = null;
    return;
  }

  fitTimeoutId = setTimeout(scheduleFit, 120);
};

const resolveMediaPath = (value, basePath = '/media/') => {
  if (!value) return '';
  if (/^https?:\/\//i.test(value) || value.startsWith('/')) return value;
  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const joined = `${normalizedBase}${value}`.replace(/\/{2,}/g, '/');
  return joined.startsWith('/') ? joined : `/${joined}`;
};

const parseManifestEntries = (payload, manifestUrl = '/media/') => {
  const basePath = manifestUrl.replace(/[^/]*$/, '');
  const rawList = Array.isArray(payload) ? payload : Array.isArray(payload?.files) ? payload.files : [];
  if (!rawList.length) return null;

  return rawList
    .map((item) => {
      if (typeof item === 'string') {
        return { url: resolveMediaPath(item, basePath), label: labelFromUrl(item) };
      }
      if (item && typeof item === 'object') {
        const urlValue = item.url || item.name || item.file;
        return urlValue ? { ...item, url: resolveMediaPath(urlValue, basePath) } : null;
      }
      return null;
    })
    .filter(Boolean);
};

const fetchManifestList = async (manifestUrl) => {
  try {
    const response = await fetch(manifestUrl, { cache: 'no-store' });
    if (!response.ok) return null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('text/html')) return null;
    const payload = await response.json();
    return parseManifestEntries(payload, manifestUrl);
  } catch (error) {
    console.warn('Project manifest fetch failed:', error);
    return null;
  }
};

const fetchDirectoryListing = async (mediaPath = '/media/') => {
  try {
    const response = await fetch(mediaPath, { cache: 'no-store' });
    if (!response.ok) return null;
    const html = await response.text();
    const matches = [...html.matchAll(/href="([^"]+\.(?:kml|kmz))"/gi)];
    if (!matches.length) return null;

    const seen = new Set();
    return matches
      .map((match) => decodeURIComponent(match[1]))
      .filter((href) => !href.startsWith('../'))
      .map((href) => {
        if (/^https?:\/\//i.test(href) || href.startsWith('/')) return href;
        return resolveMediaPath(href, mediaPath);
      })
      .filter((url) => {
        if (seen.has(url)) return false;
        seen.add(url);
        return true;
      })
      .map((url) => ({ url }));
  } catch (error) {
    console.warn('Media directory scan failed:', error);
    return null;
  }
};

const discoverKmlEntriesFromMedia = async () => {
  const manifestCandidates =
    (Array.isArray(window.PROJECT_KML_MANIFESTS) && window.PROJECT_KML_MANIFESTS.length
      ? window.PROJECT_KML_MANIFESTS
      : ['/media/manifest.json', '/media/index.json']);

  for (const manifestUrl of manifestCandidates) {
    const manifestEntries = await fetchManifestList(manifestUrl);
    if (manifestEntries?.length) return manifestEntries;
  }

  const directoryEntries = await fetchDirectoryListing('/media/');
  if (directoryEntries?.length) return directoryEntries;
  return null;
};

const setProjectVisibility = (visible) => {
  projectLayer.setVisible(visible);
  setOverlayVisibility(visible);

  if (visible && !zoomDone) {
    if (fitTimeoutId) {
      clearTimeout(fitTimeoutId);
      fitTimeoutId = null;
    }
    scheduleFit();
  }
};

const loadKmlVersion = async (versionId, { forceReload = false } = {}) => {
  const nextEntry = projectKmlEntries.find((entry) => entry.id === versionId);
  if (!nextEntry) return;

  const unchanged =
    activeEntry &&
    nextEntry.url === activeEntry.url &&
    nextEntry.id === activeEntry.id;
  if (unchanged && !forceReload) {
    activeEntry = nextEntry;
    if (projectVersionSelect) {
      projectVersionSelect.value = nextEntry.id;
    }
    return;
  }

  const loadToken = ++projectLoadToken;
  activeEntry = nextEntry;
  zoomDone = false;
  if (fitTimeoutId) {
    clearTimeout(fitTimeoutId);
    fitTimeoutId = null;
  }

  await Promise.all([
    loadProjectSourceFromEntry(activeEntry, loadToken),
    loadProjectOverlays(activeEntry, loadToken)
  ]);

  if (loadToken !== projectLoadToken) return;

  if (projectLayer.getVisible()) {
    scheduleFit();
  }
};

const refreshProjectListFromMedia = async () => {
  const discoveredEntries = await discoverKmlEntriesFromMedia();
  if (!discoveredEntries?.length) return;

  const normalized = normalizeKmlEntries(discoveredEntries);
  if (!normalized.length) return;

  const previousActive = activeEntry;
  projectKmlEntries = normalized;
  const nextActive =
    (previousActive && normalized.find((entry) => entry.id === previousActive.id)) ||
    normalized[0];

  activeEntry = nextActive;
  populateProjectSelect(projectKmlEntries);

  if (!previousActive || nextActive.url !== previousActive.url) {
    await loadKmlVersion(nextActive.id, { forceReload: true });
  } else if (projectVersionSelect) {
    projectVersionSelect.value = nextActive.id;
  }
};

if (projectVersionSelect) {
  populateProjectSelect(projectKmlEntries);
  projectVersionSelect.addEventListener('change', (event) => {
    loadKmlVersion(event.target.value).catch((error) => {
      console.error('Project KML load failed:', error);
    });
  });
}

if (projectToggle) {
  projectToggle.addEventListener('change', function () {
    setProjectVisibility(this.checked);
  });

  // Varsayılan olarak en güncel KML açık gelsin
  projectToggle.checked = true;
  setProjectVisibility(true);
}

loadKmlVersion(activeEntry?.id || projectKmlEntries[0]?.id, { forceReload: true }).catch((error) => {
  console.error('Initial project KML load failed:', error);
});
refreshProjectListFromMedia();
