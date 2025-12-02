// js/measureControl.js

import { map } from './map.js';
import { measureSource } from './measureSource.js';
import {
  createOverlay, clearDynamicLabels, clearAllLabels,
  segmentLabels, dynamicLabels
} from './labelUtils.js';
import { labelDistance, labelArea } from './labelDraw.js';

let drawInteraction, drawListener;

export function addInteraction(type) {
  // Önceki interaction dinleyicilerini temizle
  if (drawListener) { ol.Observable.unByKey(drawListener); drawListener = null; }
  if (drawInteraction) { map.removeInteraction(drawInteraction); drawInteraction = null; }

  clearDynamicLabels();

  // Burada style: … kısmını tamamen çıkarıyoruz
  drawInteraction = new ol.interaction.Draw({
    source: measureSource,
    type: type
  });
  map.addInteraction(drawInteraction);

  drawListener = drawInteraction.on('drawstart', evt => {
    drawListener = evt.feature.getGeometry().on('change', e => {
      clearDynamicLabels();
      type === 'LineString'
        ? labelDistance(e.target, true)
        : labelArea(e.target, true);
    });
  });

  drawInteraction.on('drawend', () => {
    dynamicLabels.forEach(ov => segmentLabels.push(ov));
    dynamicLabels.length = 0;
    map.removeInteraction(drawInteraction);
    drawInteraction = null;
  });
}

// Butonlara bağlama
document.getElementById('measureLength')
  .addEventListener('click', () => addInteraction('LineString'));
document.getElementById('measureArea')
  .addEventListener('click', () => addInteraction('Polygon'));
document.getElementById('measureClear')
  .addEventListener('click', () => {
    measureSource.clear();
    clearDynamicLabels();
    clearAllLabels();
  });
