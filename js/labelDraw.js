import {
    createOverlay,
    segmentLabels,
    dynamicLabels
  } from './labelUtils.js';
  
  function labelDistance(line, isDynamic = false) {
    const coords = line.getCoordinates();
    let total = 0;
    const target = isDynamic ? dynamicLabels : segmentLabels;
  
    for (let i = 1; i < coords.length; i++) {
      const seg = new ol.geom.LineString([coords[i - 1], coords[i]]);
      const len = ol.sphere.getLength(seg);
      total += len;
      const mid = [
        (coords[i - 1][0] + coords[i][0]) / 2,
        (coords[i - 1][1] + coords[i][1]) / 2
      ];
      const txt = len > 100 ? (len / 1000).toFixed(2) + ' km' : len.toFixed(2) + ' m';
      createOverlay(mid, txt, 'segment-label', target);
    }
  
    const last = coords[coords.length - 1];
    const totalTxt = total > 100
      ? `Total: ${(total / 1000).toFixed(2)} km`
      : `Total: ${total.toFixed(2)} m`;
    createOverlay(last, totalTxt, 'total-label', target);
  }
  
  function labelArea(polygon, isDynamic = false) {
    const coords = polygon.getCoordinates()[0];
    let perimeter = 0;
    const target = isDynamic ? dynamicLabels : segmentLabels;
  
    for (let i = 1; i < coords.length; i++) {
      const seg = new ol.geom.LineString([coords[i - 1], coords[i]]);
      const len = ol.sphere.getLength(seg);
      perimeter += len;
      const mid = [
        (coords[i - 1][0] + coords[i][0]) / 2,
        (coords[i - 1][1] + coords[i][1]) / 2
      ];
      const txt = len > 100 ? (len / 1000).toFixed(2) + ' km' : len.toFixed(2) + ' m';
      createOverlay(mid, txt, 'segment-label', target);
    }
  
    const area = ol.sphere.getArea(polygon);
    const interior = polygon.getInteriorPoint().getCoordinates();
    const areaTxt = area > 10000
      ? `Area: ${(area / 1000000).toFixed(2)} km²<br>Perimeter: ${(perimeter / 1000).toFixed(2)} km`
      : `Area: ${area.toFixed(2)} m²<br>Perimeter: ${perimeter.toFixed(2)} m`;
    createOverlay(interior, areaTxt, 'total-label', target);
  }
  
  export { labelDistance, labelArea };
  