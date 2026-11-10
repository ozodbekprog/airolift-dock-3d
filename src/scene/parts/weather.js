/**
 * Weather: falling-particle species recycled inside a box that tracks the camera.
 * Buffers are sized once for the 'high' tier; set()/setQuality() only move draw ranges
 * and uniforms, so a kind change never re-allocates GPU memory.
 */
import * as THREE from 'three';

// ~1.2 s cross-fade: three taus of an exponential ease reaches 95 % of the target.
const FADE_TAU = 0.4;
const NAMES = ['rain', 'snow', 'dust', 'splash'];
// Live particle counts per quality tier; buffers are sized for 'high' always.
const TIERS = {
  high: { rain: 3000, snow: 2100, dust: 600, splash: 240 },
  low: { rain: 850, snow: 600, dust: 200, splash: 70 },
};
// Species mix per kind as [rain, snow, dust], plus the wind coupling: snow falls calm
// and dust blows hard off one gust field. Splash density derives from rain.
const KIND = { clear: [0, 0, 0, 0.3], rain: [1, 0, 0, 1], snow: [0, 1, 0, 0.45], dust: [0, 0, 1, 1.55] };
// box = recycle volume [y0, y1, half-extent], x/z in [-r, r]. `drift` is the wind
// take-up, `rot` the tumbling path plus sprite spin, `fall` the terminal speed (0 = splash
// pops), `size` the sprite diameter in pixels at one metre (overdraw sets the budget).
const SPEC = {
  rain: { box: [-0.25, 16, 26], fall: 9.5, drift: 0.62, size: 0.3, opacity: 0.6, rot: 0, color: 0xbcd2e8, tex: 'streak' },
  snow: { box: [-0.2, 13, 23], fall: 0.85, drift: 0.55, size: 0.18, opacity: 0.8, rot: 1, color: 0xf2f6fb, tex: 'flake' },
  dust: { box: [-0.05, 8.5, 21], fall: 0.35, drift: 1.35, size: 1.5, opacity: 0.16, rot: 0, color: 0xd8c7a8, tex: 'puff' },
  splash: { box: [0.02, 0.3, 11], fall: 0, drift: 0, size: 0.22, opacity: 0.5, rot: 0, color: 0xdfeaf6, tex: 'flash' },
};

const VERT = /* glsl */ `
attribute vec4 aSeed;           // x phase, y size scale, z spin, w jitter
uniform float uSize, uAtten, uTime, uNear, uFar;
varying float vAlpha, vRot;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0); float depth = -mv.z;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * aSeed.y * uAtten / max(depth, 0.05), 1.0, 190.0);
  // Drop the near field (giant sprites) and the far field (keeps the veil soft).
  float fade = smoothstep(uNear, uNear * 2.2, depth) * (1.0 - smoothstep(uFar * 0.5, uFar, depth));
  vAlpha = fade * (0.45 + 0.55 * aSeed.w);
  vRot = aSeed.z + uTime * (0.35 + 0.5 * aSeed.w);
}
`;

const FRAG = /* glsl */ `
uniform sampler2D uMap;
uniform vec3 uColor;
uniform float uOpacity, uShear, uRotate;
varying float vAlpha, vRot;
void main() {
  vec2 p = gl_PointCoord - 0.5;
  if (uRotate > 0.5) { float c = cos(vRot), s = sin(vRot); p = vec2(p.x * c - p.y * s, p.x * s + p.y * c); }
  // Screen-space shear leans the streak with camera-projected wind, so slanted rain
  // needs no second geometry and no per-frame rebuild.
  p = clamp(p + p.y * vec2(uShear, 0.0) + 0.5, 0.0, 1.0);
  // Clamping (not discard) keeps the sheared tips inside the sprite, where alpha is nil.
  float a = texture2D(uMap, p).a * vAlpha * uOpacity;
  if (a < 0.004) discard;
  gl_FragColor = vec4(uColor, a);
}
`;

function toTexture(size, px) {
  const t = new THREE.DataTexture(px, size, size, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  // Depth range is huge but screen size is small: one bilinear level beats a mip chain.
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

// Procedural sprites only (headless-safe, no image assets); the alpha channel carries shape.
function makeSpriteTexture(kind) {
  const size = kind === 'flake' ? 32 : 64;
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size - 0.5;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size - 0.5;
      const r = Math.hypot(u, v), ang = Math.atan2(v, u);
      let a;
      if (kind === 'streak') {
        a = Math.exp(-(u * u) / 0.0014) * Math.pow(Math.max(0, 1 - Math.abs(v) * 2), 1.35);
      } else if (kind === 'flake') {
        // Six-arm modulation keeps flakes from reading as uniform dots.
        a = Math.exp(-(r * r) / (0.02 * (0.82 + 0.18 * Math.cos(ang * 6))));
      } else {
        // Low-frequency lobes: coarse particulate and splash flash, never a blur halo.
        a = Math.max(0, 1 - r / 0.5) ** (kind === 'flash' ? 2.4 : 1.6) * (0.72 + 0.28 * Math.sin(r * 9 + ang * 3));
      }
      const o = (y * size + x) * 4;
      px[o] = 240; px[o + 1] = 244; px[o + 2] = 250; px[o + 3] = (Math.min(1, a) * 255) | 0;
    }
  }
  return toTexture(size, px);
}

export function buildWeather(scene) {
  const textures = [];
  const species = [];
  const wind = { x: 0, z: 0 };
  const target = { rain: 0, snow: 0, dust: 0 };
  let kind = 'clear', amount = 0, wetness = 0, visibility = 1, rng = 1337, disposed = false;

  // Deterministic LCG: reproducible respawns and zero allocation.
  function rand() {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  }

  function make(name) {
    const cfg = SPEC[name], box = { y0: cfg.box[0], y1: cfg.box[1], r: cfg.box[2] };
    const max = TIERS.high[name];
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(max * 3), seed = new Float32Array(max * 4);
    for (let i = 0; i < max; i++) {
      const p = i * 3, j = i * 4;
      pos[p] = (rand() * 2 - 1) * box.r; pos[p + 2] = (rand() * 2 - 1) * box.r;
      pos[p + 1] = box.y0 + rand() * (box.y1 - box.y0);
      seed[j] = rand() * 6.283; seed[j + 2] = rand() * 6.283;
      seed[j + 1] = 0.55 + rand() * 0.8; seed[j + 3] = rand();
    }
    const posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    const seedAttr = new THREE.BufferAttribute(seed, 4).setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', posAttr); geo.setAttribute('aSeed', seedAttr);
    geo.setDrawRange(0, 0);
    const map = makeSpriteTexture(cfg.tex); textures.push(map);
    const uniforms = {
      uMap: { value: map }, uColor: { value: new THREE.Color(cfg.color) },
      uSize: { value: cfg.size }, uAtten: { value: 600 }, uTime: { value: 0 },
      uNear: { value: 0.9 }, uFar: { value: 34 }, uOpacity: { value: 0 },
      uShear: { value: 0 }, uRotate: { value: cfg.rot },
    };
    // One shader text shared by all four species, so three reuses the compiled program.
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms,
      transparent: true, depthWrite: false, blending: THREE.NormalBlending,
    });
    const points = new THREE.Points(geo, mat);
    // Positions are box-relative and the box jumps with the camera, so the bounding
    // sphere computed once at build time is useless for culling.
    points.frustumCulled = false;
    points.visible = false;
    points.renderOrder = cfg.fall === 0 ? 4 : 3;
    scene.add(points);
    return { name, cfg, box, max, geo, posAttr, seedAttr, uniforms, mat, points, weight: 0, active: 0 };
  }

  for (const name of NAMES) species.push(make(name));
  const [rain, snow, dust, splash] = species;

  function set(nextKind, nextAmount) {
    if (disposed) return;
    kind = KIND[nextKind] ? nextKind : 'clear';
    amount = Math.max(0, Math.min(1, Number.isFinite(nextAmount) ? nextAmount : 0));
    const mix = KIND[kind];
    target.rain = mix[0] * amount; target.snow = mix[1] * amount; target.dust = mix[2] * amount;
  }

  function setQuality(tier) {
    if (disposed) return;
    const t = TIERS[tier] ? tier : 'high';
    for (const sp of species) {
      // Weak GPUs shrink sprites too: overdraw, not vertex count, is the real cost.
      const k = TIERS[t][sp.name] / TIERS.high[sp.name];
      // Only the cap moves; the buffers stay sized for 'high', so tier changes are free.
      sp.max = TIERS[t][sp.name];
      sp.uniforms.uSize.value = sp.cfg.size * (1 + (1 - k) * 0.3);
      sp.uniforms.uAtten.value = t === 'high' ? 600 : 480;
      sp.uniforms.uFar.value = t === 'high' ? 34 : 24;
    }
  }

  function stepFade(ease) {
    const veil = 0.5 + 0.5 * KIND[kind][3];
    // Indexed loops, not for-of: the iterator object would allocate every frame.
    for (let s = 0; s < 4; s++) {
      const sp = species[s];
      // Splashes only read once the rain is dense.
      const t = sp === splash ? Math.max(0, (target.rain - 0.3) / 0.7) : target[sp.name];
      sp.weight += (t - sp.weight) * ease;
      if (sp.weight < 0.0008) sp.weight = 0;
      const next = Math.round(sp.max * sp.weight);
      if (next !== sp.active) {
        sp.active = next; sp.geo.setDrawRange(0, next); sp.points.visible = next > 0;
      }
      sp.uniforms.uOpacity.value = sp.cfg.opacity * Math.min(1, sp.weight * 1.5) * veil;
    }
  }

  function stepWind(elapsed, dt) {
    // Layered sines give a gust envelope with no noise table and no per-frame allocs.
    const g = 0.5 * Math.sin(elapsed * 0.23) + 0.3 * Math.sin(elapsed * 0.61 + 1.7)
      + 0.2 * Math.sin(elapsed * 1.37 + 0.4);
    const dir = 0.72 + 0.34 * Math.sin(elapsed * 0.041);
    const speed = 3.2 * (0.7 + 0.45 * g) * KIND[kind][3] * (0.7 + 0.3 * amount);
    const ease = Math.min(1, dt * 2.5), cs = Math.cos(dir) * speed, sn = Math.sin(dir) * speed;
    wind.x += (cs - wind.x) * ease; wind.z += (sn - wind.z) * ease;
  }

  function stepFalling(sp, dt, elapsed, shear) {
    const cfg = sp.cfg;
    const box = sp.box, span = box.r * 2, height = box.y1 - box.y0;
    const pos = sp.posAttr.array, seed = sp.seedAttr.array, n = sp.active;
    if (cfg.fall === 0) {
      // Ground splash micro-emissives: short-lived pops driven by a life counter.
      for (let i = 0; i < n; i++) {
        const j = i * 4, p = i * 3;
        let life = seed[j + 3] - dt * (1.8 + seed[j] * 0.9);
        if (life <= 0) {
          life = 1;
          pos[p] = (rand() * 2 - 1) * box.r; pos[p + 2] = (rand() * 2 - 1) * box.r;
          pos[p + 1] = box.y0 + rand() * 0.03; seed[j] = rand() * 6.283;
          seed[j + 1] = 0.55 + rand() * 0.8;
        } else {
          pos[p + 1] += dt * 0.55 * seed[j + 1];
        }
        seed[j + 3] = life;
      }
      sp.posAttr.needsUpdate = true;
      sp.seedAttr.needsUpdate = true;
      return;
    }
    const vx = wind.x * cfg.drift, vz = wind.z * cfg.drift;
    for (let i = 0; i < n; i++) {
      const j = i * 4, p = i * 3;
      const phase = seed[j], jitter = seed[j + 3];
      let x = pos[p] + vx * dt, y, z;
      if (cfg.rot > 0.5) {
        // Tumbling flake: sway keyed to phase so neighbours never sync up.
        x += Math.sin(elapsed * 1.1 + phase) * 0.5 * dt;
        z = pos[p + 2] + vz * dt + Math.cos(elapsed * 0.9 + phase) * 0.45 * dt;
        y = pos[p + 1] - (cfg.fall * (0.6 + 0.8 * jitter) + 0.15 * Math.sin(elapsed + phase)) * dt;
      } else if (cfg.fall < 1) {
        // Dust hangs: eddies fight a slow settle, and the coarse puffs low down
        // read as the haze wall.
        z = pos[p + 2] + vz * dt + Math.sin(elapsed * 0.5 + phase) * 0.25 * dt;
        y = pos[p + 1] + (Math.sin(elapsed * 0.35 + phase * 2) * 0.25 - cfg.fall) * dt;
      } else {
        z = pos[p + 2] + vz * dt;
        y = pos[p + 1] - cfg.fall * (0.85 + 0.35 * jitter) * dt;
      }
      if (x < -box.r) x += span; else if (x > box.r) x -= span;
      if (y < box.y0) {
        y += height;
        // Re-seed the column on the way round so rain does not fall in fixed curtains.
        pos[p] = (rand() * 2 - 1) * box.r; pos[p + 2] = (rand() * 2 - 1) * box.r;
      } else if (y > box.y1) y -= height;
      pos[p] = x; pos[p + 1] = y; pos[p + 2] = z;
    }
    // Only rain reads as a slanted streak; flakes and haze stay upright blobs.
    sp.uniforms.uShear.value = sp === rain ? shear : 0;
    sp.posAttr.needsUpdate = true;
  }

  function update(dt, elapsed, camera) {
    if (disposed) return;
    if (!(dt > 0)) dt = 1 / 60;
    if (dt > 0.1) dt = 0.1;
    stepFade(1 - Math.exp(-dt / FADE_TAU));
    stepWind(elapsed, dt);
    // Streak lean is the wind projected into the camera plane, normalised by fall speed.
    const e = camera.matrixWorld.elements;
    const lateral = wind.x * e[0] + wind.z * e[2];
    const along = -(wind.x * e[8] + wind.z * e[10]);
    const shear = Math.max(-0.55, Math.min(0.55, (lateral - 0.3 * along) / SPEC.rain.fall));
    for (let s = 0; s < 4; s++) {
      const sp = species[s];
      if (sp.active > 0) {
        // The recycle box rides with the camera horizontally; y stays pinned to ground.
        sp.points.position.set(camera.position.x, 0, camera.position.z);
        sp.uniforms.uTime.value = elapsed;
        stepFalling(sp, dt, elapsed, shear);
      } else sp.points.visible = false;
    }
    // Snow wets at a third the rate (it has to melt first); drying lags wetting.
    const wetTarget = Math.min(1, rain.weight + snow.weight * 0.3);
    wetness += (wetTarget - wetness) * Math.min(1, dt / (wetTarget > wetness ? 0.5 : 4));
    if (wetness < 0.001) wetness = 0;
    visibility = 1 - Math.min(0.85, dust.weight * 0.72 + rain.weight * 0.16 + snow.weight * 0.12);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const sp of species) { scene.remove(sp.points); sp.geo.dispose(); sp.mat.dispose(); }
    for (const t of textures) t.dispose();
    species.length = 0; textures.length = 0;
  }

  setQuality('high');
  return {
    set, update, setQuality, dispose,
    // 0..1 ground wetness: tracks rain closely, lags seconds after it stops.
    get wetness() { return wetness; },
    // Ground wind in m/s along world X and Z (no Y); the object is reused each frame.
    get gust() { return wind; },
    // 1 = clear air, ~0.15 in a full dust storm; for fog density / post to consume.
    get visibility() { return visibility; },
  };
}
