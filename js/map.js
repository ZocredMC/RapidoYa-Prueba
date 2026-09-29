import { 
  TARIFA_BASE_MINIMA, 
  COSTO_KM_ADICIONAL_URBANO, 
  TARIFA_BASE_INTERMUNICIPAL, 
  COSTO_KM_INTERMUNICIPAL 
} from './config.js';

let map = null;
let routeLayer = null;

export function inicializarMapa(elementId) {
  map = L.map(elementId).setView([4.084, -76.198], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap'
  }).addTo(map);
  return map;
}

export async function cotizarRuta(origenSector, destinoSector) {
  const queryOrigen = `${origenSector}, Tulua, Valle del Cauca, Colombia`;
  const queryDestino = `${destinoSector}, Tulua, Valle del Cauca, Colombia`;

  const [resOrigen, resDestino] = await Promise.all([
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryOrigen)}`),
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(queryDestino)}`)
  ]);

  const dataOrigen = await resOrigen.json();
  const dataDestino = await resDestino.json();

  if (!dataOrigen.length || !dataDestino.length) {
    throw new Error("No se ubicó alguno de los barrios en Tuluá. Verifica la escritura.");
  }

  const coordA = [dataOrigen[0].lon, dataOrigen[0].lat];
  const coordB = [dataDestino[0].lon, dataDestino[0].lat];

  const routeRes = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${coordA[0]},${coordA[1]};${coordB[0]},${coordB[1]}?overview=full&geometries=geojson`
  );
  const routeData = await routeRes.json();

  if (!routeData.routes || !routeData.routes.length) {
    throw new Error("No fue posible trazar la ruta entre los puntos especificados.");
  }

  const distanciaKm = parseFloat((routeData.routes[0].distance / 1000).toFixed(1));
  let precio = TARIFA_BASE_MINIMA;

  if (distanciaKm > 2 && distanciaKm <= 6) {
    precio = TARIFA_BASE_MINIMA + Math.ceil(distanciaKm - 2) * COSTO_KM_ADICIONAL_URBANO;
  } else if (distanciaKm > 6) {
    precio = TARIFA_BASE_INTERMUNICIPAL + Math.ceil(distanciaKm - 6) * COSTO_KM_INTERMUNICIPAL;
  }

  // Trazar línea en el mapa
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = L.geoJSON(routeData.routes[0].geometry, { style: { color: '#00ff88', weight: 5 } }).addTo(map);
  map.fitBounds(routeLayer.getBounds());

  return { origen: origenSector, destino: destinoSector, distanciaKm, precio };
}

export function limpiarMapa() {
  if (routeLayer && map) {
    map.removeLayer(routeLayer);
    routeLayer = null;
  }
  if (map) {
    map.setView([4.084, -76.198], 13);
  }
}
