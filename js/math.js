// rad <-> deg
window.toRad = d => d * Math.PI / 180;
window.toDeg = r => r * 180 / Math.PI;

window.R_EARTH_KM = 6371.0;
window.R_EARTH_M = 6371000;

window.haversineKm = function(a, b){
  const φ1 = toRad(a[0]), φ2 = toRad(b[0]);
  let Δφ = φ2 - φ1;
  let Δλ = toRad(b[1] - a[1]);
  if (Δλ > Math.PI) Δλ -= 2*Math.PI;
  if (Δλ < -Math.PI) Δλ += 2*Math.PI;

  const s = Math.sin(Δφ/2)**2 + Math.cos(φ1)*Math.cos(φ2)*Math.sin(Δλ/2)**2;
  const c = 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1-s));
  return R_EARTH_KM * c;
};

window.initialBearingDeg = function(a, b){
  const φ1 = toRad(a[0]), φ2 = toRad(b[0]);
  let Δλ = toRad(b[1] - a[1]);
  if (Δλ > Math.PI) Δλ -= 2*Math.PI;
  if (Δλ < -Math.PI) Δλ += 2*Math.PI;

  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1)*Math.sin(φ2) - Math.sin(φ1)*Math.cos(φ2)*Math.cos(Δλ);
  const θ = Math.atan2(y, x);
  return (toDeg(θ) + 360) % 360;
};

window.polygonAreaM2 = function(latlngs){
  if (latlngs.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < latlngs.length; i++){
    const [lat1, lon1] = latlngs[i];
    const [lat2, lon2] = latlngs[(i + 1) % latlngs.length];
    area += toRad(lon2 - lon1) * (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  area = area * (R_EARTH_M * R_EARTH_M) / 2;
  return Math.abs(area);
};
