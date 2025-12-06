import { renderKmlGroundOverlays } from './kmlGroundOverlays.js';

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

      reader.onload = async function (e) {
        try {
          const isKmz = file.name.toLowerCase().endsWith('.kmz');
          let kmlString = '';
          let zipArchive = null;

          if (isKmz) {
            // KMZ ise: ZIP'ten çıkar
            zipArchive = await JSZip.loadAsync(e.target.result);
            const kmlFile = Object.values(zipArchive.files).find((f) => f.name.toLowerCase().endsWith('.kml'));
            if (!kmlFile) {
              throw new Error('A .kml error occurred in the KMZ file.');
            }
            kmlString = await kmlFile.async('string');
          } else {
            // KML ise doğrudan işle
            kmlString = e.target.result;
          }

          const format = new ol.format.KML();
          const features = format.readFeatures(kmlString, {
            dataProjection: 'EPSG:4326',
            featureProjection: map.getView().getProjection()
          });

          const overlayResults = await renderKmlGroundOverlays(map, kmlString, { zipArchive });
          const overlayExtents = overlayResults.map((entry) => entry.extent).filter(Boolean);
          addFeaturesToMap(features, overlayExtents);
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

  function addFeaturesToMap(features, overlayExtents = []) {
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

    // ✅ Otomatik zoom: hem vektör hem overlay alanını dikkate al
    const overlayBounds = overlayExtents.filter((ext) => ext && !ol.extent.isEmpty(ext));
    const featureExtent = vectorSource.getExtent();
    const hasFeatures = features.length && featureExtent && !ol.extent.isEmpty(featureExtent);

    let combinedExtent = null;
    if (hasFeatures) {
      combinedExtent = ol.extent.clone(featureExtent);
    }
    overlayBounds.forEach((ext) => {
      combinedExtent = combinedExtent ? ol.extent.extend(combinedExtent, ext) : ol.extent.clone(ext);
    });

    if (combinedExtent && !ol.extent.isEmpty(combinedExtent)) {
      map.getView().fit(combinedExtent, { padding: [50, 50, 50, 50], duration: 1000 });
    }
  }
}
