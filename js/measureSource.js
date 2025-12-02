// js/measureSource.js
import { map } from './map.js';

export const measureSource = new ol.source.Vector();
const measureLayer = new ol.layer.Vector({
  source: measureSource,
  style: new ol.style.Style({
    fill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.2)' }),
    stroke: new ol.style.Stroke({ color: '#ffcc33', width: 2 }),
    image: new ol.style.Circle({
      radius: 7,
      fill: new ol.style.Fill({ color: '#ffcc33' })
    })
  })
});
map.addLayer(measureLayer);
