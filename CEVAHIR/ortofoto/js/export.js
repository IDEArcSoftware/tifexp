// js/export.js

import { measureSource } from './measureSource.js';

export function exportMeasurements() {
  const features = measureSource.getFeatures();
  if (!features.length) {
    alert("No measurements found to export.");
    return;
  }

  // Her feature için ölçüm detaylarını hesapla ve özellik olarak ekle
  features.forEach(feature => {
    const geom = feature.getGeometry();
    const type = geom.getType();
    const props = {};
    const segmentData = [];
    let totalLength = 0;

    if (type === 'LineString') {
      // Mesafe ölçümü: segment uzunlukları + toplam uzunluk
      const coords = geom.getCoordinates();
      for (let i = 1; i < coords.length; i++) {
        const segGeom = new ol.geom.LineString([coords[i-1], coords[i]]);
        const len = ol.sphere.getLength(segGeom);
        totalLength += len;
        segmentData.push({
          start: ol.proj.toLonLat(coords[i-1]),
          end:   ol.proj.toLonLat(coords[i]),
          length_m: len
        });
      }
      props.measurement_type = 'LineString';
      props.segment_data = segmentData;
      props.total_length_m = totalLength;

    } else if (type === 'Polygon') {
      // Alan ölçümü: kenar uzunlukları, toplam çevre ve toplam alan
      const ring = geom.getCoordinates()[0];
      for (let i = 1; i < ring.length; i++) {
        const segGeom = new ol.geom.LineString([ring[i-1], ring[i]]);
        const len = ol.sphere.getLength(segGeom);
        totalLength += len;
        segmentData.push({
          start: ol.proj.toLonLat(ring[i-1]),
          end:   ol.proj.toLonLat(ring[i]),
          length_m: len
        });
      }
      const area = ol.sphere.getArea(geom);
      props.measurement_type = 'Polygon';
      props.segment_data = segmentData;
      props.perimeter_m = totalLength;
      props.area_m2 = area;
    }

    // Özellikleri feature'a set et
    Object.keys(props).forEach(key => {
      feature.set(key, props[key]);
    });
  });

  // GeoJSON çıktısı hazırla
  const format = new ol.format.GeoJSON();
  const geojson = format.writeFeatures(features, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  });

  // Dosya olarak indir
  const blob = new Blob([geojson], { type: 'application/json;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'measurements.geojson';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Buton dinleyici
document.getElementById('exportGeojson')
  .addEventListener('click', exportMeasurements);
