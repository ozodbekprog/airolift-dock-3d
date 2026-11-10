import * as THREE from 'three';
import { buildEnvironment } from './parts/environment.js';
import { buildWeather } from './parts/weather.js';
import { buildContexts } from './parts/contexts.js';

const WEATHERS = ['clear', 'rain', 'snow', 'dust'];

export function createStage(renderer, options = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.05, 240);
  camera.position.set(1.65, 0.78, 1.95);

  const quality = options.quality === 'low' ? 'low' : 'high';
  const env = buildEnvironment(scene, renderer);
  const weather = buildWeather(scene);
  const contexts = buildContexts(scene);

  let hour = 13.5;
  let kind = 'clear';
  let amount = 0;
  let contextName = 'default';
  let lastWetness = -1;

  env.setQuality(quality);
  weather.setQuality(quality);
  contexts.setQuality(quality);
  contexts.set('default');

  function setTimeOfDay(next) {
    hour = THREE.MathUtils.clamp(Number.isFinite(next) ? next : 13.5, 0, 24);
    env.setTimeOfDay(hour);
  }

  function setWeather(next, level) {
    kind = WEATHERS.includes(next) ? next : 'clear';
    amount = kind === 'clear' ? 0 : THREE.MathUtils.clamp(Number(level) || 0, 0, 1);
    env.setWeatherTint(kind, amount);
    weather.set(kind, amount);
  }

  function setContext(name) {
    if (name === contextName) return;
    contextName = name;
    contexts.set(name);
  }

  function setQuality(level) {
    const q = level === 'low' ? 'low' : 'high';
    env.setQuality(q);
    weather.setQuality(q);
    contexts.setQuality(q);
  }

  function update(dt, elapsed) {
    env.update(dt, elapsed);
    weather.update(dt, elapsed, camera);

    const wet = weather.wetness;
    if (Math.abs(wet - lastWetness) > 0.02) {
      lastWetness = wet;
      env.setWetness(wet);
    }

    contexts.update(dt, elapsed, { hour, wetness: wet, visibility: weather.visibility });

    const exposure = env.setExposure();
    if (Math.abs(renderer.toneMappingExposure - exposure) > 0.004) {
      renderer.toneMappingExposure = exposure;
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function resize(width, height) {
    camera.aspect = Math.max(1, width) / Math.max(1, height);
    camera.updateProjectionMatrix();
  }

  function dispose() {
    contexts.dispose();
    weather.dispose();
    env.dispose();
  }

  return {
    scene,
    camera,
    env,
    weather,
    contexts,
    setTimeOfDay,
    setWeather,
    setContext,
    setQuality,
    update,
    render,
    resize,
    dispose,
    get hour() {
      return hour;
    },
    get weather() {
      return kind;
    },
    get context() {
      return contextName;
    },
  };
}
