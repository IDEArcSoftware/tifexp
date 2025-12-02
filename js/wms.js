// wms.js
// GeoServer WMS katmanını haritaya eklemek için fonksiyon
function addGeoServerWMSLayer(map) {
    const wmsLayer = new ol.layer.Tile({
      source: new ol.source.TileWMS({
        url: 'http://78.188.214.83:8181/geoserver/benghazi/wms',
        params: {
          'LAYERS': 'benghazi:geotools_coverage',
          'TILED': true
        },
        attributions: ''
      })
    });
    map.addLayer(wmsLayer);
  }
  
  // Harita oluşturulduktan sonra wms katmanını ekleyin
  // Örneğin map.js içinde:
  // addGeoServerWMSLayer(map);
  
  // Veya sayfa yüklendiğinde otomatik çağırmak için:
  // document.addEventListener('DOMContentLoaded', function() {
  //   addGeoServerWMSLayer(map);
  //});
  