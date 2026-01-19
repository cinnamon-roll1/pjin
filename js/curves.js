window.wrapLon = function(lon){
  return ((lon + 180) % 360 + 360) % 360 - 180;
};

window.mercatorPsi = function(latDeg){
  const φ = toRad(latDeg);
  return Math.log(Math.tan(Math.PI/4 + φ/2));
};

window.invMercatorPsi = function(psi){
  const φ = 2 * Math.atan(Math.exp(psi)) - Math.PI/2;
  return toDeg(φ);
};

// ===== Loxodroma =====
window.rhumbPoints = function(start, end, segments = 256){
  let [lat1, lon1] = start;
  let [lat2, lon2] = end;

  lon1 = wrapLon(lon1);
  lon2 = wrapLon(lon2);

  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;

  const psi1 = mercatorPsi(lat1);
  const psi2 = mercatorPsi(lat2);

  const pts = [];
  for (let i = 0; i <= segments; i++){
    const t = i / segments;
    const lon = wrapLon(lon1 + dLon * t);
    const psi = psi1 + (psi2 - psi1) * t;
    const lat = invMercatorPsi(psi);
    pts.push([lat, lon]);
  }
  return pts;
};

window.rhumbDistanceKm = function(a, b){
  const φ1 = toRad(a[0]), φ2 = toRad(b[0]);
  const Δφ = φ2 - φ1;

  let Δλ = toRad(b[1] - a[1]);
  if (Δλ > Math.PI) Δλ -= 2*Math.PI;
  if (Δλ < -Math.PI) Δλ += 2*Math.PI;

  const Δψ = mercatorPsi(b[0]) - mercatorPsi(a[0]);
  const q = Math.abs(Δψ) > 1e-12 ? (Δφ / Δψ) : Math.cos(φ1);

  return Math.sqrt(Δφ*Δφ + (q*Δλ)*(q*Δλ)) * R_EARTH_KM;
};

window.rhumbBearingDeg = function(a, b){
  let Δλ = toRad(b[1] - a[1]);
  if (Δλ > Math.PI) Δλ -= 2*Math.PI;
  if (Δλ < -Math.PI) Δλ += 2*Math.PI;

  const Δψ = mercatorPsi(b[0]) - mercatorPsi(a[0]);
  const θ = Math.atan2(Δλ, Δψ);
  return (toDeg(θ) + 360) % 360;
};

window.makeRhumbPolyline = function(start, end, options = {}){
  const n = options.segments ?? 256;
  const pts = rhumbPoints(start, end, n);
  return L.polyline(pts, options);
};

// ===== Ortodroma =====
function latLngToVec3(lat, lon){
  const φ = toRad(lat), λ = toRad(lon);
  return {
    x: Math.cos(φ) * Math.cos(λ),
    y: Math.cos(φ) * Math.sin(λ),
    z: Math.sin(φ)
  };
}

function vec3ToLatLng({x,y,z}){
  const r = Math.hypot(x,y,z);
  const X = x / r, Y = y / r, Z = z / r;
  return [toDeg(Math.asin(Z)), toDeg(Math.atan2(Y, X))];
}

function slerp(a,b,t){
  const dot = Math.max(-1, Math.min(1, a.x*b.x + a.y*b.y + a.z*b.z));
  const θ = Math.acos(dot);
  if (θ === 0) return a;
  const s1 = Math.sin((1-t)*θ) / Math.sin(θ);
  const s2 = Math.sin(t*θ) / Math.sin(θ);
  return { x: a.x*s1 + b.x*s2, y: a.y*s1 + b.y*s2, z: a.z*s1 + b.z*s2 };
}

window.orthoPoints = function(start, end, segments = 256){
  const a = L.latLng(start);
  const b = L.latLng(end);
  if (a.equals(b)) return [start];

  const va = latLngToVec3(a.lat, a.lng);
  const vb = latLngToVec3(b.lat, b.lng);

  const pts = [];
  for (let i = 0; i <= segments; i++){
    const t = i / segments;
    const v = slerp(va, vb, t);
    pts.push(vec3ToLatLng(v));
  }
  return pts;
};

window.makeOrthoPolyline = function(start, end, options = {}){
  const n = options.segments ?? 256;
  const pts = orthoPoints(start, end, n);
  return L.polyline(pts, options);
};
