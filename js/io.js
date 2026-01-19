window.fmt6 = x => Number(x).toFixed(6);

window.tryParseLineToPoint = function(line, indexForDefaultName, isValidLatLon){
  const hashPos = line.indexOf("#");
  if (hashPos !== -1) line = line.slice(0, hashPos);
  line = line.trim();
  if (!line) return null;

  const normalized = line.replace(/[;,]+/g, " ").replace(/\t+/g, " ").trim();
  const parts = normalized.split(/\s+/);
  if (parts.length < 2) return null;

  const toNum = (s) => {
    const v = Number(String(s).replace(",", "."));
    return Number.isFinite(v) ? v : NaN;
  };

  if (parts.length === 2){
    const lat = toNum(parts[0]);
    const lon = toNum(parts[1]);
    if (!isValidLatLon(lat, lon)) return null;
    return { name: `Bod ${indexForDefaultName}`, lat, lon };
  }

  const name = parts[0];
  const lat = toNum(parts[1]);
  const lon = toNum(parts[2]);
  if (!isValidLatLon(lat, lon)) return null;
  return { name, lat, lon };
};
