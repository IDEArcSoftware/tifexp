import { setupKMLImport } from './importKML.js';

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

document.getElementById('basemapToggle').addEventListener('change', function () {
  const useSatellite = this.value === 'satellite';
  satelliteLayer.setVisible(useSatellite);
  labelLayer.setVisible(useSatellite);
  streetLayer.setVisible(!useSatellite);
});

// 3) WMS katmanını ekle (wms.js içinde global addGeoServerWMSLayer tanımlı)
addGeoServerWMSLayer(map);

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
