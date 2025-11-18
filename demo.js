// mapa
const map = L.map('map').setView([50, 0], 3);

L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

// rad do stupne, stupne do rad
const toRad = d => d * Math.PI / 180;
const toDeg = r => r * 180 / Math.PI;

// prevod na polarni souradnice
function latLngToVec3(lat, lon){
  const φ = toRad(lat), λ = toRad(lon);
  const x = Math.cos(φ) * Math.cos(λ);
  const y = Math.cos(φ) * Math.sin(λ);
  const z = Math.sin(φ);
  return { x, y, z };
}

// prevod na XYZ
function vec3ToLatLng({x,y,z}){
  const r = Math.hypot(x,y,z);
  const X = x / r, Y = y / r, Z = z / r;
  const lat = toDeg(Math.asin(Z));
  const lon = toDeg(Math.atan2(Y, X));
  return [lat, lon];
}

// interpolace - body pro vykresleni ortodromy
function slerp(a,b,t){
  const dot = Math.max(-1, Math.min(1, a.x*b.x + a.y*b.y + a.z*b.z));
  const θ = Math.acos(dot);
  if (θ === 0) return a;
  const s1 = Math.sin((1-t)*θ) / Math.sin(θ);
  const s2 = Math.sin(t*θ) / Math.sin(θ);
  return { x: a.x*s1 + b.x*s2, y: a.y*s1 + b.y*s2, z: a.z*s1 + b.z*s2 };
}

// vykresleni ortodromy - fce
function drawOrthodrome(map, start, end, options = {}){
  const a = L.latLng(start);
  const b = L.latLng(end);
  if (a.equals(b)) return;

  const n = options.segments ?? 256;
  const va = latLngToVec3(a.lat, a.lng);
  const vb = latLngToVec3(b.lat, b.lng);

  const pts = [];
  for (let i = 0; i <= n; i++){
    const t = i / n;
    const v = slerp(va, vb, t);
    const [lat, lon] = vec3ToLatLng(v);
    pts.push([lat, lon]);
  }

  return L.polyline(pts, options).addTo(map);
}

// pocatecni a koncovy bod
const prague = [50.0755, 14.4378];
const newyork = [40.7128, -74.0060];

// puntik na mape
L.marker(prague).addTo(map).bindPopup('Praha');
L.marker(newyork).addTo(map).bindPopup('New York');

// volani fce
drawOrthodrome(map, prague, newyork, {
  color: 'red',
  weight: 3,
  segments: 300
}).bindPopup('Ortodroma');
