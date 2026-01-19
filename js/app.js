// ===== MAP =====
const map = L.map("map").setView([50, 0], 3);

// ===== BASEMAPS =====
const baseLayers = {
  osm: L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors"
  }),

  // Satelit: Esri World Imagery (bez API klíče)
  sat: L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    }
  ),

  // Dark basemap: CARTO Dark Matter
  dark: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
    maxZoom: 19,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
  })
};

let activeBase = null;

function setBasemap(key){
  const layer = baseLayers[key] || baseLayers.osm;

  if (activeBase) map.removeLayer(activeBase);
  activeBase = layer.addTo(map);

  if (typeof basemapSelect !== "undefined" && basemapSelect && basemapSelect.value !== key) {
    basemapSelect.value = key;
  }
}

const gridLayer = L.layerGroup().addTo(map);
const routeLayer = L.layerGroup().addTo(map);
const polygonLayer = L.layerGroup().addTo(map);

// ===== DATA =====
const presets = {
  prague:  { name: "Praha",    lat: 50.0755, lon: 14.4378 },
  vienna:  { name: "Vídeň",    lat: 48.2082, lon: 16.3738 },
  london:  { name: "Londýn",   lat: 51.5074, lon: -0.1278 },
  paris:   { name: "Paříž",    lat: 48.8566, lon: 2.3522 },
  newyork: { name: "New York", lat: 40.7128, lon: -74.0060 },
  tokyo:   { name: "Tokyo",    lat: 35.6762, lon: 139.6503 }
};

// ===== STATE =====
let points = [];   // { name, lat, lon }
let markers = [];

// ===== VALIDATION =====
function isValidLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

// ===== UI REFS =====
const viewModeSelect = document.getElementById("viewMode");
const actorSelect = document.getElementById("actor");
const startAnimBtn = document.getElementById("startAnim");
const resetAnimBtn = document.getElementById("resetAnim");
const speedRange = document.getElementById("speed");
const speedVal = document.getElementById("speedVal");

// rozlišení polygonů
const showPolygonDrawCheckbox = document.getElementById("showPolygonDraw");
const calcPolygonAreaCheckbox = document.getElementById("calcPolygonArea");

// kontejnery
const mapDiv = document.getElementById("map");
const globeDiv = document.getElementById("globe");

// centrální stav
window.appState = {
  viewMode: '2D',
  curve: 'ortho',
  actor: 'plane',
  speed: 1.0,
  running: false
};

const presetSelect = document.getElementById("preset");
const addPresetBtn = document.getElementById("addPreset");

const latInput = document.getElementById("lat");
const lonInput = document.getElementById("lon");
const addCustomBtn = document.getElementById("addCustom");

const clearBtn = document.getElementById("clear");

const connectCheckbox = document.getElementById("connect");
const showPolygonCheckbox = calcPolygonAreaCheckbox; // zpětná kompatibilita pro statistiky/export

const routeTypeSelect = document.getElementById("routeType");

const pointsList = document.getElementById("pointsList");
const statsDiv = document.getElementById("stats");

const showGridCheckbox = document.getElementById("showGrid");
const darkModeCheckbox = document.getElementById("darkMode");
const basemapSelect = document.getElementById("basemap");

// import/export
const txtIO = document.getElementById("txtIO");           // export okno
const txtImport = document.getElementById("txtImport");   // import okno

const fileInput = document.getElementById("fileInput");
const importBtn = document.getElementById("importBtn");
const exportPointsBtn = document.getElementById("exportPointsBtn");
const exportDetailBtn = document.getElementById("exportDetailBtn");
const copyTxtBtn = document.getElementById("copyTxtBtn");
const appendImportCheckbox = document.getElementById("appendImport");

// geocode
const cityQuery = document.getElementById("cityQuery");
const citySearchBtn = document.getElementById("citySearchBtn");
const cityResults = document.getElementById("cityResults");

// ===== HELPERS =====
function nextPointName() {
  return `Bod ${points.length + 1}`;
}

function getAB() {
  if (points.length < 2) return null;
  return [
    { lat: points[0].lat, lon: points[0].lon },
    { lat: points[1].lat, lon: points[1].lon }
  ];
}

function toggleView(mode) {
  const is3D = mode === '3D';
  globeDiv?.classList.toggle('hidden', !is3D);
  mapDiv?.classList.toggle('hidden', is3D);
}

function refreshAll({ fitBounds = false } = {}) {
  rebuildMarkers();
  renderPointsList();
  redrawRoute();
  redrawPolygon();
  updateStats();

  if (fitBounds && points.length) {
    const bounds = L.latLngBounds(points.map(p => [p.lat, p.lon]));
    map.fitBounds(bounds, { padding: [20, 20] });
  }

  window.globeUpdatePath?.(getAB(), window.appState);
}

function addPoint(p, { fit = false } = {}) {
  points.push(p);
  refreshAll({ fitBounds: fit });
}

function setPoints(newPoints, { fit = false } = {}) {
  points = newPoints;
  refreshAll({ fitBounds: fit });
}

function clearAll() {
  points = [];
  refreshAll();
}

// ===== MARKERS =====
function rebuildMarkers() {
  markers.forEach(m => map.removeLayer(m));
  markers = [];

  points.forEach((p, idx) => {
    const m = L.marker([p.lat, p.lon], { draggable: true })
      .addTo(map)
      .bindPopup(`${p.name}<br>${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`);

    m.on("dragend", () => {
      const ll = m.getLatLng();
      points[idx].lat = ll.lat;
      points[idx].lon = ll.lng;
      refreshAll();
    });

    markers.push(m);
  });
}

// ===== LIST =====
function renderPointsList() {
  if (!pointsList) return;
  pointsList.innerHTML = "";

  points.forEach((p, i) => {
    const li = document.createElement("li");

    const title = document.createElement("button");
    title.type = "button";
    title.className = "points-title";
    title.textContent = `${i + 1}) ${p.name}: ${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`;

    title.addEventListener("click", () => {
      map.setView([p.lat, p.lon], Math.max(map.getZoom(), 8));
      markers[i]?.openPopup();
    });

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.className = "btn";
    upBtn.textContent = "↑";
    upBtn.disabled = (i === 0);
    upBtn.addEventListener("click", () => {
      [points[i - 1], points[i]] = [points[i], points[i - 1]];
      refreshAll();
    });

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.className = "btn";
    downBtn.textContent = "↓";
    downBtn.disabled = (i === points.length - 1);
    downBtn.addEventListener("click", () => {
      [points[i + 1], points[i]] = [points[i], points[i + 1]];
      refreshAll();
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "btn";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", () => {
      points.splice(i, 1);
      refreshAll();
    });

    const controls = document.createElement("span");
    controls.className = "points-controls";
    controls.append(upBtn, downBtn, delBtn);

    li.append(title, controls);
    pointsList.appendChild(li);
  });
}

// ===== ROUTE & POLYGON =====
function redrawRoute() {
  routeLayer.clearLayers();

  if (!connectCheckbox?.checked) return;
  if (points.length < 2) return;

  const type = routeTypeSelect?.value || "straight";

  for (let i = 0; i < points.length - 1; i++) {
    const a = [points[i].lat, points[i].lon];
    const b = [points[i + 1].lat, points[i + 1].lon];

    let seg;
    if (type === "straight") seg = L.polyline([a, b], { weight: 3 });
    else if (type === "ortho") seg = makeOrthoPolyline(a, b, { weight: 3, segments: 300 });
    else seg = makeRhumbPolyline(a, b, { weight: 3, segments: 300 });

    seg.addTo(routeLayer);
  }
}

function redrawPolygon() {
  polygonLayer.clearLayers();
  if (!showPolygonDrawCheckbox?.checked) return;
  if (points.length < 3) return;

  const latlngs = points.map(p => [p.lat, p.lon]);
  L.polygon(latlngs, { weight: 2 }).addTo(polygonLayer);
}

function redrawGrid(stepDeg = 20){
  gridLayer.clearLayers();
  if (!showGridCheckbox?.checked) return;

  const b = map.getBounds();
  const south = Math.max(-90, b.getSouth());
  const north = Math.min(90,  b.getNorth());
  const west  = b.getWest();
  const east  = b.getEast();

  const floorTo = (x, s) => Math.floor(x / s) * s;
  const ceilTo  = (x, s) => Math.ceil(x / s) * s;

  const lonStart = floorTo(west, stepDeg);
  const lonEnd   = ceilTo(east, stepDeg);
  const latStart = floorTo(south, stepDeg);
  const latEnd   = ceilTo(north, stepDeg);

  const normal = { weight: 1, opacity: 0.5 };
  const zeroLine = { weight: 2.5, opacity: 0.9 };

  for (let lat = latStart; lat <= latEnd; lat += stepDeg){
    const latClamped = Math.max(-90, Math.min(90, lat));
    const opts = (Math.abs(latClamped) < 1e-6) ? zeroLine : normal;

    L.polyline([[latClamped, lonStart], [latClamped, lonEnd]], opts).addTo(gridLayer);
  }

  for (let lon = lonStart; lon <= lonEnd; lon += stepDeg){
    const opts = (Math.abs(lon) < 1e-6) ? zeroLine : normal;
    L.polyline([[south, lon], [north, lon]], opts).addTo(gridLayer);
  }
}

// ===== STATS =====
function updateStats() {
  if (!statsDiv) return;

  if (points.length < 2) {
    statsDiv.innerHTML = `<div class="muted">Přidej alespoň 2 body pro vzdálenosti a azimuty.</div>`;
    return;
  }

  let totalOrtho = 0;
  let totalRhumb = 0;
  let rows = "";

  for (let i = 0; i < points.length - 1; i++) {
    const a = [points[i].lat, points[i].lon];
    const b = [points[i + 1].lat, points[i + 1].lon];

    const dO = haversineKm(a, b);
    const dR = rhumbDistanceKm(a, b);
    const brgR = rhumbBearingDeg(a, b);

    totalOrtho += dO;
    totalRhumb += dR;

    rows += `
      <tr>
        <td>${i + 1} → ${i + 2}</td>
        <td>${dO.toFixed(2)} km</td>
        <td>${dR.toFixed(2)} km</td>
        <td>${brgR.toFixed(1)}°</td>
      </tr>`;
  }

  let html = `
    <table>
      <thead>
        <tr>
          <th>Úsek</th>
          <th>Ortodr. vzd.</th>
          <th>Loxodr. vzd.</th>
          <th>Azimut loxodroma</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <div style="margin-top:8px">
      <b>Celková délka:</b> ortodroma ${totalOrtho.toFixed(2)} km, loxodroma ${totalRhumb.toFixed(2)} km
    </div>
  `;

  if (calcPolygonAreaCheckbox?.checked && points.length >= 3) {
    const areaKm2 = polygonAreaM2(points.map(p => [p.lat, p.lon])) / 1e6;
    html += `
      <div style="margin-top:8px">
        <b>Plocha polygonu:</b> ${areaKm2.toFixed(3)} km²
      </div>
    `;
  }

  statsDiv.innerHTML = html;
}

// ===== IMPORT =====
function importFromText(text) {
  const lines = (text || "").split(/\r?\n/);
  const imported = [];

  for (const line of lines) {
    const p = tryParseLineToPoint(line, imported.length + 1, isValidLatLon);
    if (p) imported.push(p);
  }

  if (imported.length === 0) {
    alert("V textu jsem nenašel žádné platné souřadnice.");
    return;
  }

  const append = !!appendImportCheckbox?.checked;
  const merged = append ? points.concat(imported) : imported;
  setPoints(merged, { fit: true });
}

// ===== EXPORT =====
function currentCurveLabel() {
  const v = routeTypeSelect?.value || "straight";
  if (v === "ortho") return "ortodroma";
  if (v === "rhumb") return "loxodroma";
  return "primka";
}

function segmentDistanceKm(a, b) {
  const type = routeTypeSelect?.value || "straight";
  return type === "rhumb" ? rhumbDistanceKm(a, b) : haversineKm(a, b);
}

function segmentAzimuthDeg(a, b) {
  const type = routeTypeSelect?.value || "straight";
  return type === "rhumb" ? rhumbBearingDeg(a, b) : initialBearingDeg(a, b);
}

function exportPointsOnlyText() {
  const lines = [
    `# Export bodů`,
    `# Formát: name;lat;lon`,
    `# Body: ${points.length}`,
    ``
  ];
  points.forEach(p => lines.push(`${p.name};${fmt6(p.lat)};${fmt6(p.lon)}`));
  return lines.join("\n");
}

function exportDetailText() {
  const curve = currentCurveLabel();
  const lines = [
    `# Export detail`,
    `# Datum: ${new Date().toISOString()}`,
    `# Typ spojeni: ${curve}`,
    `# Body: ${points.length}`,
    ``,
    `BODY (name;lat;lon)`
  ];

  points.forEach(p => lines.push(`${p.name};${fmt6(p.lat)};${fmt6(p.lon)}`));

  if (points.length >= 2) {
    lines.push(``, `USEKY (i->j;typ;vzdalenost_km;azimut_deg)`);
    let total = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const a = [points[i].lat, points[i].lon];
      const b = [points[i + 1].lat, points[i + 1].lon];
      const d = segmentDistanceKm(a, b);
      const az = segmentAzimuthDeg(a, b);
      total += d;
      lines.push(`${i + 1}->${i + 2};${curve};${d.toFixed(3)};${az.toFixed(1)}`);
    }

    lines.push(``, `CELKOVA_DELKA_KM;${curve};${total.toFixed(3)}`);
  }

  if (showPolygonCheckbox?.checked && points.length >= 3) {
    const areaM2 = polygonAreaM2(points.map(p => [p.lat, p.lon]));
    lines.push(``, `PLOCHA_POLYGONU_M2;${Math.round(areaM2)}`, `PLOCHA_POLYGONU_KM2;${(areaM2 / 1e6).toFixed(6)}`);
  }

  return lines.join("\n");
}

// ===== GEOCODE (multi results) =====
function renderCityResults(items) {
  if (!cityResults) return;
  cityResults.innerHTML = "";

  if (!items || items.length === 0) {
    cityResults.textContent = "Nic nenalezeno.";
    return;
  }

  const ul = document.createElement("ul");
  ul.style.margin = "6px 0";
  ul.style.paddingLeft = "18px";

  items.forEach(it => {
    const full = it.display_name || "Výsledek";
    const lat = Number(it.lat);
    const lon = Number(it.lon);

    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn";
    btn.textContent = full;
    btn.style.margin = "4px 0";

    btn.addEventListener("click", () => {
      const shortName = full.split(",")[0];
      addPoint({ name: shortName, lat, lon }, { fit: false });
      map.setView([lat, lon], 8);
      cityResults.innerHTML = "";
    });

    li.appendChild(btn);
    ul.appendChild(li);
  });

  cityResults.appendChild(ul);
}

// ===== EVENTS =====
addPresetBtn?.addEventListener("click", () => {
  const key = presetSelect?.value;
  if (!key) return;
  const c = presets[key];
  addPoint({ name: c.name, lat: c.lat, lon: c.lon });
});

addCustomBtn?.addEventListener("click", () => {
  const lat = Number(latInput?.value);
  const lon = Number(lonInput?.value);

  if (!isValidLatLon(lat, lon)) {
    alert("Neplatné souřadnice. Šířka: -90..90, délka: -180..180.");
    return;
  }
  addPoint({ name: "Vlastní bod", lat, lon });
});

basemapSelect?.addEventListener("change", () => {
  const key = basemapSelect.value;
  setBasemap(key);

  if (darkModeCheckbox?.checked && key !== "dark"){
    basemapBeforeDark = key;
  }
});

function setDarkMode(on){
  document.body.classList.toggle("dark", !!on);
}

let basemapBeforeDark = basemapSelect?.value || "osm";

darkModeCheckbox?.addEventListener("change", () => {
  const on = darkModeCheckbox.checked;

  if (on){
    basemapBeforeDark = basemapSelect?.value || "osm";
    setDarkMode(true);
    setBasemap("dark");
  } else {
    setDarkMode(false);
    setBasemap(basemapBeforeDark || "osm");
  }
});

// === 3D/animace ===
viewModeSelect?.addEventListener("change", () => {
  appState.viewMode = viewModeSelect.value;
  toggleView(appState.viewMode);
  refreshAll({ fitBounds: true });
  window.globeUpdatePath?.(getAB(), appState);
});

actorSelect?.addEventListener("change", () => {
  appState.actor = actorSelect.value;
  window.globeSetActor?.(appState.actor);
});

startAnimBtn?.addEventListener("click", () => {
  appState.running = true;
  window.globeStart?.();
});

resetAnimBtn?.addEventListener("click", () => {
  appState.running = false;
  window.globeReset?.();
});

speedRange?.addEventListener("input", () => {
  appState.speed = Number(speedRange.value);
  if (speedVal) speedVal.textContent = appState.speed.toFixed(1) + "×";
  window.globeSetSpeed?.(appState.speed);
});

clearBtn?.addEventListener("click", clearAll);

connectCheckbox?.addEventListener("change", refreshAll);

routeTypeSelect?.addEventListener("change", () => {
  appState.curve = routeTypeSelect.value;
  refreshAll();
  window.globeUpdatePath?.(getAB(), appState);
});

showPolygonCheckbox?.addEventListener("change", refreshAll);
showPolygonDrawCheckbox?.addEventListener("change", refreshAll);

// map clicks
map.on("click", (e) => addPoint({
  name: nextPointName(),
  lat: e.latlng.lat,
  lon: e.latlng.lng
}));

map.on("contextmenu", (e) => {
  if (points.length === 0) return;

  const clickPt = map.latLngToLayerPoint(e.latlng);
  let bestI = -1, bestD = Infinity;

  for (let i = 0; i < points.length; i++) {
    const pt = map.latLngToLayerPoint([points[i].lat, points[i].lon]);
    const d = clickPt.distanceTo(pt);
    if (d < bestD) { bestD = d; bestI = i; }
  }

  if (bestD <= 20 && bestI !== -1) {
    points.splice(bestI, 1);
    refreshAll();
  }
});

// import/export
importBtn?.addEventListener("click", () => importFromText(txtImport?.value || ""));

fileInput?.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result ?? "");
    if (txtImport) txtImport.value = text;   // aby uživatel viděl co importuje
    if (txtIO) txtIO.value = text;           // volitelné: ať je to i v export okně
    importFromText(text);
  };
  reader.readAsText(file, "utf-8");
});

exportPointsBtn?.addEventListener("click", () => { if (txtIO) txtIO.value = exportPointsOnlyText(); });
exportDetailBtn?.addEventListener("click", () => { if (txtIO) txtIO.value = exportDetailText(); });

async function copyTextFromTextarea(textarea) {
  const text = textarea?.value || "";

  // moderní clipboard (HTTPS nebo localhost)
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  // fallback pro http / file://
  if (!textarea) return false;
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  const ok = document.execCommand("copy");
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);
  return ok;
}

copyTxtBtn?.addEventListener("click", async () => {
  try {
    const ok = await copyTextFromTextarea(txtIO);
    alert(ok ? "Zkopírováno do schránky." : "Nepodařilo se zkopírovat.");
  } catch {
    alert("Nepodařilo se zkopírovat.");
  }
});

map.on("moveend zoomend", () => redrawGrid(20));
showGridCheckbox?.addEventListener("change", () => redrawGrid(20));

// geocode
citySearchBtn?.addEventListener("click", async () => {
  const q = (cityQuery?.value || "").trim();
  if (!q) return;

  if (cityResults) cityResults.textContent = "Hledám...";
  try {
    const items = await searchCityNominatim(q);
    renderCityResults(items);
  } catch {
    if (cityResults) cityResults.textContent = "Chyba při hledání (zkus to znovu).";
  }
});

// ===============================
// PANEL NAVIGATION (RIBBON TABS)
// ===============================
const panelLinks = document.querySelectorAll(".navbar a[data-panel]");
const sections = document.querySelectorAll(".panel-section");

function showPanel(id){
  sections.forEach(s => s.classList.remove("active"));
  document.getElementById(id)?.classList.add("active");

  panelLinks.forEach(a => a.classList.toggle("active", a.dataset.panel === id));

  try { localStorage.setItem("activePanel", id); } catch {}
}

panelLinks.forEach(link => {
  link.addEventListener("click", e => {
    e.preventDefault();
    showPanel(link.dataset.panel);
  });
});

// restore last panel
let startPanel = "sec-name";
try {
  const saved = localStorage.getItem("activePanel");
  if (saved && document.getElementById(saved)) startPanel = saved;
} catch {}
showPanel(startPanel);

// ===============================
// INITIAL PAINT
// ===============================
refreshAll();
redrawGrid(20);
setDarkMode(false);
toggleView(appState.viewMode);
setBasemap(basemapSelect?.value || "osm");
