import { buildDock } from './parts/dock.js';
import { buildDrone } from './parts/drone.js';

const DOCK_DEFAULTS = {
  roof: 0,
  tray: 0,
  door: 0,
  ledColor: 0x59f2a8,
  ledMode: 'idle',
  battery: 0.6,
  elapsed: 0,
  dt: 1 / 60,
};

const DRONE_DEFAULTS = {
  propSpin: 0,
  gimbalPitch: -0.15,
  gimbalYaw: 0,
  armsDeploy: 0,
  navLights: false,
  elapsed: 0,
  dt: 1 / 60,
};

// The part modules are driven by one state object per frame; patches merge so callers only name
// what changed and the expensive LED/instanced updates run once, not once per setter.
function wrap(built, defaults, options) {
  const state = { ...defaults, ...(options.state || {}) };
  if (typeof options.y === 'number') built.group.position.y = options.y;
  return {
    ...built,
    state,
    drive(patch) {
      if (patch) Object.assign(state, patch);
      built.drive(state);
      return state;
    },
  };
}

export function createDock(options = {}) {
  return wrap(buildDock(), DOCK_DEFAULTS, options);
}

export function createDrone(options = {}) {
  return wrap(buildDrone(), DRONE_DEFAULTS, options);
}
