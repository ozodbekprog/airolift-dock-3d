import * as THREE from 'three';

// Units: 1 unit = 1 metre, Y-up, pad top surface at y = 0, product footprint centred on origin.
// All textures are in-code DataTextures: zero fetched assets, byte-deterministic across hosts.

const PAPER = 0xf2f1ee, INK = 0x14171a, SHELL = 0xd9ddee, SIGNAL = 0xff7a18;
const SHELL_RGB = [217, 221, 224], PAPER_RGB = [242, 241, 238], SIGNAL_RGB = [255, 122, 24];
const FOOT = { x: 1.7, z: 1.0 };                  // dock product footprint (half-extents)
const PAD = { x: FOOT.x + 0.9, z: FOOT.z + 0.7, thickness: 0.32 };
const BEVEL = { size: 0.06, thickness: 0.05 };    // the pad's chamfered lip
const PAINT = { x: FOOT.x + 0.26, z: FOOT.z + 0.26, w: 0.045 };
const DRAIN = { x: PAD.x - 0.44, z: -PAD.z + 0.44, r: 0.115 };
const PAD_TILE = 1.5;                             // saw-cut joint grid, metres
const SURROUND_R = 240;                           // sits deep inside the fog wall at every distance
const SUN_DIST = 26, DAWN = 5.4, DUSK = 19.4;
const REBAKE_MIN_INTERVAL = 0.9, CONV_EPS = 0.003;

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Sun/moon discs and the horizon haze band are shader lobes, not meshes: a couple of HDR-bright
// points is all the PMREM bake needs for the specular streak, and geometry discs alias at low dome
// tessellation. Dither is on because a wide smooth gradient bands visibly under ACES.
const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
uniform vec3 uZenith, uHorizon, uUnder, uSunDir, uMoonDir, uSunColor, uMoonColor, uHazeColor;
uniform float uSunDisc, uMoonDisc, uSunHdr, uMoonHdr, uHaze, uHazeDepth;
float lobe(vec3 d, vec3 b, float soft, float core) { return smoothstep(1.0 - soft, 1.0 - soft * 0.35, dot(d, b)) * core; }
void main() {
  vec3 dir = normalize(vDir);
  vec3 col = mix(uHorizon, uZenith, pow(clamp(dir.y, 0.0, 1.0), 0.42));
  col = mix(col, uUnder, 1.0 - smoothstep(-0.18, 0.015, dir.y));
  col += uHazeColor * exp(-max(dir.y, 0.0) / uHazeDepth) * uHaze;
  float s = dot(dir, uSunDir), m = dot(dir, uMoonDir);
  col += uSunColor * (lobe(dir, uSunDir, 0.00075, uSunDisc) * uSunHdr + pow(max(s, 0.0), 220.0) * uSunDisc * 0.25);
  col += uMoonColor * (lobe(dir, uMoonDir, 0.0013, uMoonDisc) * uMoonHdr + pow(max(m, 0.0), 300.0) * uMoonDisc * 0.18);
  col += (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
}
`;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0, e1, x) => { const t = clamp01((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123; return s - Math.floor(s); };
const mixRGB = (a, b, t, out) => { out[0] = a[0] + (b[0] - a[0]) * t; out[1] = a[1] + (b[1] - a[1]) * t; out[2] = a[2] + (b[2] - a[2]) * t; };

function valueNoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const sx = (x - xi) * (x - xi) * (3 - 2 * (x - xi)), sy = (y - yi) * (y - yi) * (3 - 2 * (y - yi));
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  const ab = a + (b - a) * sx, cd = c + (d - c) * sx;
  return ab + (cd - ab) * sy;
}

function fbm(x, y, octaves) {
  let sum = 0, amp = 0.5, norm = 0;
  for (let i = 0; i < octaves; i++) { sum += valueNoise(x, y) * amp; norm += amp; amp *= 0.5; x *= 2.07; y *= 2.07; }
  return sum / norm;
}

function segDist(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, len2 = vx * vx + vz * vz;
  const t = len2 > 1e-9 ? clamp01(((px - ax) * vx + (pz - az) * vz) / len2) : 0;
  return Math.hypot(px - (ax + vx * t), pz - (az + vz * t));
}

function dataTexture(bytes, size, srgb, repeat) {
  const tex = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(repeat, repeat);
  tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true; tex.needsUpdate = true;
  return tex;
}

// Height field -> tangent-space normals, so the drainage chamfers and anchor dimples respond to the
// real key light instead of being painted-on fake shading.
function sobelToNormal(height, size, strength, out) {
  const at = (x, y) => height[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * strength, dy = (at(x, y + 1) - at(x, y - 1)) * strength;
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1), i = (y * size + x) * 4;
    out[i] = (-dx * inv * 0.5 + 0.5) * 255; out[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
    out[i + 2] = inv * 255; out[i + 3] = 255;
  }
}

const roundedRectShape = (hw, hd, r) => new THREE.Shape()
  .moveTo(-hw + r, -hd).lineTo(hw - r, -hd).quadraticCurveTo(hw, -hd, hw, -hd + r).lineTo(hw, hd - r)
  .quadraticCurveTo(hw, hd, hw - r, hd).lineTo(-hw + r, hd).quadraticCurveTo(-hw, hd, -hw, hd - r)
  .lineTo(-hw, -hd + r).quadraticCurveTo(-hw, -hd, -hw + r, -hd);

export function buildEnvironment(scene, renderer) {
  // PMREM needs a live GL context: headless (tests, SSR) leaves rebake() a deliberate no-op rather
  // than an exception — colours, lights and fog still behave.
  const canBake = !!renderer && typeof renderer.getContext === 'function' && !!renderer.getContext();
  const textures = [], geometries = [], materials = [];
  const anchors = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) anchors.push([sx * (PAINT.x - 0.14), sz * (PAINT.z - 0.14)]);
  anchors.push([0, PAINT.z - 0.14], [0, -(PAINT.z - 0.14)], [PAINT.x - 0.14, 0], [-(PAINT.x - 0.14), 0]);
  const state = {
    hour: 13.5, weather: 'clear', amount: 0, wetness: 0, quality: 'high', pending: true, lastBake: -Infinity, elapsed: 0,
    sunUp: 1, dayF: 1, golden: 0, sunElev: 1, moonElev: -1, exposure: 1, envIntensity: 1.1, fog: 0.017, fogTarget: 0.017,
  };

  // setTimeOfDay writes *targets*; update() damps current values towards them, so scrubbing the hour
  // slider never pops the IBL or the fog.
  const pair = (hex) => ({ cur: new THREE.Color(hex), tgt: new THREE.Color(hex) });
  const dirPair = (x, y, z) => ({ cur: new THREE.Vector3(x, y, z).normalize(), tgt: new THREE.Vector3(x, y, z).normalize() });
  const palette = {
    zenith: pair(0x54749b), horizon: pair(PAPER), under: pair(0x6b7075), sun: pair(0xfff2dd), moon: pair(0xaebfd4),
    haze: pair(0xd6dde3), fog: pair(0xcfd6db), key: pair(0xfff4e8), fill: pair(0xd3dde6), rim: pair(0xeaf1f6),
    bounce: pair(0xb9c0c4), ground: pair(0xcfd3d6), hemiSky: pair(0x9db2c6), hemiGround: pair(0x8f8b84),
  };
  const dirs = {
    key: dirPair(0.4, 0.9, 0.35), fill: dirPair(-0.7, 0.32, -0.5), rim: dirPair(-0.3, 0.5, 0.85),
    bounce: dirPair(0.1, -0.82, 0.5), sun: dirPair(0.4, 0.9, 0.35), moon: dirPair(-0.4, 0.6, -0.5),
  };
  const mk = (hex) => new THREE.Color(hex);
  const NIGHT_ZEN = mk(0x121a26), DAY_ZEN = mk(0x54749b), NIGHT_HOR = mk(0x1c2531), DAY_HOR = mk(0xc9d3da);
  const WARM_HOR = mk(0xe8934a), WARM_SUN = mk(0xffb066), HOT_SUN = mk(0xfff6ec), MOON_COOL = mk(0xaebfd4);
  const MOONLIGHT = mk(0x9fb2cc), KEY_DAY = mk(0xfff8f1), COOL_FILL = mk(0xcfdbe6), WHITE = mk(0xffffff);
  const GREY = mk(0x9aa1a6), DUST = mk(0xc4a274), SNOW = mk(0xeef1f3), INK_C = mk(INK), SHELL_C = mk(SHELL);
  const tmp = new THREE.Color(), tmpB = new THREE.Color();

  // Concrete pad map set: one height field feeds colour, roughness and normals so the saw joints,
  // drainage falls, sump grate, anchor dimples and paint lines all agree under the lighting.
  function buildPadMaps(size) {
    const total = size * size, hx = PAINT.x, hz = PAINT.z, rgb = [0, 0, 0];
    const height = new Float32Array(total), rgba = new Uint8Array(total * 4);
    const rgh = new Uint8Array(total * 4), nrm = new Uint8Array(total * 4);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const wz = -PAD.z + (2 * PAD.z * (py + 0.5)) / size, wx = -PAD.x + (2 * PAD.x * (px + 0.5)) / size, i = py * size + px;
      // One low-frequency field drives height and mottle: this loop is per-pixel at build time.
      const n = fbm(wx * 1.9 + 5.3, wz * 1.9 - 3.1, 3);
      let h = (n - 0.5) * 0.011 + (hash2(px * 1.7, py * 2.3) - 0.5) * 0.0018;
      // Joints on a world grid symmetric about the origin, so the pad centre reads as the datum
      // rather than an arbitrary tile seam.
      const jx = Math.abs(wx - Math.round(wx / PAD_TILE) * PAD_TILE), jz = Math.abs(wz - Math.round(wz / PAD_TILE) * PAD_TILE);
      const joint = Math.min(jx, jz) < 0.009, edge = Math.min(PAD.x - Math.abs(wx), PAD.z - Math.abs(wz));
      let channel = 0, anchor = 0;
      for (let a = 0; a < 4; a++) {
        const ax = a < 2 ? -hx : hx, az = a % 2 === 0 ? -hz : hz;
        channel = Math.max(channel, smoothstep(0.08, 0.022, segDist(wx, wz, ax, az, DRAIN.x, DRAIN.z)));
      }
      const sump = smoothstep(DRAIN.r + 0.035, DRAIN.r * 0.9, Math.hypot(wx - DRAIN.x, wz - DRAIN.z));
      for (let a = 0; a < anchors.length; a++) anchor = Math.max(anchor, smoothstep(0.062, 0.038, Math.hypot(wx - anchors[a][0], wz - anchors[a][1])));
      const paint = (Math.abs(Math.abs(wx) - hx) < PAINT.w && Math.abs(wz) <= hz) || (Math.abs(Math.abs(wz) - hz) < PAINT.w && Math.abs(wx) <= hx);
      const hatch = Math.abs(wz) > hz - 0.55 && wz < 0 && Math.abs(wx) < hx && ((((wx * 3.4 + wz * 1.2) % 0.22) + 0.22) % 0.22) < 0.11;
      h -= (joint ? 0.0045 : 0) + channel * 0.006 + sump * 0.022 + smoothstep(0.1, 0, edge) * 0.004 +
        anchor * 0.02 - (paint ? 0.0008 : 0) - (hatch ? 0.0006 : 0);
      height[i] = h;
      mixRGB(SHELL_RGB, PAPER_RGB, clamp01(n * 1.25 - 0.08), rgb);
      let r = rgb[0], g = rgb[1], b = rgb[2];
      let rough = 0.79 + (n - 0.5) * 0.15 + (hash2(px * 0.9, py * 1.1) - 0.5) * 0.06;
      const fleck = hash2(px * 3.13 + 11, py * 2.71 - 5);
      if (fleck > 0.9962) { r *= 0.6; g *= 0.6; b *= 0.62; }
      else if (fleck < 0.002) { r = Math.min(255, r * 1.13); g = Math.min(255, g * 1.13); b = Math.min(255, b * 1.13); }
      if (joint) { r *= 0.7; g *= 0.7; b *= 0.72; rough = 0.63; }
      if (channel > 0.3) { r *= 0.82; g *= 0.82; b *= 0.84; rough = 0.72; }
      if (sump > 0.5) {
        const grate = Math.abs(wx % 0.03) < 0.011 || Math.abs(wz % 0.03) < 0.011;
        r = grate ? 36 : 64; g = r + 2; b = r + 4; rough = grate ? 0.38 : 0.28;
      }
      if (anchor > 0.4) { r = 150; g = 155; b = 160; rough = 0.33; }
      if (paint) { r = PAPER_RGB[0]; g = PAPER_RGB[1]; b = PAPER_RGB[2]; rough = 0.52; }
      else if (hatch) { r = SIGNAL_RGB[0]; g = SIGNAL_RGB[1]; b = SIGNAL_RGB[2]; rough = 0.47; }
      const o = i * 4, rv = clamp01(rough) * 255;
      rgba[o] = clamp01(r / 255) * 255; rgba[o + 1] = clamp01(g / 255) * 255;
      rgba[o + 2] = clamp01(b / 255) * 255; rgba[o + 3] = 255;
      rgh[o] = rv; rgh[o + 1] = rv; rgh[o + 2] = rv; rgh[o + 3] = 255;
    }
    sobelToNormal(height, size, (size / (2 * PAD.x)) * 0.02, nrm);
    return { color: dataTexture(rgba, size, true, 1), rough: dataTexture(rgh, size, false, 1), normal: dataTexture(nrm, size, false, 1) };
  }

  function buildSurroundMaps(size) {
    const rgba = new Uint8Array(size * size * 4), rgh = new Uint8Array(size * size * 4);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const i = (py * size + px) * 4, n = fbm(px * 0.08, py * 0.08, 4), grit = hash2(px * 5.7, py * 4.1);
      const base = 112 + n * 84 + (grit > 0.985 ? 58 : 0) - (grit < 0.013 ? 40 : 0);
      const rv = clamp01(0.88 + (n - 0.5) * 0.16) * 255;
      rgba[i] = clamp01((base * 1.01) / 255) * 255; rgba[i + 1] = clamp01((base * 1.02) / 255) * 255;
      rgba[i + 2] = clamp01((base * 1.05) / 255) * 255; rgba[i + 3] = 255;
      rgh[i] = rv; rgh[i + 1] = rv; rgh[i + 2] = rv; rgh[i + 3] = 255;
    }
    return { color: dataTexture(rgba, size, true, 140), rough: dataTexture(rgh, size, false, 140) };
  }

  // ------------------------------------------------------------------- sky scene + IBL bake
  const skyScene = new THREE.Scene();
  const skyUniforms = {
    uZenith: { value: palette.zenith.cur }, uHorizon: { value: palette.horizon.cur }, uUnder: { value: palette.under.cur },
    uSunDir: { value: dirs.sun.cur }, uMoonDir: { value: dirs.moon.cur }, uSunColor: { value: palette.sun.cur },
    uMoonColor: { value: palette.moon.cur }, uHazeColor: { value: palette.haze.cur }, uSunDisc: { value: 1 },
    uMoonDisc: { value: 0 }, uSunHdr: { value: 40 }, uMoonHdr: { value: 6 }, uHaze: { value: 0.4 }, uHazeDepth: { value: 0.08 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const dome = new THREE.Mesh(new THREE.SphereGeometry(40, 96, 48), skyMat);
  materials.push(skyMat);
  skyScene.add(dome);
  // The bake reads its own scene so the IBL can carry HDR values the display map never shows.
  const pmrem = canBake ? new THREE.PMREMGenerator(renderer) : null;
  let envRT = null;

  function rebake() {
    if (!pmrem) return;
    if (envRT) envRT.dispose();
    envRT = pmrem.fromScene(skyScene, 0.02, 0.5, 200);
    scene.environment = envRT.texture;
    scene.environmentIntensity = state.envIntensity;
    state.pending = false;
    state.lastBake = state.elapsed;
  }

  // ------------------------------------------------------------------- ground
  const root = new THREE.Group();
  root.name = 'environment';
  scene.add(root);
  // One shared Color for the clear colour, the fog wall and the sky horizon: they must never drift.
  scene.background = palette.fog.cur;
  scene.fog = new THREE.FogExp2(0xcfd6db, state.fog);
  scene.fog.color = palette.fog.cur;

  let padMaps = buildPadMaps(768);
  textures.push(padMaps.color, padMaps.rough, padMaps.normal);
  const padMat = new THREE.MeshPhysicalMaterial({
    color: mk(PAPER), map: padMaps.color, roughnessMap: padMaps.rough, normalMap: padMaps.normal,
    normalScale: new THREE.Vector2(0.85, 0.85), metalness: 0.02, roughness: 1, clearcoat: 0, clearcoatRoughness: 0.3,
  });
  const padGeo = new THREE.ExtrudeGeometry(roundedRectShape(PAD.x, PAD.z, 0.16), {
    depth: PAD.thickness, steps: 1, bevelEnabled: true, bevelThickness: BEVEL.thickness,
    bevelSize: BEVEL.size, bevelSegments: 3, curveSegments: 6,
  });
  const uvAttr = padGeo.attributes.uv;
  for (let i = 0; i < uvAttr.count; i++) uvAttr.setXY(i, (uvAttr.getX(i) + PAD.x) / (2 * PAD.x), (uvAttr.getY(i) + PAD.z) / (2 * PAD.z));
  // Bevel grows the solid by 2*bevelThickness; sinking it puts the top cap exactly on y = 0.
  padGeo.rotateX(-Math.PI / 2).translate(0, -(PAD.thickness + BEVEL.thickness), 0);
  geometries.push(padGeo, dome.geometry);
  materials.push(padMat);
  const ground = new THREE.Mesh(padGeo, padMat);   // the handle the glue layer mounts and queries
  ground.name = 'ground';
  ground.receiveShadow = true;

  const surroundMaps = buildSurroundMaps(512);
  textures.push(surroundMaps.color, surroundMaps.rough);
  // Concentric bands, each larger than the last, all swallowed by fog long before SURROUND_R.
  const bandSpec = [[SURROUND_R, -0.07, 0xa9aeaf, 0.9], [34, -0.055, 0x777b6f, 0.7], [11, -0.045, 0x8f9498, 0.8]];
  const bands = bandSpec.map(([radius, y, hex, env], idx) => {
    const geo = idx === 0 ? new THREE.CircleGeometry(radius, 72).rotateX(-Math.PI / 2)
      : new THREE.RingGeometry(idx === 1 ? 11 : 2.9, radius, 64, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshStandardMaterial({
      map: surroundMaps.color, roughnessMap: surroundMaps.rough, color: mk(hex), roughness: 1, metalness: 0, envMapIntensity: env,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = y;
    mesh.receiveShadow = true;
    geometries.push(geo); materials.push(mat);
    return mesh;
  });

  const socketGeo = new THREE.CylinderGeometry(0.052, 0.043, 0.032, 20, 1, true);
  const socketMat = new THREE.MeshPhysicalMaterial({ color: mk(0x8d9296), metalness: 0.9, roughness: 0.34, side: THREE.DoubleSide, envMapIntensity: 1.1 });
  const sumpGeo = new THREE.CylinderGeometry(DRAIN.r, DRAIN.r, 0.026, 28, 1, true);
  const sumpMat = new THREE.MeshPhysicalMaterial({ color: mk(0x3c4145), metalness: 0.85, roughness: 0.4, side: THREE.DoubleSide });
  geometries.push(socketGeo, sumpGeo); materials.push(socketMat, sumpMat);
  const sockets = new THREE.InstancedMesh(socketGeo, socketMat, anchors.length);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < anchors.length; i++) {
    dummy.position.set(anchors[i][0], -0.004, anchors[i][1]);
    dummy.rotation.y = hash2(i * 3.3, 1.7) * Math.PI;
    dummy.updateMatrix();
    sockets.setMatrixAt(i, dummy.matrix);
  }
  sockets.instanceMatrix.needsUpdate = true;
  sockets.receiveShadow = true;
  const sump = new THREE.Mesh(sumpGeo, sumpMat);
  sump.position.set(DRAIN.x, -0.014, DRAIN.z);
  root.add(ground, ...bands, sockets, sump);

  // ------------------------------------------------------------------- lights
  const key = new THREE.DirectionalLight(0xffffff, 3.0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.018; key.shadow.radius = 2;
  // Tight ortho over the footprint + 0.5 m: exactly one shadow map, so texel density stays high and no
  // second light can double-darken the same contact edge.
  const sc = key.shadow.camera;
  sc.left = -(FOOT.x + 0.5); sc.right = FOOT.x + 0.5; sc.top = FOOT.z + 0.5; sc.bottom = -(FOOT.z + 0.5);
  sc.near = 1; sc.far = SUN_DIST * 2.5; sc.updateProjectionMatrix();
  const fill = new THREE.DirectionalLight(0xffffff, 0.85);
  const rim = new THREE.DirectionalLight(0xffffff, 1.35);
  const bounce = new THREE.DirectionalLight(0xffffff, 0.45);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x8f8b84, 0.45);
  fill.castShadow = rim.castShadow = bounce.castShadow = false;   // edge lights must not re-shadow
  const keyTarget = new THREE.Object3D();
  keyTarget.position.set(0, 0.3, 0);
  root.add(keyTarget, key, fill, rim, bounce, hemi);
  key.target = keyTarget;
  const strength = { key: 3, fill: 0.85, rim: 1.35, bounce: 0.45, hemi: 0.45 };
  const strengthTgt = { key: 3, fill: 0.85, rim: 1.35, bounce: 0.45, hemi: 0.45 };

  function poseLights() {
    key.position.copy(dirs.key.cur).multiplyScalar(SUN_DIST);
    fill.position.copy(dirs.fill.cur).multiplyScalar(SUN_DIST);
    rim.position.copy(dirs.rim.cur).multiplyScalar(SUN_DIST);
    bounce.position.copy(dirs.bounce.cur).multiplyScalar(SUN_DIST * 0.7);
    key.intensity = strength.key; fill.intensity = strength.fill; rim.intensity = strength.rim;
    bounce.intensity = strength.bounce; hemi.intensity = strength.hemi;
    key.color.copy(palette.key.cur); fill.color.copy(palette.fill.cur); rim.color.copy(palette.rim.cur);
    bounce.color.copy(palette.bounce.cur); hemi.color.copy(palette.hemiSky.cur); hemi.groundColor.copy(palette.hemiGround.cur);
  }

  function commit() {
    skyUniforms.uSunDisc.value = state.sunUp;
    skyUniforms.uMoonDisc.value = 1 - state.sunUp;
    skyUniforms.uHaze.value = 0.32 + state.amount * 0.5 + (1 - state.dayF) * 0.12;
    skyUniforms.uHazeDepth.value = 0.055 + state.amount * 0.15;
    scene.fog.density = state.fog;
    if (scene.environment) scene.environmentIntensity = state.envIntensity;
  }

  // Wetness is a single knob: roughness falls, clearcoat rises, the relief flattens and the surface
  // darkens — snow reuses it as cover whiteness.
  function applyFinish() {
    const wet = state.wetness, snow = state.weather === 'snow';
    padMat.clearcoat = Math.max(wet * 0.65, snow ? state.amount * 0.22 : 0);
    padMat.clearcoatRoughness = 0.07 + (1 - wet) * 0.3;
    padMat.roughness = THREE.MathUtils.lerp(1, 0.52, wet);
    padMat.normalScale.setScalar(0.85 - wet * 0.45);
    padMat.color.setHex(PAPER).multiplyScalar(1 - wet * 0.28);
    if (snow) padMat.color.copy(tmpB.setHex(PAPER).lerp(tmp.copy(SNOW).multiplyScalar(0.4 + state.amount * 0.6), state.amount * (0.3 + wet * 0.5)));
    const base = [0xa9aeaf, 0x777b6f, 0x8f9498], cut = [0.25, 0.2, 0.25];
    for (let i = 0; i < bands.length; i++) {
      const c = bands[i].material.color;
      c.setHex(base[i]).multiplyScalar(1 - wet * cut[i]);
      if (snow) c.lerp(SNOW, state.amount * (0.72 + i * 0.04));
    }
  }

  function refresh() {
    const dayT = (state.hour - DAWN) / (DUSK - DAWN);
    const elev = Math.sin(dayT * Math.PI) * 1.08;             // sinks below the horizon outside the window
    const az = -1.95 + clamp01(dayT) * 3.9, ce = Math.cos(elev), moonAz = az + Math.PI;
    const moonElev = THREE.MathUtils.clamp(-elev * 0.85 + 0.18, -0.4, 1), mc = Math.cos(moonElev);
    dirs.sun.tgt.set(Math.sin(az) * ce, Math.max(elev, -0.95), Math.cos(az) * ce).normalize();
    dirs.moon.tgt.set(Math.sin(moonAz) * mc, Math.max(moonElev, -0.2), Math.cos(moonAz) * mc).normalize();
    state.sunElev = elev; state.moonElev = moonElev;
    const night = elev <= 0.005, moonUp = night ? smoothstep(-0.4, 0.12, moonElev) : 0;
    state.dayF = smoothstep(-0.07, 0.33, elev); state.sunUp = smoothstep(-0.03, 0.06, elev);
    state.golden = night ? 0 : clamp01(1 - elev / 0.45);
    const a = state.amount;
    const rain = state.weather === 'rain', snow = state.weather === 'snow', dust = state.weather === 'dust';
    palette.zenith.tgt.copy(NIGHT_ZEN).lerp(DAY_ZEN, state.dayF).lerp(WARM_HOR, state.golden * 0.2 * state.sunUp);
    palette.horizon.tgt.copy(NIGHT_HOR).lerp(DAY_HOR, state.dayF).lerp(WARM_HOR, state.golden * 0.82 * state.sunUp);
    palette.under.tgt.copy(INK_C).lerp(SHELL_C, 0.3 + state.dayF * 0.55);
    palette.moon.tgt.copy(MOON_COOL).multiplyScalar(0.5 + moonUp * 0.65);
    palette.sun.tgt.copy(WARM_SUN).lerp(HOT_SUN, clamp01(elev / 0.6)).multiplyScalar(1 - a * (rain ? 0.75 : 0.45));
    palette.haze.tgt.copy(palette.horizon.tgt).lerp(GREY, 0.32 + a * 0.4).multiplyScalar(1 - a * 0.18);
    palette.fog.tgt.copy(palette.horizon.tgt).lerp(GREY, 0.22 + a * 0.5).multiplyScalar(0.62 + state.dayF * 0.48);
    if (dust) palette.fog.tgt.lerp(DUST, a * 0.7);
    if (snow) palette.fog.tgt.lerp(SNOW, a * 0.6);
    palette.key.tgt.copy(night ? MOONLIGHT : WARM_SUN).lerp(KEY_DAY, clamp01(Math.max(elev, night ? moonElev * 0.3 : elev) / 0.7));
    palette.fill.tgt.copy(palette.horizon.tgt).lerp(COOL_FILL, 0.45);
    palette.rim.tgt.copy(palette.zenith.tgt).lerp(WHITE, 0.55); palette.bounce.tgt.copy(palette.under.tgt).lerp(WHITE, 0.2);
    palette.hemiSky.tgt.copy(palette.zenith.tgt).lerp(palette.horizon.tgt, 0.4); palette.hemiGround.tgt.copy(palette.under.tgt);
    palette.ground.tgt.copy(palette.under.tgt).lerp(SHELL_C, 0.4);
    const sunK = Math.pow(state.sunUp, 0.75), lowSun = 0.5 + 0.5 * clamp01(elev / 0.55);
    strengthTgt.key = 0.15 + sunK * 3.15 * lowSun + moonUp * 0.3; strengthTgt.fill = 0.22 + state.dayF * 0.95 + moonUp * 0.12;
    strengthTgt.rim = 0.5 + state.dayF * 1.15 + moonUp * 0.45; strengthTgt.bounce = 0.12 + state.dayF * 0.42 + moonUp * 0.06;
    strengthTgt.hemi = 0.16 + state.dayF * 0.5 + moonUp * 0.08;
    // Overcast flattens like the real thing: directionals down, ambient and fog up.
    const flat = a * (rain ? 1 : snow ? 0.9 : dust ? 0.8 : 0.5);
    strengthTgt.key *= 1 - flat * 0.72; strengthTgt.fill *= 1 + flat * 0.6;
    strengthTgt.rim *= 1 - flat * 0.4; strengthTgt.hemi *= 1 + flat * 0.9;
    const body = night ? dirs.moon.tgt : dirs.sun.tgt;
    dirs.key.tgt.copy(body);
    dirs.fill.tgt.set(-body.x * 0.9, 0.34, -body.z * 0.9).normalize();
    dirs.rim.tgt.set(-body.x * 0.55 + 0.55, 0.5, -body.z * 0.55 - 0.62).normalize();
    dirs.bounce.tgt.set(body.x * 0.3, -0.82, body.z * 0.3).normalize();
    state.fogTarget = 0.016 + (1 - state.dayF) * 0.006 - state.wetness * 0.001 +
      a * (rain ? 0.032 : snow ? 0.03 : dust ? 0.042 : 0.008);
    state.envIntensity = (0.36 + state.dayF * 0.9) * (1 - a * 0.4) + state.wetness * 0.18;
    state.exposure = THREE.MathUtils.lerp(1, 1.34, 1 - state.dayF) + state.golden * state.sunUp * 0.05 +
      a * (snow ? 0.14 : rain ? 0.08 : dust ? 0.05 : 0.02);
    skyUniforms.uSunHdr.value = 14 + sunK * 44; skyUniforms.uMoonHdr.value = 2.2 + moonUp * 7;
    applyFinish();
    state.pending = true;
  }

  function converged() {
    for (const n in palette) { const p = palette[n]; if (Math.abs(p.cur.r - p.tgt.r) + Math.abs(p.cur.g - p.tgt.g) + Math.abs(p.cur.b - p.tgt.b) > CONV_EPS) return false; }
    for (const n in dirs) { const p = dirs[n]; if (Math.abs(p.cur.x - p.tgt.x) + Math.abs(p.cur.y - p.tgt.y) + Math.abs(p.cur.z - p.tgt.z) > CONV_EPS) return false; }
    return Math.abs(state.fog - state.fogTarget) < 1e-4;
  }

  function setTimeOfDay(hour) { state.hour = THREE.MathUtils.clamp(Number.isFinite(hour) ? hour : 13.5, 0, 24); refresh(); }

  function setWeatherTint(kind, amount) {
    if (kind !== 'clear' && kind !== 'rain' && kind !== 'snow' && kind !== 'dust') return;
    state.weather = kind;
    state.amount = kind === 'clear' ? 0 : THREE.MathUtils.clamp(Number(amount) || 0, 0, 1);
    refresh();
  }

  function setWetness(amount) { state.wetness = THREE.MathUtils.clamp(Number(amount) || 0, 0, 1); refresh(); }
  function setExposure() { return state.exposure; }

  function setQuality(level) {
    if ((level !== 'high' && level !== 'low') || state.quality === level) return;
    state.quality = level;
    const high = level === 'high', mapSize = high ? 2048 : 1024, seg = high ? 96 : 40;
    if (key.shadow.mapSize.width !== mapSize) {
      key.shadow.mapSize.set(mapSize, mapSize);
      if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; }
    }
    if (dome.geometry.parameters.widthSegments !== seg) {
      const old = dome.geometry;
      dome.geometry = new THREE.SphereGeometry(40, seg, Math.max(20, seg >> 1));
      geometries[geometries.indexOf(old)] = dome.geometry; old.dispose();
    }
    for (const tex of textures) tex.dispose();
    textures.length = 0;
    padMaps = buildPadMaps(high ? 768 : 384);
    const next = buildSurroundMaps(high ? 512 : 256);
    textures.push(padMaps.color, padMaps.rough, padMaps.normal, next.color, next.rough);
    padMat.map = padMaps.color; padMat.roughnessMap = padMaps.rough;
    padMat.normalMap = padMaps.normal; padMat.needsUpdate = true;
    for (const band of bands) { band.material.map = next.color; band.material.roughnessMap = next.rough; band.material.needsUpdate = true; }
    sockets.visible = sump.visible = high;
    state.pending = true;
  }

  function update(dt, elapsed) {
    const step = Math.max(typeof dt === 'number' ? dt : 0, 0);
    state.elapsed = typeof elapsed === 'number' ? elapsed : state.elapsed + step;
    // Exponential smoothing: framerate independent, and this path allocates nothing.
    const k = 1 - Math.exp(-step * 7);
    for (const n in palette) palette[n].cur.lerp(palette[n].tgt, k);
    for (const n in dirs) dirs[n].cur.lerp(dirs[n].tgt, k).normalize();
    for (const n in strength) strength[n] = THREE.MathUtils.damp(strength[n], strengthTgt[n], 7, step);
    state.fog = THREE.MathUtils.damp(state.fog, state.fogTarget, 5, step);
    poseLights();
    commit();
    if (converged()) state.pending = false;
    if (state.pending && state.elapsed - state.lastBake >= REBAKE_MIN_INTERVAL) rebake();
  }

  function dispose() {
    root.removeFromParent();
    if (pmrem) pmrem.dispose();
    if (envRT) { envRT.dispose(); envRT = null; }
    sockets.dispose();
    for (const geo of geometries) geo.dispose();
    for (const mat of materials) mat.dispose();
    for (const tex of textures) tex.dispose();
    scene.fog = null; scene.environment = null; scene.background = null; scene.environmentIntensity = 1;
  }

  // Nothing to damp towards on the first frame, so snap once and bake: the integrator may render a
  // single hero frame before update() ever runs.
  setTimeOfDay(13.5);
  for (const n in palette) palette[n].cur.copy(palette[n].tgt);
  for (const n in dirs) dirs[n].cur.copy(dirs[n].tgt);
  for (const n in strength) strength[n] = strengthTgt[n];
  state.fog = state.fogTarget;
  poseLights();
  commit();
  rebake();

  return {
    setTimeOfDay, rebake, setWeatherTint, setExposure, setQuality, ground, setWetness,
    lights: { key, fill, rim, bounce, hemi }, sunDir: dirs.sun.cur, update, dispose,
  };
}
