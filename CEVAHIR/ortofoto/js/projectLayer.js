import { map } from './map.js';

// KML kaynağı
const projectSource = new ol.source.Vector({
  url: 'veri/project/libya-bengazi-cevahir-yol-27092025.kml',
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

// Checkbox kontrolü
document.getElementById('toggleProjectLayer').addEventListener('change', function () {
  const visible = this.checked;
  projectLayer.setVisible(visible);

  if (visible && !zoomDone) {
    // Kaynak yüklenmişse ve features henüz gelmemişse bekle
    const tryZoom = () => {
      const features = projectSource.getFeatures();
      if (features.length > 0) {
        const extent = projectSource.getExtent();
        if (!ol.extent.isEmpty(extent)) {
          map.getView().fit(extent, {
            duration: 1000,
            padding: [30, 30, 30, 30],
            maxZoom: 20
          });
          zoomDone = true;
        }
      } else {
        // Feature'lar gelmemişse kısa bir süre sonra tekrar dene
        setTimeout(tryZoom, 100);
      }
    };

    tryZoom();
  }
});
