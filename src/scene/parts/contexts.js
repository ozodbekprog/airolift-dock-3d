import * as THREE from 'three';

// Shared context environments for the AiroLift D2 product scene.
// Units: 1 unit = 1 metre, ground/pad top at y = 0, dock footprint 1.5 x 1.15 at origin.
// A clear, level 2.6 x 2.4 box around the origin is never intruded by geometry.

const NAMES = ['default', 'solar', 'warehouse', 'perimeter', 'plant'];
const PAL = { paper: 0xf2f1ee, ink: 0x14171a, shell: 0xd9dde0, orange: 0xff7a18 };
const XI = 1.45; // keep-clear half extents (plus margin)
const ZI = 1.35;

const GLYPHS = {
  '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001010010010',
  '8': '111101111101111', '9': '111101111001111', 'A': '010101111101101', 'B': '110101110101110',
  'D': '110101101101110', 'E': '111100111100111', 'F': '111100111100100', 'G': '111100101101111',
  'H': '101101111101101', 'I': '111010010010111', 'L': '100100100100111', 'N': '110101101101101',
  'O': '111101101101111', 'P': '111101111100100', 'R': '111101111110101', 'S': '011100011001110',
  'T': '111010010010010', 'U': '101101101101111', 'W': '101101101111010', 'Y': '101101010010010',
};

function hash(x, y) { const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return n - Math.floor(n); }

function setPx(data, w, x, y, c) {
  if (x < 0 || y < 0 || x >= w || y * w * 4 >= data.length) return;
  const i = (y * w + x) * 4;
  data[i] = c[0]; data[i + 1] = c[1]; data[i + 2] = c[2]; data[i + 3] = c.length > 3 ? c[3] : 255;
}

function fillRect(data, w, x0, y0, rw, rh, c) {
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) setPx(data, w, x, y, c);
}

function blitText(data, w, text, x0, y0, scale, c) {
  let cx = x0;
  for (const ch of text) {
    const g = GLYPHS[ch] || GLYPHS[' '];
    if (g) for (let r = 0; r < 5; r++) for (let q = 0; q < 3; q++)
      if (g[r * 3 + q] === '1') fillRect(data, w, cx + q * scale, y0 + r * scale, scale, scale, c);
    cx += (g ? 3 : 2) * scale + scale;
  }
}

function makeTex(size, painter, meters) {
  const data = new Uint8Array(size * size * 4);
  painter(data, size);
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  const s = 1 / (meters || 2);
  t.repeat.set(s, s);
  t.needsUpdate = true;
  return t;
}

function paintConcrete(data, size) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = hash(x, y);
    const v = 200 + Math.floor(n * 18);
    let c = [v - 2, v, v + 2];
    if ((y % 128) < 2 || (x % 128) < 2) c = [v - 34, v - 32, v - 28];
    setPx(data, size, x, y, c);
  }
}

function paintGravel(data, size) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const n = hash(x * 3, y * 5);
    const v = 120 + Math.floor(n * 90);
    setPx(data, size, x, y, n < 0.12 ? [v - 40, v - 38, v - 30] : [v, v + 2, v + 4]);
  }
}

function paintHatch(data, size) {
  paintConcrete(data, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = ((x + y * 2) % 96 + 96) % 96;
    if (d < 42) setPx(data, size, x, y, [22, 24, 26]);
    if (y < 5 || y > size - 6 || x < 5 || x > size - 6) setPx(data, size, x, y, [238, 238, 236]);
  }
}

function paintRoller(data, size) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const band = y % 32;
    const v = 168 + Math.floor(hash(x, y) * 12) - (band < 3 ? 58 : band > 28 ? 22 : 0);
    setPx(data, size, x, y, [v, v + 3, v + 7]);
  }
}

function paintFence(data, size) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const on = (x % 32 < 4) || (y % 32 < 4);
    setPx(data, size, x, y, [168, 172, 176, on ? 255 : 0]);
  }
}

function paintGrating(data, size) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const bar = (x % 16 < 7) || (y % 64 < 5) || (y % 64 > 60);
    setPx(data, size, x, y, [122, 128, 132, bar ? 255 : 0]);
  }
}

function paintBay(data, size) {
  paintConcrete(data, size);
  const white = [236, 236, 232], orange = [255, 122, 24];
  fillRect(data, size, 0, 40, size, 5, white);
  fillRect(data, size, 0, size - 46, size, 5, white);
  for (let col = 0; col < 4; col++) {
    const cx = 32 + col * 64;
    for (let row = 0; row < 2; row++) {
      const y0 = 60 + row * 96;
      for (let t = 0; t < 26; t++) {
        fillRect(data, size, cx - 13 + t, y0 + 26 - t, 1, 1, white);
        fillRect(data, size, cx - 13 + t, y0 + t, 1, 1, white);
      }
    }
    blitText(data, size, 'BAY ' + (col + 1), 8 + col * 64, size - 30, 4, orange);
  }
  fillRect(data, size, 0, 0, 6, size, orange);
  fillRect(data, size, size - 6, 0, 6, size, orange);
}

function roundedRect(w, d, r) {
  const s = new THREE.Shape();
  const x = w / 2, y = d / 2, rr = Math.max(0.004, Math.min(r, x - 0.004, y - 0.004));
  s.moveTo(-x + rr, -y);
  s.lineTo(x - rr, -y); s.quadraticCurveTo(x, -y, x, -y + rr);
  s.lineTo(x, y - rr); s.quadraticCurveTo(x, y, x - rr, y);
  s.lineTo(-x + rr, y); s.quadraticCurveTo(-x, y, -x, y - rr);
  s.lineTo(-x, -y + rr); s.quadraticCurveTo(-x, -y, -x + rr, -y);
  return s;
}

function slab(w, h, d, r) {
  const bev = Math.min(0.02, h * 0.3);
  const geo = new THREE.ExtrudeGeometry(roundedRect(w - bev * 2, d - bev * 2, r === undefined ? 0.04 : r), {
    depth: Math.max(0.002, h - bev * 2), bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
    bevelSegments: 1, curveSegments: 3,
  });
  geo.rotateX(-Math.PI / 2); geo.center();
  return geo;
}

function boxSlab(w, h, d) {
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape([
    new THREE.Vector2(-w / 2, -d / 2), new THREE.Vector2(w / 2, -d / 2),
    new THREE.Vector2(w / 2, d / 2), new THREE.Vector2(-w / 2, d / 2),
  ]), { depth: h, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2); geo.center();
  return geo;
}

function planeGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h);
  g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv.array;
  for (let i = 0; i < uv.length; i += 2) { uv[i] *= w; uv[i + 1] *= h; }
  g.attributes.uv.needsUpdate = true;
  return g;
}

function latheProfile(pts, segs) {
  return new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p[0], p[1])), segs || 14);
}

function palletGeo() {
  const s = new THREE.Shape([
    new THREE.Vector2(-0.6, -0.5), new THREE.Vector2(0.6, -0.5), new THREE.Vector2(0.6, 0.5), new THREE.Vector2(-0.6, 0.5),
  ]);
  for (let k = -1; k <= 1; k++) {
    const h = new THREE.Path();
    const cx = k * 0.38;
    h.moveTo(cx - 0.11, -0.46); h.lineTo(cx + 0.11, -0.46); h.lineTo(cx + 0.11, 0.46); h.lineTo(cx - 0.11, 0.46);
    s.holes.push(h);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: false });
  g.rotateX(-Math.PI / 2); g.center();
  return g;
}

function iBeamGeo(h) {
  const w = 0.22, tf = 0.03, ww = 0.024;
  const pts = [
    [-w / 2, 0], [w / 2, 0], [w / 2, tf], [ww / 2, tf], [ww / 2, h - tf], [w / 2, h - tf],
    [w / 2, h], [-w / 2, h], [-w / 2, h - tf], [-ww / 2, h - tf], [-ww / 2, tf], [-w / 2, tf],
  ].map((p) => new THREE.Vector2(p[0], p[1]));
  const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: 0.6, bevelEnabled: false });
  g.center();
  return g;
}

export function buildContexts(scene) {
  const roots = new Map();
  const anims = new Map();
  const emissives = [];
  const wetted = [];
  const counts = [];
  const details = [];
  const dummy = new THREE.Object3D();
  let quality = 'high';
  let current = null;

  function mk(def) {
    const m = new THREE.MeshStandardMaterial(def);
    m.userData.r0 = m.roughness;
    wetted.push(m);
    if (def.emissive !== undefined && def.emissive !== 0x000000) {
      m.userData.em = true;
      emissives.push({ m, base: def.emissiveIntensity || 1, flick: false });
    }
    return m;
  }

  const T = {
    concrete: makeTex(256, paintConcrete, 2),
    gravel: makeTex(256, paintGravel, 2),
    hatch: makeTex(256, paintHatch, 2),
    roller: makeTex(128, paintRoller, 1.1),
    fence: makeTex(128, paintFence, 1),
    grating: makeTex(128, paintGrating, 0.5),
    bay: makeTex(256, paintBay, 8),
  };

  const M = {
    concrete: mk({ map: T.concrete, roughness: 0.9, metalness: 0.05 }),
    gravel: mk({ map: T.gravel, roughness: 0.95, metalness: 0.02 }),
    hatch: mk({ map: T.hatch, roughness: 0.82, metalness: 0.04 }),
    bay: mk({ map: T.bay, roughness: 0.85, metalness: 0.05 }),
    roller: mk({ map: T.roller, roughness: 0.55, metalness: 0.55, color: 0xb9bec3 }),
    fence: mk({ map: T.fence, roughness: 0.6, metalness: 0.6, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xa8adb2 }),
    grating: mk({ map: T.grating, roughness: 0.5, metalness: 0.8, alphaTest: 0.5, side: THREE.DoubleSide, color: 0x9aa0a4 }),
    steel: mk({ color: PAL.shell, roughness: 0.45, metalness: 0.75 }),
    dark: mk({ color: 0x3a4046, roughness: 0.5, metalness: 0.7 }),
    ink: mk({ color: PAL.ink, roughness: 0.6, metalness: 0.2 }),
    orange: mk({ color: PAL.orange, roughness: 0.5, metalness: 0.1 }),
    paper: mk({ color: PAL.paper, roughness: 0.7, metalness: 0.05 }),
    wood: mk({ color: 0x9a7c50, roughness: 0.8, metalness: 0.03 }),
    panel: mk({ color: 0x222c3a, roughness: 0.12, metalness: 0.85 }),
    glow: mk({ color: PAL.orange, emissive: PAL.orange, emissiveIntensity: 1.6, roughness: 0.4, metalness: 0 }),
    flare: mk({ color: 0x201c18, emissive: 0xff5a10, emissiveIntensity: 2.0, roughness: 0.9, metalness: 0 }),
    warm: mk({ color: 0x201e1a, emissive: 0xffa040, emissiveIntensity: 1.1, roughness: 0.6, metalness: 0.2 }),
  };
  M.flare.userData.em = true;
  for (const en of emissives) if (en.m === M.flare) en.flick = true;

  function put(parent, geo, mat, x, y, z, rx, ry, rz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.set(rx || 0, ry || 0, rz || 0);
    parent.add(m);
    return m;
  }

  function inst(parent, geo, mat, items, low) {
    const im = new THREE.InstancedMesh(geo, mat, items.length);
    for (let i = 0; i < items.length; i++) {
      const t = items[i];
      dummy.position.set(t.p[0], t.p[1], t.p[2]);
      dummy.rotation.set(t.r ? t.r[0] : 0, t.r ? t.r[1] : 0, t.r ? t.r[2] : 0);
      dummy.scale.set(t.s ? t.s[0] : 1, t.s ? t.s[1] : 1, t.s ? t.s[2] : 1);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    if (quality === 'low' && low != null && low < items.length) im.count = low;
    if (low != null && low < items.length) counts.push({ m: im, high: items.length, low });
    parent.add(im);
    return im;
  }

  function frame(parent, mat, xo, zo) {
    xo = xo || 6; zo = zo || 5;
    const ns = slab(2 * xo, 0.14, zo - ZI, 0.03);
    const ew = slab(xo - XI, 0.14, 2 * ZI, 0.03);
    put(parent, ns, mat, 0, -0.09, ZI + (zo - ZI) / 2);
    put(parent, ns, mat, 0, -0.09, -ZI - (zo - ZI) / 2);
    put(parent, ew, mat, XI + (xo - XI) / 2, -0.09, 0);
    put(parent, ew, mat, -XI - (xo - XI) / 2, -0.09, 0);
  }

  // ---------------------------------------------------------------- default
  function buildDefault() {
    const g = new THREE.Group();
    frame(g, M.concrete, 6.5, 5);
    const hatch = slab(4.6, 0.012, 0.5, 0.01);
    put(g, hatch, M.hatch, 0, -0.014, 1.66);
    put(g, hatch, M.hatch, 0, -0.014, -1.66);
    const geoB = latheProfile([[0, 0], [0.095, 0], [0.095, 0.06], [0.075, 0.08], [0.072, 0.42], [0.068, 0.5], [0.05, 0.56], [0, 0.58]], 14);
    inst(g, geoB, M.orange, [
      { p: [1.85, 0.002, 1.7] }, { p: [-1.85, 0.002, 1.7] },
      { p: [1.85, 0.002, -1.7] }, { p: [-1.85, 0.002, -1.7] },
    ], 2);
    const band = slab(0.16, 0.09, 0.16, 0.02);
    inst(g, band, M.ink, [
      { p: [1.85, 0.34, 1.7] }, { p: [-1.85, 0.34, 1.7] },
      { p: [1.85, 0.34, -1.7] }, { p: [-1.85, 0.34, -1.7] },
    ], 2);
    const drain = slab(2.4, 0.05, 0.16, 0.02);
    put(g, drain, M.dark, 0, -0.026, 2.55);
    const cover = planeGeo(2.3, 0.14);
    put(g, cover, M.grating, 0, 0.002, 2.55);
    const cable = latheProfile([[0.045, 0], [0.05, 0.05], [0.05, 0.1], [0.045, 0.11]], 10);
    inst(g, cable, M.ink, [{ p: [2.4, -0.02, 2.2] }, { p: [-2.4, -0.02, 2.2] }], 2);
    return { group: g, anim: null };
  }

  // ------------------------------------------------------------------ solar
  function buildSolar() {
    const g = new THREE.Group();
    frame(g, M.concrete, 6.5, 4.4);
    put(g, planeGeo(70, 90), M.gravel, 0, -0.045, -18);
    put(g, planeGeo(40, 2.2), M.gravel, 0, -0.012, 5.9);
    const rows = [];
    const panels = slab(3.4, 0.06, 1.9, 0.03);
    panels.rotateX(-0.47);
    const post = new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8);
    const items = [], posts = [];
    const n = quality === 'low' ? 4 : 8, cols = quality === 'low' ? 2 : 3;
    for (let r = 0; r < n; r++) {
      const z = -7.5 - r * 4.6;
      for (let c = 0; c < cols; c++) {
        const x = (c - (cols - 1) / 2) * 3.9;
        items.push({ p: [x, 0.72, z] });
        posts.push({ p: [x - 1.3, 0.42, z + 0.28] }, { p: [x + 1.3, 0.72, z - 0.28] });
      }
    }
    inst(g, panels, M.panel, items, 8);
    inst(g, post, M.dark, posts, 16);
    const skid = slab(2.4, 1.1, 1.0, 0.05);
    const plinth = slab(2.6, 0.22, 1.2, 0.03);
    const locations = [[-7.2, 8.4], [8.6, 10.2]];
    for (let i = 0; i < 2; i++) {
      const [x, z] = locations[i];
      put(g, plinth, M.concrete, x, 0.11, z);
      put(g, skid, M.steel, x, 0.77, z, 0, i ? 0.3 : -0.2, 0);
      put(g, slab(0.5, 0.5, 0.5, 0.03), M.orange, x, 1.45, z + 0.5);
    }
    const louvreGeo = slab(0.86, 0.05, 0.1, 0.01);
    const lv = [];
    for (let i = 0; i < 2; i++) for (let k = 0; k < 7; k++)
      lv.push({ p: [locations[i][0], 0.5 + k * 0.13, locations[i][1] + 0.53], r: [0.6, i ? 0.3 : -0.2, 0] });
    inst(g, louvreGeo, M.ink, lv, 8);
    const flap = put(g, slab(0.9, 0.04, 0.5, 0.01), M.dark, locations[0][0], 0.5, locations[0][1] - 0.62);
    const rack = new THREE.Group();
    const leg = new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6);
    const beam = slab(2.8, 0.1, 0.3, 0.02);
    const shelf = slab(2.7, 0.05, 0.9, 0.01);
    for (const s of [-1.2, 0, 1.2]) { put(rack, leg, M.steel, s, 0.8, -0.45); put(rack, leg, M.steel, s, 0.8, 0.45); }
    put(rack, beam, M.steel, 0, 1.55, -0.45); put(rack, beam, M.steel, 0, 1.55, 0.45, 0, 0, 0);
    put(rack, shelf, M.steel, 0, 0.75, 0); put(rack, shelf, M.steel, 0, 1.5, 0);
    put(rack, slab(1.1, 0.05, 0.7, 0.02), M.panel, -0.7, 0.82, 0, 0, 0.2, 0);
    put(rack, slab(1.1, 0.05, 0.7, 0.02), M.panel, 0.6, 1.6, 0, 0.28, 0.1, 0);
    rack.position.set(9.2, 0, 3.2);
    rack.rotation.y = -0.35;
    g.add(rack);
    const anim = (dt, e) => { flap.rotation.x = 0.35 + Math.sin(e * 0.7) * 0.12; };
    return { group: g, anim };
  }

  // -------------------------------------------------------------- warehouse
  function buildWarehouse() {
    const g = new THREE.Group();
    frame(g, M.concrete, 7, 4);
    put(g, planeGeo(16, 10), M.bay, 0, -0.016, 6.6);
    put(g, planeGeo(16, 4.2), M.concrete, 0, -0.016, -3.6);
    const wall = slab(22, 6, 0.5, 0.05);
    put(g, wall, M.concrete, 0, 3, -6.2);
    const pil = slab(0.45, 6.2, 0.35, 0.03);
    inst(g, pil, M.paper, [{ p: [-9, 3.1, -5.9] }, { p: [-4.6, 3.1, -5.9] }, { p: [0.9, 3.1, -5.9] }, { p: [5.3, 3.1, -5.9] }, { p: [9.7, 3.1, -5.9] }], 3);
    put(g, slab(11, 0.7, 0.6, 0.03), M.dark, 0, 6.3, -6.1);
    put(g, slab(3.4, 3.4, 0.12, 0.015), M.roller, -2.4, 1.72, -5.9);
    const jamb = slab(0.22, 3.9, 0.3, 0.02);
    put(g, jamb, M.orange, -4.1, 1.95, -5.85); put(g, jamb, M.orange, -0.7, 1.95, -5.85);
    put(g, slab(3.9, 0.35, 0.34, 0.02), M.orange, -2.4, 4.05, -5.85);
    const lampG = new THREE.Group();
    put(lampG, new THREE.CylinderGeometry(0.01, 0.01, 0.6, 5), M.ink, 0, -0.3, 0);
    put(lampG, slab(0.5, 0.12, 0.28, 0.02), M.steel, 0, -0.66, 0);
    put(lampG, planeGeo(0.42, 0.2), M.glow, 0, -0.73, 0, Math.PI / 2);
    lampG.position.set(-2.4, 5.4, -5.4);
    g.add(lampG);
    const pallet = palletGeo();
    const crate = slab(1.05, 0.7, 0.85, 0.03);
    const stacks = [[3.6, 5.6], [5.2, 6.4], [4.2, 8.2], [-5.6, 6.2], [-7.2, 7.4], [-4.4, 9], [8.2, 6.8]];
    const pd = [], cr = [];
    for (let s = 0; s < stacks.length; s++) {
      const h = 3 + (s % 3);
      for (let k = 0; k < h; k++)
        pd.push({ p: [stacks[s][0], 0.05 + k * 0.15, stacks[s][1]], r: [0, (s % 2 ? 0.05 : -0.04) + k * 0.015 * (s % 2 ? 1 : -1), 0] });
      cr.push({ p: [stacks[s][0], 0.15 + h * 0.15 + 0.35, stacks[s][1]], r: [0, 0.1 * s, 0] });
    }
    inst(g, pallet, M.wood, pd, 12);
    inst(g, crate, M.paper, cr, 3);
    const cageBody = slab(1.2, 1.9, 1.1, 0.02);
    const cageTop = slab(1.24, 0.06, 1.14, 0.02);
    const cageL = [[6.4, 2.4], [6.4, 4.1], [-6.8, 3.4]];
    inst(g, cageBody, M.fence, cageL.map((c) => ({ p: [c[0], 1.05, c[1]] })), 2);
    inst(g, cageTop, M.steel, cageL.map((c) => ({ p: [c[0], 2.05, c[1]] })), 2);
    const kerb = slab(2.2, 0.16, 0.3, 0.04);
    const kk = [];
    for (let i = 0; i < 5; i++) kk.push({ p: [-6.6 + i * 3.3, 0.07, 11.4] });
    inst(g, kerb, M.paper, kk, 3);
    inst(g, slab(0.14, 0.7, 0.14, 0.02), M.ink, [{ p: [7.6, 0.35, 5.5] }, { p: [11, 0.35, 5.5] }], 1);
    return { group: g, anim: (dt, e) => { lampG.rotation.x = Math.sin(e * 0.9) * 0.02; lampG.rotation.z = Math.sin(e * 0.55) * 0.015; } };
  }

  // -------------------------------------------------------------- perimeter
  function buildPerimeter() {
    const g = new THREE.Group();
    frame(g, M.concrete, 7, 5.5);
    put(g, planeGeo(34, 2.4), M.gravel, 0, -0.014, 7.9);
    put(g, planeGeo(34, 3.6), M.concrete, 0, -0.05, -6.4);
    const zs = 5.4;
    put(g, slab(34, 0.3, 0.5, 0.03), M.concrete, 0, 0.15, zs);
    const posts = [], arms = [], panels = [];
    for (const sx of [-1, 1]) {
      for (let j = 0; j < 6; j++) {
        const x = sx * (2.35 + j * 3);
        posts.push({ p: [x, 1.35, zs] });
        arms.push({ p: [x, 2.52, zs], r: [0.5, 0, 0] });
        if (j < 5) panels.push({ p: [sx * (3.85 + j * 3), 1.35, zs] });
      }
    }
    inst(g, slab(0.1, 2.2, 0.1, 0.02), M.dark, posts, 8);
    inst(g, slab(0.06, 0.5, 0.06, 0.015), M.dark, arms, 8);
    inst(g, slab(2.9, 1.95, 0.03, 0.008), M.fence, panels, 6);
    const wire = new THREE.CylinderGeometry(0.012, 0.012, 34, 5);
    wire.rotateZ(Math.PI / 2);
    inst(g, wire, M.dark, [{ p: [0, 2.42, zs] }, { p: [0, 2.62, zs - 0.12] }, { p: [0, 2.82, zs + 0.1] }], 2);
    put(g, slab(0.45, 2.7, 0.45, 0.04), M.concrete, 2.0, 1.35, zs);
    put(g, slab(0.45, 2.7, 0.45, 0.04), M.concrete, -2.0, 1.35, zs);
    put(g, slab(2.9, 1.95, 0.05, 0.008), M.fence, 3.55, 1.35, zs - 1.5, 0, Math.PI / 2, 0);
    put(g, slab(2.9, 1.95, 0.05, 0.008), M.fence, -3.55, 1.35, zs - 1.5, 0, Math.PI / 2, 0);
    const mastGeo = latheProfile([[0.16, 0], [0.12, 0.4], [0.09, 4], [0.07, 6.2]], 12);
    const head = slab(0.7, 0.22, 0.35, 0.03);
    const face = planeGeo(0.6, 0.24);
    for (const mx of [-8.2, 8.2]) {
      put(g, mastGeo, M.steel, mx, 0, 8.3);
      put(g, head, M.dark, mx, 6.2, 8.3, 0.5, mx > 0 ? -0.8 : 0.8, 0);
      put(g, face, M.glow, mx, 6.12, 8.3, 0.5 - Math.PI / 2, mx > 0 ? -0.8 : 0.8, 0);
      const armC = new THREE.CylinderGeometry(0.04, 0.04, 6, 6);
      put(g, armC, M.ink, mx, 3.1, 8.3);
    }
    const sign = put(g, slab(0.55, 0.55, 0.02, 0.02), M.orange, 2.7, 2.2, zs + 0.3);
    put(g, slab(0.06, 2.4, 0.06, 0.01), M.dark, 2.7, 1.2, zs + 0.3);
    const boxG = slab(0.3, 0.4, 0.2, 0.02);
    inst(g, boxG, M.ink, [{ p: [-2.0, 2.9, zs] }, { p: [2.0, 2.9, zs] }], 2);
    const anim = (dt, e) => { sign.rotation.z = Math.sin(e * 1.4) * 0.028; };
    return { group: g, anim };
  }

  // ------------------------------------------------------------------ plant
  function buildPlant() {
    const g = new THREE.Group();
    frame(g, M.concrete, 7, 5.5);
    put(g, planeGeo(70, 60), M.gravel, 0, -0.05, -14);
    const rackZ = -6.2, cols = [];
    for (let i = 0; i < 6; i++) cols.push(-10 + i * 4);
    const colGeo = slab(0.34, 4.6, 0.34, 0.03);
    inst(g, colGeo, M.steel, cols.map((x) => ({ p: [x, 2.3, rackZ] })), 4);
    put(g, slab(20.6, 0.3, 0.24, 0.02), M.steel, 0, 4.5, rackZ - 0.28);
    put(g, slab(20.6, 0.3, 0.24, 0.02), M.steel, 0, 4.5, rackZ + 0.28);
    const pipes = [
      { y: 4.95, r: 0.24, x: 0 }, { y: 5.35, r: 0.15, x: 0 }, { y: 4.78, r: 0.11, x: 0 },
    ];
    for (const p of pipes) {
      const geo = new THREE.CylinderGeometry(p.r, p.r, 20, 12);
      geo.rotateZ(Math.PI / 2);
      put(g, geo, M.steel, p.x, p.y, rackZ);
    }
    const drop = new THREE.CylinderGeometry(0.24, 0.24, 4.4, 12);
    put(g, drop, M.steel, -6, 2.6, rackZ);
    put(g, slab(0.7, 0.1, 0.7, 0.03), M.dark, -6, 0.05, rackZ);
    const braceGeo = slab(0.12, 3.2, 0.12, 0.01);
    const br = [];
    for (let i = 0; i < 5; i++)
      br.push({ p: [-8 + i * 4, 2.9, rackZ], r: [0, 0, 0.72] }, { p: [-8 + i * 4, 2.9, rackZ], r: [0, 0, -0.72] });
    inst(g, braceGeo, M.dark, br, 4);
    const beam = iBeamGeo(3.2);
    inst(g, beam, M.orange, [{ p: [-3.5, 0, -4.4], r: [0, Math.PI / 2, 0] }, { p: [2.5, 0, -4.4], r: [0, Math.PI / 2, 0] }], 1);
    const walkZ = -4.1, walkY = 3.05;
    put(g, planeGeo(22, 1.6), M.grating, 0, walkY, walkZ);
    put(g, planeGeo(22, 1.6), M.ink, 0, walkY - 0.04, walkZ);
    put(g, slab(22, 0.16, 0.04, 0.01), M.dark, 0, walkY + 0.08, walkZ - 0.8);
    put(g, slab(22, 0.16, 0.04, 0.01), M.dark, 0, walkY + 0.08, walkZ + 0.8);
    const rail = new THREE.CylinderGeometry(0.03, 0.03, 22, 6);
    rail.rotateZ(Math.PI / 2);
    put(g, rail, M.steel, 0, walkY + 1.1, walkZ - 0.8);
    put(g, rail, M.steel, 0, walkY + 0.6, walkZ - 0.8);
    put(g, rail, M.steel, 0, walkY + 1.1, walkZ + 0.8);
    const vd = [];
    for (let i = 0; i < 11; i++) {
      vd.push({ p: [-11 + i * 2.2, walkY + 0.55, walkZ - 0.8] }, { p: [-11 + i * 2.2, walkY + 0.55, walkZ + 0.8] });
    }
    inst(g, new THREE.CylinderGeometry(0.028, 0.028, 1.1, 5), M.steel, vd, 8);
    const sup = slab(0.18, 3, 0.18, 0.02);
    inst(g, sup, M.dark, [{ p: [-8, walkY - 1.55, walkZ] }, { p: [0, walkY - 1.55, walkZ] }, { p: [8, walkY - 1.55, walkZ] }], 2);
    const tankGeo = latheProfile([
      [0, 0.12], [1.9, 0.12], [1.95, 0.3], [2, 0.6], [2, 5], [1.98, 5.25], [1.8, 5.55], [1.35, 5.8], [0.75, 5.97], [0, 6.05],
    ], 20);
    const tankPos = [[-9, -9.5], [9.5, -12]];
    for (const [x, z] of tankPos) {
      put(g, tankGeo, M.steel, x, 0, z);
      put(g, slab(0.7, 0.06, 4, 0.01), M.orange, x, 1.1, z);
      const ring = new THREE.TorusGeometry(2.1, 0.03, 4, 18);
      ring.rotateX(Math.PI / 2);
      put(g, ring, M.steel, x, 6.05, z);
      const st = [];
      for (let k = 0; k < 8; k++) st.push({ p: [x + Math.cos(k / 8 * 6.28) * 2.1, 6.3, z + Math.sin(k / 8 * 6.28) * 2.1] });
      inst(g, new THREE.CylinderGeometry(0.025, 0.025, 0.5, 4), M.steel, st, 4);
      const rung = new THREE.CylinderGeometry(0.018, 0.018, 0.45, 4);
      rung.rotateZ(Math.PI / 2);
      const rg = [];
      for (let k = 0; k < 14; k++) rg.push({ p: [x - 2.08, 0.5 + k * 0.4, z] });
      inst(g, rung, M.steel, rg, 6);
      inst(g, slab(0.04, 6.1, 0.05, 0.01), M.steel, [{ p: [x - 1.86, 3.05, z - 0.22] }, { p: [x - 1.86, 3.05, z + 0.22] }], 2);
    }
    const detailG = new THREE.Group();
    for (const [x, z] of tankPos) {
      for (let k = 0; k < 6; k++) {
        const t = new THREE.TorusGeometry(0.35, 0.018, 4, 10, Math.PI * 1.2);
        t.rotateY(Math.PI / 2);
        const m = new THREE.Mesh(t, M.steel);
        m.position.set(x - 2.35, 1.6 + k * 0.75, z);
        m.rotation.z = 0.4;
        detailG.add(m);
      }
    }
    g.add(detailG);
    details.push(detailG);
    const radar = new THREE.Group();
    const dish = new THREE.CylinderGeometry(0.3, 0.12, 0.16, 12, 1, true);
    put(radar, dish, M.paper, 0, 0, 0, 0.9, 0, 0);
    put(radar, slab(0.06, 0.4, 0.06, 0.01), M.dark, 0, -0.2, 0);
    radar.position.set(tankPos[1][0], 6.35, tankPos[1][1]);
    g.add(radar);
    const flare = put(g, latheProfile([[0.35, 0], [0.3, 0.4], [0.26, 7], [0.3, 7.4], [0.3, 9.4], [0.24, 9.6]], 10), M.dark, 15, 0, -16);
    const flame = put(g, new THREE.IcosahedronGeometry(0.55, 1), M.flare, 15, 10.1, -16);
    put(g, slab(0.5, 0.4, 0.5, 0.05), M.orange, 15, 0.2, -16);
    const guy = new THREE.CylinderGeometry(0.02, 0.02, 10, 4);
    const gy = [];
    for (let k = 0; k < 3; k++) {
      const a = k * 2.09;
      gy.push({ p: [15 + Math.cos(a) * 1.8, 5, -16 + Math.sin(a) * 1.8], r: [Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3] });
    }
    inst(g, guy, M.dark, gy, 2);
    const accent = planeGeo(0.18, 0.08);
    const ac = cols.map((x) => ({ p: [x, 1.2, rackZ + 0.46] }));
    inst(g, accent, M.warm, ac, 3);
    put(g, slab(3.2, 2.2, 1.6, 0.05), M.steel, -14, 1.1, 2.5);
    put(g, slab(0.8, 1.4, 0.4, 0.02), M.ink, -14, 0.7, 3.4);
    const anim = (dt, e) => {
      radar.rotation.y += dt * 0.35;
      flame.rotation.y += dt * 0.6;
      flame.scale.setScalar(1 + Math.sin(e * 8.3) * 0.08);
      flare.rotation.z = Math.sin(e * 0.22) * 0.0015;
    };
    return { group: g, anim };
  }

  const builders = {
    default: buildDefault, solar: buildSolar, warehouse: buildWarehouse,
    perimeter: buildPerimeter, plant: buildPlant,
  };

  function set(name) {
    if (NAMES.indexOf(name) < 0) name = 'default';
    if (!roots.has(name)) {
      const built = builders[name]();
      roots.set(name, built.group);
      anims.set(name, built.anim);
      scene.add(built.group);
    }
    roots.forEach((grp, key) => { grp.visible = key === name; });
    current = name;
  }

  function update(dt, elapsed, ctx) {
    const hour = ctx && typeof ctx.hour === 'number' ? ctx.hour : 13.5;
    const wet = ctx && typeof ctx.wetness === 'number' ? ctx.wetness : 0;
    const vis = ctx && typeof ctx.visibility === 'number' ? ctx.visibility : 1;
    let night;
    if (hour < 5.5 || hour > 19.5) night = 1;
    else if (hour < 7.5) night = (7.5 - hour) / 2;
    else if (hour > 17.5) night = (hour - 17.5) / 2;
    else night = 0;
    for (let i = 0; i < emissives.length; i++) {
      const en = emissives[i];
      let v = en.base * (0.2 + 0.8 * night) * (1.15 - 0.35 * vis);
      if (en.flick) v *= 1 + 0.12 * Math.sin(elapsed * 8.3);
      en.m.emissiveIntensity = v;
    }
    for (let i = 0; i < wetted.length; i++) {
      const m = wetted[i];
      m.roughness = m.userData.r0 * (1 - 0.55 * wet);
    }
    const a = anims.get(current);
    if (a) a(dt, elapsed, ctx);
  }

  function setQuality(q) {
    quality = q === 'low' ? 'low' : 'high';
    for (let i = 0; i < counts.length; i++) {
      const c = counts[i];
      c.m.count = quality === 'low' ? Math.max(1, Math.min(c.low, c.high)) : c.high;
    }
    for (let i = 0; i < details.length; i++) details[i].visible = quality !== 'low';
  }

  function dispose() {
    roots.forEach((grp) => {
      scene.remove(grp);
      grp.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    });
    roots.clear();
    anims.clear();
    counts.length = 0;
    details.length = 0;
    emissives.length = 0;
    wetted.length = 0;
    for (const key of Object.keys(M)) {
      const m = M[key];
      if (m.map) m.map.dispose();
      m.dispose();
    }
    current = null;
  }

  set('default');

  return { set, update, setQuality, contexts: NAMES.slice(), dispose };
}
