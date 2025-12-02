// js/exportKML.js

import { measureSource } from './measureSource.js';

export function exportMeasurementsKML() {
  const features = measureSource.getFeatures();
  if (!features.length) {
    alert("No measurements found to export.");
    return;
  }

  features.forEach(feature => {
    const geom = feature.getGeometry();
    const type = geom.getType();
    let description = '';
    let totalLength = 0;
    let segmentInfo = '';

    if (type === 'LineString') {
      const coords = geom.getCoordinates();
      for (let i = 1; i < coords.length; i++) {
        const segGeom = new ol.geom.LineString([coords[i - 1], coords[i]]);
        const len = ol.sphere.getLength(segGeom);
        totalLength += len;
        segmentInfo += `• ${i}. Segment: ${len.toFixed(2)} m\n`;
      }
      description += `Measurement Type: Distance (Line)\nTotal Length: ${totalLength.toFixed(2)} m\n${segmentInfo}`;
    }

    if (type === 'Polygon') {
      const ring = geom.getCoordinates()[0];
      for (let i = 1; i < ring.length; i++) {
        const segGeom = new ol.geom.LineString([ring[i - 1], ring[i]]);
        const len = ol.sphere.getLength(segGeom);
        totalLength += len;
        segmentInfo += `• ${i}. Edge: ${len.toFixed(2)} m\n`;
      }
      const area = ol.sphere.getArea(geom);
      description += `Measurement Type: Area (Polygon)\nArea: ${area.toFixed(2)} m²\nPerimeter: ${totalLength.toFixed(2)} m\n${segmentInfo}`;
    }

    // KML çıktısı için açıklamayı ayarla
    feature.set('name', 'Measurement');
    feature.set('description', description);
  });

  const format = new ol.format.KML({
    extractStyles: true,
    showPointNames: false
  });

  const kml = format.writeFeatures(features, {
    dataProjection: 'EPSG:4326',
    featureProjection: 'EPSG:3857'
  });

  const blob = new Blob([kml], {
    type: 'application/vnd.google-earth.kml+xml;charset=utf-8'
  });

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'measurement.kml';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

document.getElementById('exportKML')
  .addEventListener('click', exportMeasurementsKML);
