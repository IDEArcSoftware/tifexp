// importKML.js
// KML/KMZ dosyalarını haritaya import etmek için global ol nesnesiyle çalışan sürüm
// KMZ için JSZip kütüphanesinin yüklü olması gerekir:
// https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js

/**
 * KML/KMZ import işlevini kurar:
 * @param {string} fileInputId   HTML'de <input type="file"> elemanının id'si
 * @param {string} importButtonId KML/KMZ seçimi tetikleyen butonun id'si
 * @param {ol.Map} map            OpenLayers harita nesnesi
 */
export function setupKMLImport(fileInputId, importButtonId, map) {
  const fileInput = document.getElementById(fileInputId);
  const importBtn = document.getElementById(importButtonId);

  importBtn.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', function (event) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();

      reader.onload = function (e) {
        try {
          let kmlText = e.target.result;
          let features = [];

          if (file.name.toLowerCase().endsWith('.kmz')) {
            // KMZ ise: ZIP'ten çıkar
            const zip = new JSZip();
            zip.loadAsync(kmlText)
              .then(zip => {
                const kmlFile = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith('.kml'));
                if (kmlFile) {
                  return kmlFile.async('string');
                } else {
                  throw new Error('A .kml error occurred in the KMZ file.');
                }
              })
              .then(kmlString => {
                const format = new ol.format.KML();
                features = format.readFeatures(kmlString, {
                  dataProjection: 'EPSG:4326',
                  featureProjection: map.getView().getProjection()
                });
                addFeaturesToMap(features);
              })
              .catch(err => {
                alert("Failed to read KMZ file: " + err.message);
              });
          } else {
            // KML ise doğrudan işle
            const format = new ol.format.KML();
            features = format.readFeatures(kmlText, {
              dataProjection: 'EPSG:4326',
              featureProjection: map.getView().getProjection()
            });
            addFeaturesToMap(features);
          }

          function addFeaturesToMap(features) {
            const vectorSource = new ol.source.Vector({ features: features });

            const vectorLayer = new ol.layer.Vector({
              source: vectorSource,
              style: new ol.style.Style({
                stroke: new ol.style.Stroke({ color: '#ff0000', width: 2 }),
                fill: new ol.style.Fill({ color: 'rgba(255, 0, 0, 0.1)' }),
                image: new ol.style.Circle({
                  radius: 5,
                  fill: new ol.style.Fill({ color: '#ff0000' }),
                  stroke: new ol.style.Stroke({ color: '#fff', width: 1 })
                })
              })
            });

            map.addLayer(vectorLayer);

            // ✅ Otomatik zoom:
            const extent = vectorSource.getExtent();
            if (extent && !ol.extent.isEmpty(extent)) {
              map.getView().fit(extent, { padding: [50, 50, 50, 50], duration: 1000 });
            }
          }
        } catch (error) {
          alert("File could not be loaded: " + error.message);
        }
      };

      if (file.name.toLowerCase().endsWith('.kmz')) {
        reader.readAsArrayBuffer(file);
      } else {
        reader.readAsText(file);
      }
    }
  });
}
