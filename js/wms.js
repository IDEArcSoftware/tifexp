// wms.js
// GeoServer WMS katmanını haritaya eklemek için fonksiyon
function addGeoServerWMSLayer(map) {
    const wmsLayer = new ol.layer.Tile({
      source: new ol.source.TileWMS({
        url: 'https://iws-s.taila00ae4.ts.net/geoserver/benghazi/wms',
        params: {
          'LAYERS': 'benghazi:geotools_coverage,benghazi:geotools_coverage_2',
          'TILED': true
        },
        attributions: ''
      })
    });
    map.addLayer(wmsLayer);
    return wmsLayer;
  }
  
  // Harita oluşturulduktan sonra wms katmanını ekleyin
  // Örneğin map.js içinde:
  // addGeoServerWMSLayer(map);
  
  // Veya sayfa yüklendiğinde otomatik çağırmak için:
  // document.addEventListener('DOMContentLoaded', function() {
  //   addGeoServerWMSLayer(map);
  //});
  
