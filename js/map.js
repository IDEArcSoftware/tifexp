import { setupKMLImport } from './importKML.js';

// 1) Harita nesnesini oluştur
export const map = new ol.Map({
  target: 'map',
  layers: [
    // Sokak katmanı (başlangıçta gizli)
    new ol.layer.Tile({
      source: new ol.source.OSM(),
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

// 2) Basemap toggle kontrolü
let userSwitchedManually = false;
// layers[0] = street, layers[1] = satellite, layers[2] = labels
const streetLayer    = map.getLayers().item(0);
const satelliteLayer = map.getLayers().item(1);
const labelLayer     = map.getLayers().item(2);

document.getElementById('basemapToggle').addEventListener('change', function () {
  userSwitchedManually = true;
  if (this.value === 'satellite') {
    satelliteLayer.setVisible(true);
    labelLayer.setVisible(true);
    streetLayer.setVisible(false);
  } else {
    satelliteLayer.setVisible(false);
    labelLayer.setVisible(false);
    streetLayer.setVisible(true);
  }
});

// 3) Zoom’a bağlı otomatik geçiş
map.getView().on('change:resolution', function () {
  const zoom = map.getView().getZoom();

  if (zoom > 18) {
    // Çok büyüdü: sokak haritasına geç
    if (satelliteLayer.getVisible()) {
      satelliteLayer.setVisible(false);
      labelLayer.setVisible(false);
      streetLayer.setVisible(true);
      document.getElementById('basemapToggle').value = 'street';
      userSwitchedManually = false;
    }
  } else {
    // Yeterince küçüldü: uyduya dön (manuel değiştirme yoksa)
    if (!satelliteLayer.getVisible() && !userSwitchedManually) {
      satelliteLayer.setVisible(true);
      labelLayer.setVisible(true);
      streetLayer.setVisible(false);
      document.getElementById('basemapToggle').value = 'satellite';
    }
  }
});

// 4) WMS katmanını ekle (wms.js içinde global addGeoServerWMSLayer tanımlı)
addGeoServerWMSLayer(map);

setupKMLImport('kmlInput', 'kmlImportBtn', map);

// Panel collapse / expand
const controlPanel = document.getElementById('controlPanel');
const panelBody = controlPanel?.querySelector('.panel-body');
const panelToggle = document.getElementById('panelToggle');

if (controlPanel && panelBody && panelToggle) {
  let userToggled = false;

  const setCollapsed = (collapsed) => {
    controlPanel.classList.toggle('collapsed', collapsed);
    panelBody.hidden = collapsed;
    panelToggle.setAttribute('aria-expanded', String(!collapsed));
    panelToggle.textContent = collapsed ? 'Show' : 'Hide';
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
