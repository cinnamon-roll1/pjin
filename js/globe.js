// ===== globe.js (ES Module) =====
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import Globe from 'globe.gl';

(() => {
  const root = document.getElementById('globe');
  if (!root) return;

  // 1) Inicializace glóbu
  const world = Globe()(root)
    .globeImageUrl('https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg')
    .bumpImageUrl('https://unpkg.com/three-globe/example/img/earth-topology.png')
    .backgroundColor('#000')
    .showAtmosphere(true)
    .atmosphereColor('#3a5fcd')
    .atmosphereAltitude(0.1);

  // renderer settings
  const renderer = world.renderer?.();
  if (renderer) {
    if ('outputColorSpace' in renderer) {
      renderer.outputColorSpace = THREE.SRGBColorSpace;
    } else if ('outputEncoding' in renderer) {
      renderer.outputEncoding = THREE.sRGBEncoding;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }

  const scene = world.scene();

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));

  const dir = new THREE.DirectionalLight(0xffffff, 0.9);
  dir.position.set(1, 1, 1);
  scene.add(dir);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
  hemi.position.set(0, 1, 0);
  scene.add(hemi);

  // optional env map (ignore if missing)
  try {
    const cubeLoader = new THREE.CubeTextureLoader();
    cubeLoader.setPath('./env/');
    cubeLoader.load(
      ['px.jpg', 'nx.jpg', 'py.jpg', 'ny.jpg', 'pz.jpg', 'nz.jpg'],
      (tex) => { scene.environment = tex; },
      undefined,
      () => {}
    );
  } catch {}

  // click on globe -> add point (hook to app.js)
  world.onGlobeClick?.(({ lat, lng }) => {
    window.addPoint?.({ name: `Bod ${Date.now() % 1000}`, lat, lon: lng }, { fit: false });
  });

  // ===== PATHS LAYER =====
  // posíláme body s "alt" (oblouček pro letadlo)
  let pathLL = []; // [{lat, lon, alt}, ...]
  let currentActor = 'plane';

  const PATH_STYLE = {
    // výraznější čára pro letadlo
    planeStroke: 5.2,
    planeColor: '#ffe000',

    // “po zemi” styl
    groundStroke: 2.2,
    groundColor: '#ffcc00',

    // VÝŠKA OBLOUKU (relativně k poloměru glóbu)
    // dřív 0.02 -> 0.04 -> teď ještě výraznější:
    arcMaxAlt: 0.06
  };

  world
    .pathsData([])
    .pathPointLat(d => d.lat)
    .pathPointLng(d => d.lon)
    .pathPointAlt(d => d.alt ?? 0.0)
    .pathColor(() => (currentActor === 'plane' ? PATH_STYLE.planeColor : PATH_STYLE.groundColor))
    .pathStroke(() => (currentActor === 'plane' ? PATH_STYLE.planeStroke : PATH_STYLE.groundStroke));

  // ===== POINTS LAYER =====
  let abPoints = [];
  world
    .pointsData(abPoints)
    .pointLat(d => d.lat)
    .pointLng(d => d.lon)
    .pointAltitude(0.0)
    .pointRadius(0.6)
    .pointColor(d => d.color ?? '#ff5555')
    .pointLabel(d => d.name ?? 'Bod');

  // ===== Models =====
  const manager = new THREE.LoadingManager();
  manager.onError = (url) => console.warn('CHYBA při načítání resource:', url);
  const loader = new GLTFLoader(manager);

  const MODELS = {
    plane: './assets/plane.glb',
    car: './assets/car.glb',
    camel: './assets/camel.glb',
    officer: './assets/officer.glb'
  };

  // scale relativně k poloměru glóbu
  // - plane ~3× menší
  // - camel zpět na původní velikost (0.015)
  const SCALE_REL = {
    plane: 0.04 / 3,
    car: 0.02,
    camel: 0.015,
    officer: 0.02
  };

  // Korekce orientace: stejně jako auto/officer (žádná)
  const MODEL_CORR = {
    plane: new THREE.Quaternion(),
    car: new THREE.Quaternion(),
    camel: new THREE.Quaternion(),
    officer: new THREE.Quaternion()
  };

  let speed = 1.0;
  let model = null;
  let t = 0;
  let running = false;

  function getGlobeRadius() {
    return world.getGlobeRadius?.() ?? 100;
  }

  function tweakMaterialsForPBR(root) {
    const hasEnv = !!scene.environment;
    root.traverse((o) => {
      if (!o.isMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (!m) return;
        if ('metalness' in m && 'roughness' in m) {
          if (!hasEnv) {
            m.metalness = Math.min(m.metalness ?? 0, 0.2);
            m.roughness = Math.max(m.roughness ?? 0.8, 0.8);
            m.envMapIntensity = 0.0;
          } else {
            m.envMapIntensity = 1.2;
          }
        }
        m.needsUpdate = true;
      });
    });
  }

  function loadModel(kind) {
    currentActor = kind;

    if (model) {
      scene.remove(model);
      model = null;
    }

    const url = MODELS[kind];

    const setupModel = (obj) => {
      model = obj;

      // scale
      const R = getGlobeRadius();
      const rel = SCALE_REL[kind] ?? 0.02;
      model.scale.setScalar(R * rel);

      // Na povrch / nebo “těsně nad čárou”: malinký offset, aby se to netřáslo v povrchu/čáře
      // (pozor: u letadla se alt bere z path, takže offset jen “odsazuje” od čáry)
      model.userData.altOffset = 0.00015;

      model.userData.corrQ = MODEL_CORR[kind]?.clone() ?? new THREE.Quaternion();

      tweakMaterialsForPBR(model);
      scene.add(model);

      t = 0;
      running = false;
      placeModelAtT(0);
    };

    if (!url) {
      const geom = new THREE.SphereGeometry(1, 16, 16);
      const mat = new THREE.MeshStandardMaterial({ color: 0xff5533, metalness: 0.1, roughness: 0.9 });
      setupModel(new THREE.Mesh(geom, mat));
      return;
    }

    loader.load(
      url,
      (gltf) => setupModel(gltf.scene),
      undefined,
      (err) => {
        console.warn('Model nenalezen, používám zástupný objekt.', err);
        const geom = new THREE.SphereGeometry(1, 16, 16);
        const mat = new THREE.MeshStandardMaterial({ color: 0xff5533, metalness: 0.1, roughness: 0.9 });
        setupModel(new THREE.Mesh(geom, mat));
      }
    );
  }

  function getCoords(lat, lon, alt) {
    return world.getCoords(lat, lon, alt);
  }

  // Build path with optional arc (alt per point)
  function setPath(llPoints, actorKind) {
    currentActor = actorKind;
    const n = llPoints.length;

    if (actorKind === 'plane' && n >= 2) {
      const arcMax = PATH_STYLE.arcMaxAlt;

      // alt(s) = arcMax * sin(pi*s), nejvíc uprostřed
      pathLL = llPoints.map((p, i) => {
        const s = (n === 1) ? 0 : (i / (n - 1));
        const alt = arcMax * Math.sin(Math.PI * s);
        return { lat: p.lat, lon: p.lon, alt };
      });
    } else {
      // ostatní po povrchu
      pathLL = llPoints.map(p => ({ lat: p.lat, lon: p.lon, alt: 0.0 }));
    }

    world.pathsData(pathLL.length ? [pathLL] : [[]]);

    t = 0;
    placeModelAtT(0);
  }

  // ===== ORIENTACE + PITCH pro letadlo =====
  // - Pro ground aktéry: "flat" (forward = tečna v rovině kolmé k normále)
  // - Pro letadlo: forward = skutečný směr letu (pos->next), takže dostane pitch podle stoupání/klesání oblouku
  function orientWithTangentAndNormal(pos, next, targetObj) {
    const normal = pos.clone().normalize();                // "up" od středu Země
    const dir = next.clone().sub(pos).normalize();         // skutečný směr pohybu

    if (!isFinite(dir.x) || dir.lengthSq() < 1e-12) return;

    let forward;
    if (currentActor === 'plane') {
      // PITCH: forward = reálný směr letu (včetně složky "nahoru/dolů")
      forward = dir.clone();
    } else {
      // Po zemi: forward = tečna (projekce do roviny kolmé k normále)
      forward = dir.clone().sub(normal.clone().multiplyScalar(dir.dot(normal))).normalize();
      if (!isFinite(forward.x) || forward.lengthSq() < 1e-12) forward = dir.clone();
    }

    // Postavíme ortonormální bázi:
    // zAxis = forward, yAxis ~ normal, xAxis = y × z
    const zAxis = forward.clone();
    const xAxis = new THREE.Vector3().crossVectors(normal, zAxis).normalize();

    if (!isFinite(xAxis.x) || xAxis.lengthSq() < 1e-12) {
      // fallback: když je forward skoro rovnoběžný s normal
      targetObj.lookAt(next);
      if (targetObj.userData.corrQ) targetObj.quaternion.multiply(targetObj.userData.corrQ);
      return;
    }

    const yAxis = new THREE.Vector3().crossVectors(zAxis, xAxis).normalize();

    const basis = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
    const q = new THREE.Quaternion().setFromRotationMatrix(basis);

    if (targetObj.userData.corrQ) q.multiply(targetObj.userData.corrQ);
    targetObj.quaternion.copy(q);
  }

  // Model jeď podle path: letadlo po alt oblouku, ostatní alt=0
  function placeModelAtT(tt) {
    if (!model || pathLL.length < 2) return;

    const N = pathLL.length - 1;
    let idx = Math.floor(tt * N);
    if (idx >= N) idx = N - 1;
    const frac = (tt * N) - idx;

    const a = pathLL[idx];
    const b = pathLL[idx + 1];

    const lat = a.lat + (b.lat - a.lat) * frac;
    const lon = a.lon + (b.lon - a.lon) * frac;

    // 1) výška z čáry (oblouk) — ať letadlo letí PO čáře
    const pathAlt =
      (a.alt ?? 0) + ((b.alt ?? 0) - (a.alt ?? 0)) * frac;

    // 2) malý offset (nad povrchem / nad čárou)
    const offset = model.userData.altOffset ?? 0.00015;

    // pro všechny aktéry: alt = pathAlt + offset
    const alt = pathAlt + offset;

    const p = getCoords(lat, lon, alt);
    const pos = new THREE.Vector3(p.x, p.y, p.z);
    model.position.copy(pos);

    // look-ahead pro stabilní orientaci + pitch
    const dt = 1 / (N * 5);
    const tNext = Math.min(tt + dt, 1.0);

    let idx2 = Math.floor(tNext * N);
    if (idx2 >= N) idx2 = N - 1;
    const frac2 = (tNext * N) - idx2;

    const a2 = pathLL[idx2];
    const b2 = pathLL[idx2 + 1];

    const lat2 = a2.lat + (b2.lat - a2.lat) * frac2;
    const lon2 = a2.lon + (b2.lon - a2.lon) * frac2;

    const pathAlt2 =
      (a2.alt ?? 0) + ((b2.alt ?? 0) - (a2.alt ?? 0)) * frac2;

    const alt2 = pathAlt2 + offset;

    const pn = getCoords(lat2, lon2, alt2);
    const next = new THREE.Vector3(pn.x, pn.y, pn.z);

    orientWithTangentAndNormal(pos, next, model);
  }

  // animation loop
  const clock = new THREE.Clock();
  (function loop() {
    requestAnimationFrame(loop);
    if (running && pathLL.length >= 2 && model) {
      const delta = clock.getDelta();
      t += delta * speed * 0.1;
      if (t >= 1) { t = 1; running = false; }
      placeModelAtT(t);
    } else {
      clock.getDelta();
    }
  })();

  // ===== API for app.js =====
  window.globeSyncPoints = (pts, AB, appState) => {
    if (!AB) {
      setPath([], appState?.actor ?? 'plane');
      abPoints = [];
      world.pointsData(abPoints);
      return;
    }

    const { curve = 'ortho', actor = 'plane' } = appState ?? {};
    const start = [AB[0].lat, AB[0].lon];
    const end   = [AB[1].lat, AB[1].lon];
    const segs = 100;

    const path = (curve === 'rhumb')
      ? window.rhumbPoints(start, end, segs).map(([lat, lon]) => ({ lat, lon }))
      : window.orthoPoints(start, end, segs).map(([lat, lon]) => ({ lat, lon }));

    setPath(path, actor);

    abPoints = [
      { name: 'A', lat: AB[0].lat, lon: AB[0].lon, color: '#00d1ff' },
      { name: 'B', lat: AB[1].lat, lon: AB[1].lon, color: '#ffcc00' }
    ];
    world.pointsData(abPoints);
  };

  window.globeUpdatePath = (AB, appState) => {
    if (!AB) return;
    window.globeSyncPoints(null, AB, appState);
  };

  window.globeSetActor = (kind) => {
    loadModel(kind);

    // Pozor: pathLL už je "s alt", takže když aktéra přepneš, přepočítáme path podle druhu aktéra
    // Aby to fungovalo správně, uložíme si "raw" lat/lon bez alt:
    // (nejjednodušší: rebuild z existující pathLL)
    if (pathLL.length) {
      const raw = pathLL.map(p => ({ lat: p.lat, lon: p.lon }));
      setPath(raw, kind);
    }
  };

  window.globeSetSpeed = (v) => {
    speed = Number(v) || 1.0;
  };

  window.globeStart = () => {
    if (pathLL.length < 2) { alert('Musíš mít alespoň 2 body!'); return; }
    t = 0;
    running = true;
  };

  window.globeReset = () => {
    running = false;
    t = 0;
    placeModelAtT(0);
  };

  // init
  loadModel('plane');

  window.addEventListener('resize', () => {
    world.width(root.clientWidth);
    world.height(root.clientHeight);
  });
})();
