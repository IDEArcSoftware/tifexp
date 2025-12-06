import { setupKMLImport } from './importKML.js';
import { renderKmlGroundOverlays } from './kmlGroundOverlays.js';

const MAPTILER_KEY = window.MAPTILER_KEY || '';
const maptilerAttributions = [
  '<a href="https://www.maptiler.com/copyright/" target="_blank">© MapTiler</a>',
  '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>'
];
const osmAttribution = '<a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap contributors</a>';

const streetSource = MAPTILER_KEY
  ? new ol.source.XYZ({
      url: `https://api.maptiler.com/maps/streets-v2/256/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
      tileSize: 256,
      attributions: maptilerAttributions,
      maxZoom: 20,
      crossOrigin: 'anonymous'
    })
  : new ol.source.OSM({
      attributions: osmAttribution,
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      crossOrigin: 'anonymous'
    });

const basemapKmlUrl = window.BASEMAP_KMZ_URL || '/media/basemap.kmz';
const basemapKmlFormat = new ol.format.KML();

// 1) Harita nesnesini oluştur
export const map = new ol.Map({
  target: 'map',
  layers: [
    // Sokak katmanı (başlangıçta gizli)
    new ol.layer.Tile({
      source: streetSource,
      visible: false
    }),

    // Uydu katmanı (başlangıçta görünür)
    new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        maxZoom: 19
      }),
      visible: true
    }),

    // Etiket katmanı (sadece uyduyla birlikte görünür)
    new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      }),
      visible: true
    })
    // Ölçüm katmanını measureSource.js kendisi ekleyecek
  ],
  view: new ol.View({
    center: ol.proj.fromLonLat([20.201344, 32.048945]),
    zoom: 13,
    minZoom: 4,
    maxZoom: 23
  })
});

// 2) Basemap toggle kontrolü (kullanıcı değiştirene kadar uydu açık kalsın)
// layers[0] = street, layers[1] = satellite, layers[2] = labels
const streetLayer    = map.getLayers().item(0);
const satelliteLayer = map.getLayers().item(1);
const labelLayer     = map.getLayers().item(2);

const basemapSource = new ol.source.Vector();
const basemapLayer = new ol.layer.Vector({
  source: basemapSource,
  visible: false,
  style: new ol.style.Style({
    stroke: new ol.style.Stroke({ color: '#4a90e2', width: 1 }),
    fill: new ol.style.Fill({ color: 'rgba(74, 144, 226, 0.08)' })
  })
});
basemapLayer.setZIndex(1);
map.addLayer(basemapLayer);

let basemapOverlayLayers = [];
let basemapLoadToken = 0;
let basemapPayloadPromise = null;

const clearBasemapOverlays = () => {
  basemapOverlayLayers.forEach((layer) => map.removeLayer(layer));
  basemapOverlayLayers = [];
};

const setBasemapVisibility = (visible) => {
  basemapLayer.setVisible(visible);
  basemapOverlayLayers.forEach((layer) => layer.setVisible(visible));
};

const findZipKmlFile = (zipArchive) => {
  if (!zipArchive) return null;
  const entries = Object.values(zipArchive.files || {});
  return entries.find((f) => f.name?.toLowerCase().endsWith('.kml')) || null;
};

const loadBasemapPayload = async () => {
  if (basemapPayloadPromise) return basemapPayloadPromise;

  basemapPayloadPromise = (async () => {
    const isKmz = /\.kmz(?:$|[?#])/i.test(basemapKmlUrl);
    const response = await fetch(basemapKmlUrl, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Basemap fetch failed (${response.status})`);
    }

    if (!isKmz) {
      const kmlText = await response.text();
      return { kmlText, zipArchive: null };
    }

    if (typeof JSZip === 'undefined') {
      throw new Error('JSZip is required to load basemap KMZ.');
    }

    const buffer = await response.arrayBuffer();
    const zipArchive = await JSZip.loadAsync(buffer);
    const kmlEntry = findZipKmlFile(zipArchive);
    if (!kmlEntry) {
      throw new Error('basemap.kmz does not contain a .kml file.');
    }
    const kmlText = await kmlEntry.async('string');
    return { kmlText, zipArchive };
  })().catch((error) => {
    basemapPayloadPromise = null;
    throw error;
  });

  return basemapPayloadPromise;
};

const loadKmzBasemap = async () => {
  const token = ++basemapLoadToken;
  setBasemapVisibility(false);
  clearBasemapOverlays();
  basemapSource.clear(true);

  try {
    const { kmlText, zipArchive } = await loadBasemapPayload();
    if (token !== basemapLoadToken) return;

    const features = basemapKmlFormat.readFeatures(kmlText, {
      dataProjection: 'EPSG:4326',
      featureProjection: map.getView().getProjection()
    });
    if (token !== basemapLoadToken) return;
    basemapSource.addFeatures(features);

    const overlayResults = await renderKmlGroundOverlays(map, kmlText, {
      baseHref: basemapKmlUrl,
      zipArchive,
      zIndex: 1
    });
    if (token !== basemapLoadToken) return;
    basemapOverlayLayers = overlayResults.map((entry) => entry.layer);
    setBasemapVisibility(true);
  } catch (error) {
    if (token !== basemapLoadToken) return;
    console.error('Basemap KMZ load failed:', error);
  }
};

const hideKmzBasemap = () => {
  basemapLoadToken++;
  setBasemapVisibility(false);
};

const basemapSelect = document.getElementById('basemapToggle');
const wmsLayer = addGeoServerWMSLayer(map);

const applyBaseChoice = (value) => {
  const useSatellite = value === 'satellite';
  const useStreet = value === 'street';
  const useKmzBasemap = value === 'kmz-basemap';

  satelliteLayer.setVisible(useSatellite);
  labelLayer.setVisible(useSatellite);
  streetLayer.setVisible(useStreet);

  if (wmsLayer) {
    wmsLayer.setVisible(!useKmzBasemap);
  }

  if (useKmzBasemap) {
    loadKmzBasemap();
  } else {
    hideKmzBasemap();
  }
};

if (basemapSelect) {
  applyBaseChoice(basemapSelect.value);
  basemapSelect.addEventListener('change', function () {
    applyBaseChoice(this.value);
  });
}

// 3) WMS katmanını ekle (wms.js içinde global addGeoServerWMSLayer tanımlı)
// addGeoServerWMSLayer(map); -- now captured above

setupKMLImport('kmlInput', 'kmlImportBtn', map);

// Panel collapse / expand
const controlPanel = document.getElementById('controlPanel');
const panelBody = controlPanel?.querySelector('.panel-body');
const panelToggle = document.getElementById('panelToggle');
const panelToggleLabel = panelToggle?.querySelector('.sr-only');

if (controlPanel && panelBody && panelToggle) {
  let userToggled = false;

  const setCollapsed = (collapsed) => {
    controlPanel.classList.toggle('collapsed', collapsed);
    panelBody.hidden = collapsed;
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelToggle.setAttribute('aria-label', collapsed ? 'Show panel' : 'Hide panel');
    panelToggle.dataset.state = collapsed ? 'show' : 'hide';

    if (panelToggleLabel) {
      panelToggleLabel.textContent = collapsed ? 'Show panel' : 'Hide panel';
    }
  };

  const handleResponsive = () => {
    if (!userToggled) {
      setCollapsed(window.innerWidth <= 768);
    }
  };

  panelToggle.addEventListener('click', () => {
    const isCollapsed = controlPanel.classList.contains('collapsed');
    userToggled = true;
    setCollapsed(!isCollapsed);
  });

  handleResponsive();
  window.addEventListener('resize', handleResponsive);
}
