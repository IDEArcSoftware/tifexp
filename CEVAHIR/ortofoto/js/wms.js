// wms.js
// GeoServer WMS katmanını haritaya eklemek için fonksiyon
function addGeoServerWMSLayer(map) {
    const wmsLayer = new ol.layer.Tile({
      source: new ol.source.TileWMS({
        url: 'https://cbs.ulkeharita.com.tr/geoserver/cevahir-libyabengazi/wms',
        params: {
          'LAYERS': 'cevahir-libyabengazi:cevahir-libya-bengazi-yol-etaplar',
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
  