import { Map as LeafletMap, TileLayer } from "leaflet";

// Create a reusable Leaflet base map without coupling it to the Tilia runtime.
export function createBaseMap(containerId, options = {}) {
  const {
    mapOptions = {},
    center = [35.681236, 139.767125],
    zoom = 10,
    tileUrl = "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
    tileOptions = {},
  } = options;

  const map = new LeafletMap(containerId, {
    closePopupOnClick: false,
    zoomControl: true,
    ...mapOptions,
  });

  map.setView(center, zoom);

  const tileLayer = new TileLayer(tileUrl, {
    maxZoom: 19,
    ...tileOptions,
  });
  tileLayer.addTo(map);

  return { map, tileLayer };
}
