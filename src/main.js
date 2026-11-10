import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { createStage } from './scene/stage.js';
import { createPostFX } from './scene/postfx.js';
import { createDock, createDrone } from './scene/hardware.js';
import { createUI } from './ui/chrome.js';
import { LANG } from './ui/copy.js';

document.documentElement.lang = LANG;

const stageEl = document.getElementById('stage');
const uiEl = document.getElementById('ui');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const PRESETS = {
  hero: { pos: [2.55, 1.35, 3.05], target: [0, 0.42, 0], fov: 30 },
  top: { pos: [0.02, 3.35, 0.5], target: [0, 0.2, 0], fov: 30 },
  macro: { pos: [0.62, 0.66, 1.18], target: [0.08, 0.4, 0.3], fov: 26 },
  detail: { pos: [-1.72, 0.88, 1.85], target: [-0.12, 0.5, 0.06], fov: 28 },
  launch: { pos: [3.7, 2.6, 4.1], target: [0, 1.1, 0], fov: 34 },
};

const state = {
  view: 'hero',
  lid: 0,
  lidTarget: 0,
  explode: false,
  landing: false,
  orbit: !reduceMotion,
  weather: 'clear',
  time: 'day',
  sector: 'default',
  missions: 1284,
  battery: 0.62,
  rain: 0,
};

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.domElement.style.position = 'fixed';
renderer.domElement.style.inset = '0';
renderer.domElement.style.width = '100%';
renderer.domElement.style.height = '100%';
renderer.domElement.style.zIndex = '0';
stageEl.appendChild(renderer.domElement);

const ui = createUI(uiEl, { onAction });

function fatal(err) {
  console.error(err);
  ui.toast('Scene failed to start — see console');
}

let stage;
let postfx;
let dock;
let drone;
let camera;
let controls;
let hotspots = [];
let parkY = 0.22;
let camTween = null;
const clock = new THREE.Clock();
const tmp = new THREE.Vector3();

try {
  boot();
} catch (err) {
  fatal(err);
}

function boot() {
  ui.setProgress(0.12, 'Building environment');
  stage = createStage(renderer, { quality: 'high' });
  camera = stage.camera;
  const scene = stage.scene;

  ui.setProgress(0.36, 'Machining hardware');
  dock = createDock({});
  drone = createDrone({});
  scene.add(dock.group);
  scene.add(drone.group);

  parkY = dock.parkY !== undefined ? dock.parkY : (dock.bbox ? dock.bbox.height * 0.52 : 0.22);
  drone.group.position.set(0, parkY, 0);

  ui.setProgress(0.62, 'Lighting the pad');
  postfx = createPostFX(renderer, stage, {});

  hotspots = [
    ...(dock.hotspots || []).map((h) => ({ ...h, source: 'dock' })),
    ...(drone.hotspots || []).map((h) => ({ ...h, source: 'drone' })),
  ];

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.075;
  controls.minDistance = 0.6;
  controls.maxDistance = 7;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;

  const params = new URLSearchParams(location.search);
  if (params.has('sector')) state.sector = params.get('sector');
  if (params.has('view') && PRESETS[params.get('view')]) state.view = params.get('view');
  if (state.view === 'launch') state.lidTarget = 1;
  ui.setState({ view: state.view, lid: state.lidTarget, explode: state.explode, weather: state.weather, time: state.time, orbit: state.orbit });

  applyPreset(state.view, false);
  stage.setTimeOfDay(13.5);
  ui.setProgress(0.88, 'Calibrating instruments');
  syncScene(0.016, 0);

  window.addEventListener('resize', resize);
  resize();
  renderer.setAnimationLoop(frame);
}

function applyPreset(name, animated = true) {
  const p = PRESETS[name] || PRESETS.hero;
  const from = { pos: camera.position.clone(), target: controls.target.clone(), fov: camera.fov };
  const to = {
    pos: new THREE.Vector3(...p.pos),
    target: new THREE.Vector3(...p.target),
    fov: p.fov,
  };
  camTween = { from, to, t: animated && !reduceMotion ? 0 : 1, dur: 1.15 };
  if (!animated || reduceMotion) commitTween(1);
}

function commitTween(k) {
  const { from, to } = camTween;
  const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  camera.position.lerpVectors(from.pos, to.pos, e);
  controls.target.lerpVectors(from.target, to.target, e);
  camera.fov = THREE.MathUtils.lerp(from.fov, to.fov, e);
  camera.updateProjectionMatrix();
}

function syncScene(dt, el) {
  const t = state.time;
  const hour = t === 'day' ? 13.5 : t === 'dusk' ? 18.6 : 22.5;
  const night = t === 'night';

  dock.drive({
    roof: state.lid,
    tray: THREE.MathUtils.smoothstep(state.lid, 0.35, 0.9),
    door: state.explode ? 1 : 0,
    ledColor: night ? 0x62d8ff : 0x59f2a8,
    ledMode: state.lid > 0.5 ? 'flight' : 'charging',
    battery: state.battery,
    elapsed: el,
    dt,
  });

  const landing = state.landing;
  const hovering = state.explode || (state.view === 'launch' && !landing);
  const canFly = hovering && state.lid > 0.94;
  const height = Math.max(0, drone.group.position.y - parkY);
  const hoverY = parkY + (canFly ? 1.5 + Math.sin(el * 0.9) * 0.035 : 0);
  drone.group.position.y += (hoverY - drone.group.position.y) * (landing ? 0.022 : 0.06);
  const sway = landing ? Math.sin(el * 1.6) * 0.05 * Math.min(1, height / 0.7) : 0;
  drone.group.position.x += (sway - drone.group.position.x) * 0.12;
  drone.group.rotation.y += canFly ? 0.004 : landing ? 0.0018 : 0.0006;

  const spinning = canFly || (landing && height > 0.32);
  drone.drive({
    propSpin: spinning ? (landing ? 3600 : 5200) : state.lid > 0.6 ? 1400 : 0,
    armsDeploy: canFly || landing ? 1 : THREE.MathUtils.smoothstep(state.lid, 0.55, 1),
    gimbalPitch: canFly ? -0.55 : landing ? -0.3 : -0.15,
    gimbalYaw: Math.sin(el * 0.35) * 0.25,
    navLights: spinning || night,
    elapsed: el,
    dt,
  });

  if (landing && drone.group.position.y < parkY + 0.03) {
    state.landing = false;
    state.view = 'hero';
    state.lidTarget = 0;
    applyPreset('hero');
    ui.setState({ view: 'hero', lid: 0, explode: false });
  }

  stage.setTimeOfDay(hour);
  stage.setWeather(state.weather, state.weather === 'clear' ? 0 : 0.85);
  stage.setContext(state.sector);
}

function frame() {
  const dt = Math.min(clock.getDelta(), 0.05);
  const el = clock.elapsedTime;

  if (camTween && camTween.t < 1) {
    camTween.t = Math.min(1, camTween.t + dt / camTween.dur);
    commitTween(camTween.t);
  }

  const airborne = drone.group.position.y > parkY + 0.55;
  const lidGoal = !(state.explode || state.view === 'launch') && airborne ? 0.98 : state.lidTarget;
  state.lid += (lidGoal - state.lid) * Math.min(1, dt * 6);

  if (state.orbit && !reduceMotion && (!camTween || camTween.t >= 1)) {
    const a = dt * 0.12;
    const off = tmp.copy(camera.position).sub(controls.target);
    off.applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
    camera.position.copy(controls.target).add(off);
  }

  controls.update();
  syncScene(dt, el);
  stage.update(dt, el);
  updateTelemetry(dt, el);
  projectHotspots();

  if (postfx && postfx.render) postfx.render(dt);
  else stage.render ? stage.render(dt) : renderer.render(stage.scene, camera);
}

function updateTelemetry(dt, el) {
  const docked = state.lid < 0.12 && !state.explode;
  state.battery = THREE.MathUtils.clamp(state.battery + (docked ? dt * 0.004 : -dt * 0.02), 0.08, 1);
  if (state.explode && state.battery > 0.99) state.missions += 1;
  const hour = state.time === 'day' ? 13.5 : state.time === 'dusk' ? 18.6 : 22.5;
  const base = state.time === 'day' ? 19 : state.time === 'dusk' ? 13 : 6;
  const wet = state.weather === 'rain' ? 6 : state.weather === 'snow' ? -4 : state.weather === 'dust' ? 27 : 0;
  ui.setTelemetry({
    windMs: +(2.4 + Math.sin(el * 0.7) * 1.6 + (state.weather === 'clear' ? 0 : 3.1)).toFixed(1),
    tempC: Math.round(base + wet * 0.55 + Math.sin(el * 0.11) * 0.8),
    humidity: Math.round((state.weather === 'rain' ? 88 : 41) + Math.sin(el * 0.23) * 5),
    batteryPct: Math.round(state.battery * 100),
    missions: state.missions,
    uptimeH: 2143 + Math.floor(el / 3600),
    rainMm: +(state.weather === 'rain' ? 4.2 : 0).toFixed(1),
    localHour: hour,
  });
}

function projectHotspots() {
  if (!hotspots.length) return;
  const w = renderer.domElement.clientWidth;
  const h = renderer.domElement.clientHeight;
  const camPos = camera.position;
  const list = hotspots.map((s) => {
    tmp.copy(s.world);
    if (s.source === 'drone') tmp.y += drone.group.position.y - parkY;
    const dist = tmp.distanceTo(camPos);
    tmp.project(camera);
    const inFront = tmp.z < 1;
    return {
      id: s.id,
      label: s.label,
      note: s.note,
      x: (tmp.x * 0.5 + 0.5) * w,
      y: (-tmp.y * 0.5 + 0.5) * h,
      depth: dist,
      visible: inFront && dist > 0.35 && dist < 6 && state.lid > (s.source === 'drone' ? 0.25 : 0.05),
    };
  });
  ui.setHotspots(list);
}

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h, false);
  if (stage.resize) stage.resize(w, h);
  if (postfx && postfx.setSize) postfx.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  ui.setProgress(1, 'Ready');
}

function onAction(name, value) {
  switch (name) {
    case 'view':
      state.landing = false;
      state.view = value;
      if (value === 'launch') state.lidTarget = 1;
      applyPreset(value);
      break;
    case 'lid':
      state.lidTarget = THREE.MathUtils.clamp(Number(value) || 0, 0, 1);
      break;
    case 'land':
      if (!state.landing && (state.explode || state.view === 'launch')) {
        state.explode = false;
        state.landing = true;
      }
      break;
    case 'explode':
      state.landing = false;
      state.explode = !!value;
      if (state.explode) {
        state.lidTarget = 1;
        applyPreset('launch');
      }
      break;
    case 'weather':
      state.weather = value;
      break;
    case 'time':
      state.time = value;
      ui.setState({ theme: value === 'night' ? 'dark' : value === 'dusk' ? 'dark' : 'light' });
      break;
    case 'orbit':
      state.orbit = !!value;
      break;
    case 'sector':
      state.sector = value || 'default';
      break;
    case 'lang':
      try {
        localStorage.setItem('al-lang', value);
      } catch {}
      location.assign('?lang=' + encodeURIComponent(value));
      break;
    case 'hotspot':
      onHotspotPick(value);
      break;
    case 'cta':
      ui.toast(value === 'docs' ? 'Spec sheet opens with the deployment pack' : 'A field engineer will call you within one business day');
      break;
    case 'section':
      applyPreset(['hero', 'detail', 'top', 'launch'][value] || 'hero');
      break;
    default:
      break;
  }
  ui.setState({
    view: state.view,
    lid: state.lidTarget,
    explode: state.explode,
    weather: state.weather,
    time: state.time,
    orbit: state.orbit,
  });
}

function onHotspotPick(id) {
  if (!id) return;
  const spot = hotspots.find((s) => s.id === id);
  if (!spot) return;
  state.lidTarget = spot.source === 'drone' ? 1 : Math.max(state.lidTarget, 0.75);
  applyPreset(spot.source === 'drone' ? 'launch' : 'detail');
  ui.setActiveHotspot(id);
}
