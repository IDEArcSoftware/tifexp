import { map } from './map.js';
import { renderKmlGroundOverlays } from './kmlGroundOverlays.js';

// Kullanılabilir KML sürümlerini topla
const normalizeKmlEntries = (entries) => {
  return entries
    .filter((item) => item && item.url)
    .map((item, index) => ({
      id: item.id || `kml-${index}`,
      label: item.label || item.id || item.url,
      url: item.url
    }));
};

const fallbackKmlList = normalizeKmlEntries([
  { id: 'latest', label: 'Latest project data', url: '/media/251205_doc.kml' },
  { id: '2025-11-V18', label: 'November 2025 V18', url: '/media/doc.kml' }
]);

const projectKmlEntries = (() => {
  const userList = Array.isArray(window.PROJECT_KML_LIST)
    ? normalizeKmlEntries(window.PROJECT_KML_LIST)
    : [];
  return userList.length ? userList : fallbackKmlList;
})();

let activeEntry = projectKmlEntries[0];
let projectOverlayLayers = [];
let projectOverlayExtents = [];

// KML kaynağı
const projectSource = new ol.source.Vector({
  url: activeEntry.url,
  format: new ol.format.KML()
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

const clearProjectOverlays = () => {
  projectOverlayLayers.forEach((layer) => map.removeLayer(layer));
  projectOverlayLayers = [];
  projectOverlayExtents = [];
};

const setOverlayVisibility = (visible) => {
  projectOverlayLayers.forEach((layer) => layer.setVisible(visible));
};

const mergeOverlayExtent = () => {
  if (!projectOverlayExtents.length) return null;
  return projectOverlayExtents.reduce((acc, ext) => {
    if (!acc) return ol.extent.clone(ext);
    return ol.extent.extend(acc, ext);
  }, null);
};

const loadProjectOverlays = async (entry) => {
  clearProjectOverlays();
  if (!entry?.url) return;

  try {
    const response = await fetch(entry.url);
    if (!response.ok) {
      throw new Error(`Failed to fetch KML (${response.status})`);
    }
    const kmlText = await response.text();
    const overlayResults = await renderKmlGroundOverlays(map, kmlText, {
      baseHref: entry.url
    });
    projectOverlayLayers = overlayResults.map((item) => item.layer);
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

const loadKmlVersion = (versionId) => {
  const nextEntry = projectKmlEntries.find((entry) => entry.id === versionId);
  if (!nextEntry || nextEntry.url === activeEntry.url) return;

  activeEntry = nextEntry;
  zoomDone = false;
  if (fitTimeoutId) {
    clearTimeout(fitTimeoutId);
    fitTimeoutId = null;
  }

  projectSource.clear(true);
  projectSource.setUrl(activeEntry.url);
  projectSource.refresh();
  loadProjectOverlays(activeEntry);

  if (projectLayer.getVisible()) {
    scheduleFit();
  }
};

if (projectVersionSelect) {
  const fragment = document.createDocumentFragment();
  projectKmlEntries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = entry.id;
    option.textContent = entry.label;
    fragment.appendChild(option);
  });

  projectVersionSelect.appendChild(fragment);
  projectVersionSelect.value = activeEntry.id;
  projectVersionSelect.disabled = projectKmlEntries.length < 2;

  projectVersionSelect.addEventListener('change', (event) => {
    loadKmlVersion(event.target.value);
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

loadProjectOverlays(activeEntry);
