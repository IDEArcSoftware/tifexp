import { map } from './map.js';

const segmentLabels = [];
const dynamicLabels = [];

function createOverlay(coordinate, html, className, targetArray) {
  const el = document.createElement('div');
  el.className = className;
  el.innerHTML = html;
  const ov = new ol.Overlay({
    position: coordinate,
    element: el,
    positioning: 'center-center',
    stopEvent: false
  });
  map.addOverlay(ov);
  if (targetArray) targetArray.push(ov);
  return ov;
}

function clearDynamicLabels() {
  dynamicLabels.forEach(ov => map.removeOverlay(ov));
  dynamicLabels.length = 0;
}

function clearAllLabels() {
  segmentLabels.forEach(ov => map.removeOverlay(ov));
  segmentLabels.length = 0;
}

export {
  createOverlay,
  clearDynamicLabels,
  clearAllLabels,
  segmentLabels,
  dynamicLabels
};
