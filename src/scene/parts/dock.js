import * as THREE from 'three';

const W = 1.5;
const D = 1.15;
const H = 0.45;
const PAPER = 0xf2f1ee;
const INK = 0x14171a;
const SHELL = 0xd9dde0;
const SIGNAL = 0xff7a18;
const LID_RAD = THREE.MathUtils.degToRad(66);
const DOOR_RAD = THREE.MathUtils.degToRad(78);
const LED_CELLS = 16;

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _c = new THREE.Color();

function roundedShape(w, d, r) {
  const rr = Math.min(r, Math.min(w, d) * 0.49);
  const s = new THREE.Shape();
  const x = w / 2;
  const y = d / 2;
  s.moveTo(-x + rr, -y);
  s.lineTo(x - rr, -y);
  s.quadraticCurveTo(x, -y, x, -y + rr);
  s.lineTo(x, y - rr);
  s.quadraticCurveTo(x, y, x - rr, y);
  s.lineTo(-x + rr, y);
  s.quadraticCurveTo(-x, y, -x, y - rr);
  s.lineTo(-x, -y + rr);
  s.quadraticCurveTo(-x, -y, -x + rr, -y);
  return s;
}

// Plan-view rounded slab: extrude runs along the shape normal, so the geometry is laid
// flat with its top cap on local y = 0 and its skirt hanging to y = -h.
function slab(w, d, h, r = 0.02, bevel = 0.008, curveSegments = 6) {
  const shape = roundedShape(w, d, r);
  const bev = Math.min(bevel, h * 0.45);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(h - bev * 2, 0.001),
    bevelEnabled: bev > 0.0005,
    bevelThickness: bev,
    bevelSize: bev,
    bevelSegments: 2,
    curveSegments,
  });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, -bev, 0);
  geo.computeVertexNormals();
  return geo;
}

function plate(w, d, h, t, r = 0.02) {
  const outer = roundedShape(w, d, r);
  const hole = roundedShape(w - t * 2, d - t * 2, Math.max(r - t, 0.004));
  // ExtrudeGeometry re-orients hole winding itself, so the inner ring keeps the same construction.
  outer.holes.push(hole);
  const geo = new THREE.ExtrudeGeometry(outer, { depth: h, bevelEnabled: false, curveSegments: 6 });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function pipe(length, radius, radial = 12) {
  const geo = new THREE.CylinderGeometry(radius, radius, length, radial, 1, false);
  geo.translate(0, length / 2, 0);
  return geo;
}


function grilleTexture() {
  const n = 64;
  const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4;
      const slot = x % 8 < 4 ? 1 : 0;
      const v = slot ? 30 + (y % 8) * 6 : 150;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, n, n, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function hatchTexture(size = 128) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const d = Math.abs(((x + y) % 32) - 16);
      const v = d < 5 ? 190 : 96;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function buildMaterials() {
  const grille = grilleTexture();
  const hatch = hatchTexture();
  return {
    shell: new THREE.MeshPhysicalMaterial({
      color: SHELL,
      metalness: 0.34,
      roughness: 0.36,
      clearcoat: 0.42,
      clearcoatRoughness: 0.28,
      envMapIntensity: 1.05,
    }),
    shellDark: new THREE.MeshPhysicalMaterial({
      color: 0x50565c,
      metalness: 0.52,
      roughness: 0.44,
      clearcoat: 0.2,
      envMapIntensity: 0.9,
    }),
    trim: new THREE.MeshPhysicalMaterial({ color: INK, metalness: 0.2, roughness: 0.62, envMapIntensity: 0.7 }),
    gasket: new THREE.MeshStandardMaterial({ color: 0x1b1e21, metalness: 0.02, roughness: 0.94 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x23262a, metalness: 0.05, roughness: 0.86 }),
    steel: new THREE.MeshPhysicalMaterial({
      color: 0xb9bec3,
      metalness: 0.86,
      roughness: 0.26,
      clearcoat: 0.3,
      envMapIntensity: 1.2,
    }),
    concrete: new THREE.MeshStandardMaterial({ color: 0xa8a49c, metalness: 0.02, roughness: 0.9 }),
    contact: new THREE.MeshPhysicalMaterial({ color: 0xc9a227, metalness: 0.9, roughness: 0.3, envMapIntensity: 1.3 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x1a1d20,
      metalness: 0.1,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      transparent: true,
      opacity: 0.66,
      envMapIntensity: 1.4,
    }),
    louvre: new THREE.MeshStandardMaterial({ color: 0x3c4147, metalness: 0.44, roughness: 0.5, alphaMap: grille }),
    grate: new THREE.MeshStandardMaterial({ color: 0x2c3035, metalness: 0.5, roughness: 0.68, alphaMap: hatch }),
    accent: new THREE.MeshPhysicalMaterial({ color: SIGNAL, metalness: 0.12, roughness: 0.42, clearcoat: 0.6 }),
    led: new THREE.MeshStandardMaterial({ color: 0x0d1012, emissive: SIGNAL, emissiveIntensity: 0.8, roughness: 0.45, toneMapped: false }),
    bayLight: new THREE.MeshStandardMaterial({ color: 0x2a2e33, emissive: 0xdfeaff, emissiveIntensity: 0.22, roughness: 0.6 }),
    label: new THREE.MeshPhysicalMaterial({ color: PAPER, metalness: 0.06, roughness: 0.5, clearcoat: 0.5 }),
  };
}

function instanced(geo, mat, transforms, cast = true) {
  const mesh = new THREE.InstancedMesh(geo, mat, transforms.length);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  transforms.forEach((tr, i) => {
    _e.set(tr.rx || 0, tr.ry || 0, tr.rz || 0);
    _q.setFromEuler(_e);
    m.compose(new THREE.Vector3(tr.x, tr.y, tr.z), _q, new THREE.Vector3(tr.s || 1, tr.sy || tr.s || 1, tr.s || 1));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function fastenerGrid() {
  const out = [];
  const rows = [
    { y: 0.09, r: 0.006, n: 10, radius: [W / 2 - 0.06, D / 2 - 0.06] },
    { y: H - 0.02, r: 0.006, n: 10, radius: [W / 2 - 0.05, D / 2 - 0.05] },
  ];
  for (const row of rows) {
    for (let i = 0; i < row.n; i++) {
      const t = (i / (row.n - 1)) * 2 - 1;
      for (const side of [-1, 1]) {
        out.push({ x: t * row.radius[0], y: row.y, z: side * row.radius[1], s: row.r, rz: side > 0 ? 0 : Math.PI });
      }
    }
  }
  return out;
}

function buildBase(mats, parts) {
  const group = new THREE.Group();
  const base = new THREE.Mesh(slab(W + 0.16, D + 0.16, 0.055, 0.03, 0.01), mats.concrete);
  base.receiveShadow = true;
  base.name = 'base';
  group.add(base);
  parts.base = base;

  const skirt = new THREE.Mesh(slab(W, D, 0.06, 0.03, 0.008), mats.shellDark);
  skirt.position.y = 0.055;
  skirt.castShadow = true;
  skirt.receiveShadow = true;
  group.add(skirt);

  const anchors = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      anchors.push({ x: sx * (W / 2 - 0.09), y: 0.052, z: sz * (D / 2 - 0.09), s: 0.02, ry: sx * sz * 0.6 });
      anchors.push({ x: sx * (W / 2 - 0.3), y: 0.052, z: sz * (D / 2 - 0.09), s: 0.02, ry: -sx * 0.4 });
    }
  }
  const bolt = new THREE.CylinderGeometry(0.016, 0.019, 0.014, 6);
  bolt.translate(0, 0.007, 0);
  const bolts = instanced(bolt, mats.steel, anchors);
  bolts.name = 'anchorBolts';
  group.add(bolts);
  parts.anchorBolts = bolts;

  const dripGeo = new THREE.LatheGeometry(
    [new THREE.Vector2(0.0, 0), new THREE.Vector2(0.02, 0.004), new THREE.Vector2(0.03, 0.018), new THREE.Vector2(0.031, 0.03)],
    14
  );
  dripGeo.rotateX(Math.PI / 2);
  dripGeo.translate(0, 0.02, 0);
  const drains = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) drains.push({ x: sx * (W / 2 - 0.05), y: 0.06, z: sz * (D / 2 - 0.05), s: 1 });
  }
  group.add(instanced(dripGeo, mats.steel, drains, false));

  return group;
}

function buildChassis(mats, parts) {
  const group = new THREE.Group();
  const bodyH = H - 0.115;
  const body = new THREE.Mesh(slab(W, D, bodyH, 0.05, 0.012), mats.shell);
  body.position.y = 0.115;
  body.castShadow = true;
  body.receiveShadow = true;
  body.name = 'chassis';
  group.add(body);
  parts.chassis = body;

  const revealMat = mats.trim;
  const reveals = [];
  for (const sz of [-1, 1]) reveals.push({ x: 0, y: 0.115 + bodyH * 0.55, z: sz * (D / 2 + 0.001), s: 1, rz: 0 });
  const revealGeo = new THREE.BoxGeometry(W * 0.92, 0.004, 0.002);
  group.add(instanced(revealGeo, revealMat, reveals, false));

  const bayGeo = plate(W - 0.14, D - 0.14, 0.03, 0.012);
  const bay = new THREE.Mesh(bayGeo, mats.shellDark);
  bay.position.y = 0.115 + bodyH + 0.001;
  bay.name = 'bayRim';
  group.add(bay);
  parts.bayRim = bay;

  const inner = new THREE.Mesh(slab(W - 0.17, D - 0.17, 0.24, 0.03, 0.004), mats.trim);
  inner.position.y = 0.21;
  inner.receiveShadow = true;
  group.add(inner);
  parts.interior = inner;

  const floor = new THREE.Mesh(slab(W - 0.2, D - 0.2, 0.012, 0.025, 0.003), mats.grate);
  floor.position.y = 0.16;
  floor.receiveShadow = true;
  group.add(floor);
  parts.chargeFloor = floor;

  const pad = new THREE.Mesh(slab(0.44, 0.4, 0.018, 0.06, 0.004), mats.shellDark);
  pad.position.y = floor.position.y + 0.012;
  group.add(pad);
  parts.chargePad = pad;

  const contactGeo = new THREE.CylinderGeometry(0.017, 0.019, 0.007, 14);
  contactGeo.translate(0, 0.0035, 0);
  const contacts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) contacts.push({ x: sx * 0.14, y: pad.position.y + 0.016, z: sz * 0.12, s: 1 });
  }
  contacts.push({ x: 0, y: pad.position.y + 0.016, z: 0, s: 1.5 });
  const contactMesh = instanced(contactGeo, mats.contact, contacts, false);
  group.add(contactMesh);
  parts.contacts = contactMesh;

  const railGeo = new THREE.BoxGeometry(0.012, 0.05, 0.5);
  const rails = [];
  for (const sx of [-1, 1]) rails.push({ x: sx * 0.29, y: pad.position.y + 0.03, z: -0.02, s: 1 });
  const railMesh = instanced(railGeo, mats.steel, rails, false);
  group.add(railMesh);
  parts.guideRails = railMesh;

  const bayL = new THREE.Mesh(new THREE.PlaneGeometry(W - 0.3, D - 0.3), mats.bayLight);
  bayL.rotation.x = -Math.PI / 2;
  bayL.position.y = 0.44;
  group.add(bayL);
  parts.bayLight = bayL;

  const thermal = new THREE.Mesh(slab(0.34, 0.22, 0.14, 0.03, 0.005), mats.shellDark);
  thermal.position.set(-W / 2 + 0.28, 0.115 + bodyH * 0.42, -D / 2 + 0.19);
  thermal.castShadow = true;
  group.add(thermal);
  parts.thermalUnit = thermal;

  const cellGeo = new THREE.BoxGeometry(0.026, 0.09, 0.2);
  const cells = [];
  for (let i = 0; i < 6; i++) cells.push({ x: -W / 2 + 0.2 + i * 0.032, y: thermal.position.y, z: thermal.position.z, s: 1 });
  group.add(instanced(cellGeo, mats.trim, cells, false));

  const glandGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 10);
  glandGeo.rotateX(Math.PI / 2);
  const glands = [];
  for (let i = 0; i < 4; i++) {
    glands.push({ x: -0.12 + i * 0.08, y: 0.16, z: -D / 2 - 0.004, s: 1, rx: Math.PI / 2 });
  }
  group.add(instanced(glandGeo, mats.rubber, glands, false));

  const fastGeo = new THREE.CylinderGeometry(0.0062, 0.0062, 0.004, 6);
  fastGeo.rotateX(Math.PI / 2);
  fastGeo.translate(0, 0, -0.002);
  const fasteners = fastenerGrid().map((f) => ({ ...f, y: f.y }));
  group.add(instanced(fastGeo, mats.steel, fasteners, false));

  return group;
}

function buildLouvres(mats, parts) {
  const group = new THREE.Group();
  const bladeGeo = new THREE.BoxGeometry(0.004, 0.028, 0.34);
  const blades = [];
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 9; i++) {
      blades.push({ x: sx * (W / 2 + 0.003), y: 0.16 + i * 0.031, z: 0.18, s: 1, rz: sx * -0.32 });
    }
  }
  for (let i = 0; i < 7; i++) {
    blades.push({ x: -0.3 + i * 0.1, y: 0.16 + 4 * 0.031, z: D / 2 + 0.003, s: 1, rx: 0.3 });
  }
  const mesh = instanced(bladeGeo, mats.louvre, blades, false);
  group.add(mesh);
  parts.louvres = mesh;

  const frame = new THREE.Mesh(slab(0.38, 0.3, 0.012, 0.02, 0.003), mats.shellDark);
  frame.rotation.x = Math.PI / 2;
  frame.position.set(W / 2 - 0.02, 0.155 + 4 * 0.031, 0.18);
  frame.rotation.z = Math.PI / 2;
  group.add(frame);

  const fanGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.02, 18, 1, true);
  fanGeo.rotateZ(Math.PI / 2);
  const housing = new THREE.Mesh(fanGeo, mats.trim);
  housing.position.set(W / 2 - 0.03, 0.155 + 4 * 0.031, 0.18);
  group.add(housing);

  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.026, 12), mats.steel);
  hub.rotation.z = Math.PI / 2;
  hub.position.copy(housing.position);
  group.add(hub);

  const blade = new THREE.BoxGeometry(0.004, 0.07, 0.024);
  const fanBlades = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    fanBlades.push({ x: Math.cos(a) * 0.05, y: Math.sin(a) * 0.05, z: 0, s: 1, rz: a });
  }
  const rotor = new THREE.Group();
  rotor.position.copy(housing.position);
  const fanMesh = instanced(blade, mats.shellDark, fanBlades, false);
  rotor.add(fanMesh);
  rotor.name = 'fan';
  group.add(rotor);
  parts.fan = rotor;

  return group;
}

function buildCanopy(mats, parts) {
  const pivot = new THREE.Group();
  pivot.name = 'canopyPivot';
  pivot.position.set(0, H - 0.075, -D / 2 + 0.04);

  const lidH = 0.075;
  const lid = new THREE.Mesh(slab(W - 0.04, D - 0.02, lidH, 0.05, 0.012), mats.shell);
  lid.position.set(0, 0, (D - 0.02) / 2 - 0.01);
  lid.castShadow = true;
  lid.receiveShadow = false;
  lid.name = 'canopy';
  pivot.add(lid);
  parts.canopy = lid;

  const underside = new THREE.Mesh(slab(W - 0.12, D - 0.12, 0.016, 0.03, 0.003), mats.trim);
  underside.position.set(0, 0.001, (D - 0.12) / 2 - 0.01);
  pivot.add(underside);

  const sealGeo = new THREE.TorusGeometry(0.5, 0.011, 6, 40);
  sealGeo.rotateX(Math.PI / 2);
  sealGeo.scale(1.44, 1, 1.06);
  const seal = new THREE.Mesh(sealGeo, mats.gasket);
  seal.position.set(0, -0.004, (D - 0.14) / 2 - 0.01);
  seal.name = 'gasket';
  pivot.add(seal);
  parts.gasket = seal;

  const window = new THREE.Mesh(slab(0.42, 0.24, 0.01, 0.05, 0.004), mats.glass);
  window.position.set(0.26, 0.068, (D - 0.02) / 2 - 0.13);
  pivot.add(window);
  parts.serviceWindow = window;

  const windowFrame = new THREE.Mesh(plate(0.46, 0.28, 0.014, 0.02), mats.shellDark);
  windowFrame.position.set(0.26, 0.062, (D - 0.02) / 2 - 0.13);
  pivot.add(windowFrame);

  const ledBase = new THREE.Mesh(slab(0.62, 0.038, 0.014, 0.012, 0.002), mats.trim);
  ledBase.position.set(-0.34, 0.055, (D - 0.02) / 2 + 0.006);
  pivot.add(ledBase);

  const cellGeo = new THREE.BoxGeometry(0.026, 0.012, 0.012);
  const cellTransforms = [];
  for (let i = 0; i < LED_CELLS; i++) {
    cellTransforms.push({ x: -0.34 - 0.29 + (i / (LED_CELLS - 1)) * 0.58, y: 0.056, z: (D - 0.02) / 2 + 0.014, s: 1 });
  }
  const ledBar = instanced(cellGeo, mats.led, cellTransforms, false);
  ledBar.instanceMatrix.needsUpdate = true;
  ledBar.name = 'ledBar';
  pivot.add(ledBar);
  parts.ledBar = ledBar;

  const logo = new THREE.Mesh(slab(0.2, 0.03, 0.005, 0.01, 0.001), mats.label);
  logo.position.set(0.3, 0.0755, (D - 0.02) / 2 - 0.28);
  pivot.add(logo);

  const hingeGeo = new THREE.CylinderGeometry(0.018, 0.018, 0.13, 12);
  hingeGeo.rotateZ(Math.PI / 2);
  hingeGeo.translate(0, 0, 0);
  const hinges = instanced(hingeGeo, mats.steel, [
    { x: -0.42, y: 0.004, z: 0.005, s: 1 },
    { x: 0.42, y: 0.004, z: 0.005, s: 1 },
  ]);
  pivot.add(hinges);
  parts.hinges = hinges;

  const damperGeo = pipe(0.12, 0.008, 10);
  damperGeo.rotateX(-Math.PI / 2.4);
  const dampers = instanced(damperGeo, mats.steel, [
    { x: -0.3, y: 0.014, z: 0.02, s: 1 },
    { x: 0.3, y: 0.014, z: 0.02, s: 1 },
  ]);
  pivot.add(dampers);
  parts.dampers = dampers;

  return { pivot, lid, seal };
}

function buildTray(mats, parts) {
  const group = new THREE.Group();
  group.name = 'trayPivot';

  const deck = new THREE.Mesh(slab(0.5, 0.46, 0.022, 0.05, 0.004), mats.shellDark);
  deck.castShadow = true;
  deck.receiveShadow = true;
  deck.name = 'tray';
  group.add(deck);
  parts.tray = deck;

  const skid = new THREE.Mesh(slab(0.3, 0.3, 0.05, 0.03, 0.004), mats.trim);
  skid.position.y = -0.05;
  group.add(skid);

  const cornerGeo = new THREE.SphereGeometry(0.014, 10, 8);
  const corners = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) corners.push({ x: sx * 0.22, y: -0.008, z: sz * 0.2, s: 1 });
  }
  group.add(instanced(cornerGeo, mats.rubber, corners, false));

  const centreGeo = new THREE.RingGeometry(0.055, 0.075, 24);
  centreGeo.rotateX(-Math.PI / 2);
  const mark = new THREE.Mesh(centreGeo, mats.accent);
  mark.position.y = 0.012;
  group.add(mark);
  parts.trayMark = mark;

  const postGeo = pipe(0.05, 0.005, 8);
  const posts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) posts.push({ x: sx * 0.2, y: 0.011, z: sz * 0.18, s: 1 });
  }
  group.add(instanced(postGeo, mats.steel, posts, false));

  return group;
}

function buildServiceDoor(mats, parts) {
  const pivot = new THREE.Group();
  pivot.name = 'doorPivot';
  pivot.position.set(-W / 2, 0.115, D / 2 - 0.24);

  const door = new THREE.Mesh(slab(0.4, 0.29, 0.026, 0.02, 0.004), mats.shell);
  door.castShadow = true;
  door.rotation.y = Math.PI / 2;
  door.position.set(-0.012, 0.11, 0.0);
  door.name = 'serviceDoor';
  pivot.add(door);
  parts.serviceDoor = door;

  const inset = new THREE.Mesh(slab(0.3, 0.2, 0.008, 0.015, 0.002), mats.shellDark);
  inset.rotation.y = Math.PI / 2;
  inset.position.set(-0.026, 0.11, 0);
  pivot.add(inset);

  const latchGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.014, 6);
  latchGeo.rotateZ(Math.PI / 2);
  const latch = new THREE.Mesh(latchGeo, mats.steel);
  latch.position.set(-0.03, 0.11, 0.1);
  pivot.add(latch);
  parts.latch = latch;

  const sealGeo = new THREE.BoxGeometry(0.006, 0.26, 0.37);
  const seal = new THREE.Mesh(sealGeo, mats.gasket);
  seal.position.set(0.004, 0.11, 0);
  pivot.add(seal);

  return pivot;
}

function buildRtkMast(mats, parts) {
  const group = new THREE.Group();
  group.position.set(W / 2 - 0.16, 0.115 + (H - 0.115), -D / 2 + 0.16);

  const mount = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.042, 0.03, 14), mats.trim);
  mount.position.y = 0.015;
  mount.castShadow = true;
  group.add(mount);

  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.014, 0.2, 12), mats.steel);
  mast.position.y = 0.12;
  mast.castShadow = true;
  group.add(mast);
  parts.rtkMast = mast;

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.012, 12), mats.accent);
  collar.position.y = 0.045;
  group.add(collar);

  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.052, 0.036, 20), mats.label);
  head.position.y = 0.24;
  head.castShadow = true;
  group.add(head);
  parts.rtkHead = head;

  const choke = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 20), mats.trim);
  choke.rotation.x = Math.PI / 2;
  choke.position.y = 0.228;
  group.add(choke);

  const tip = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 10), mats.glass);
  tip.position.y = 0.262;
  group.add(tip);

  const cable = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.02, 0.22, 0),
    new THREE.Vector3(0.07, 0.12, 0.03),
    new THREE.Vector3(0.05, 0.02, 0.06),
    new THREE.Vector3(0.0, -0.02, 0.02),
  ]);
  const cableMesh = new THREE.Mesh(new THREE.TubeGeometry(cable, 24, 0.006, 8, false), mats.rubber);
  group.add(cableMesh);

  return group;
}

function buildAntennas(mats, parts) {
  const group = new THREE.Group();
  const stickGeo = pipe(0.14, 0.007, 8);
  const mounts = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) mounts.push({ x: sx * 0.62, y: 0.115 + (H - 0.115) * 0.5, z: sz * 0.44, s: 1, rx: sx * 0.12, rz: -sx * 0.16 });
  }
  group.add(instanced(stickGeo, mats.trim, mounts, true));

  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.022, 14), mats.label);
  puck.position.set(-W / 2 + 0.14, 0.115 + (H - 0.115) * 0.55, D / 2 - 0.12);
  group.add(puck);
  parts.linkAntenna = puck;

  const bracket = new THREE.Mesh(slab(0.06, 0.05, 0.05, 0.01, 0.003), mats.shellDark);
  bracket.position.set(puck.position.x, puck.position.y - 0.035, puck.position.z);
  group.add(bracket);

  return group;
}

export function buildDock() {
  const materials = buildMaterials();
  const parts = {};
  const group = new THREE.Group();
  group.name = 'airolift-d2';

  group.add(buildBase(materials, parts));
  group.add(buildChassis(materials, parts));
  group.add(buildLouvres(materials, parts));
  const canopy = buildCanopy(materials, parts);
  group.add(canopy.pivot);
  const tray = buildTray(materials, parts);
  group.add(tray);
  const doorPivot = buildServiceDoor(materials, parts);
  group.add(doorPivot);
  group.add(buildRtkMast(materials, parts));
  group.add(buildAntennas(materials, parts));

  const trayY = 0.16;
  tray.position.set(0, trayY, -0.02);

  const box = new THREE.Box3().setFromObject(group);
  const size = new THREE.Vector3();
  box.getSize(size);

  const cellCount = parts.ledBar.count;
  for (let i = 0; i < cellCount; i++) parts.ledBar.setColorAt(i, _c.setHex(SIGNAL));
  if (parts.ledBar.instanceColor) parts.ledBar.instanceColor.needsUpdate = true;

  const hotspots = [
    { id: 'seal', label: 'IP55 lid seal', note: 'Double-lip gasket with a compressed perimeter seal — rated IP55 against wind-blown dust and monsoon rain.', world: new THREE.Vector3(0, H - 0.06, D / 2 - 0.16) },
    { id: 'lid', label: '90 s lid cycle', note: 'Gas-damped hinge opens the full bay in 90 seconds, in −20 °C to +50 °C ambient.', world: new THREE.Vector3(-0.42, H + 0.02, -D / 2 + 0.06) },
    { id: 'charge', label: 'Dock charge pad', note: 'Gold contact pad delivers 60 W to the aircraft between missions — no human on site.', world: new THREE.Vector3(0, trayY + 0.04, -0.02) },
    { id: 'rtk', label: 'RTK mast', note: 'Centimetre-accurate base station pins every landing to within 2 cm of the pad.', world: new THREE.Vector3(W / 2 - 0.16, H + 0.28, -D / 2 + 0.16) },
    { id: 'thermal', label: 'Conditioned bay', note: 'Sealed thermal volume keeps the bay −20…+50 °C and the batteries at working temperature.', world: new THREE.Vector3(-W / 2 + 0.28, H * 0.6, -D / 2 + 0.19) },
    { id: 'link', label: '8 km link', note: 'Dual-band relay on the mast holds an 8 km control and video link from the dock roof.', world: new THREE.Vector3(-W / 2 + 0.14, H * 0.7, D / 2 - 0.12) },
  ];

  const last = { mode: '', color: 0 };
  let ledPhase = 0;

  function drive(state) {
    const { roof = 0, tray: trayT = 0, door = 0, ledColor = SIGNAL, ledMode = 'idle', battery = 0.6, elapsed = 0, dt = 0.016 } = state || {};

    canopy.pivot.rotation.x = -roof * LID_RAD;
    const compress = 1 - roof * 0.55;
    parts.gasket.scale.set(1, compress, 1);
    parts.serviceWindow.material.opacity = 0.66;
    parts.bayLight.material.emissiveIntensity = 0.05 + roof * 0.5;

    tray.position.z = -0.02 + trayT * 0.52;
    tray.position.y = trayY + trayT * 0.13;
    tray.rotation.x = -trayT * 0.06;

    doorPivot.rotation.y = -door * DOOR_RAD;

    parts.fan.rotation.x = elapsed * (roof > 0.05 ? 26 : 9);

    ledPhase += dt;
    if (ledMode !== last.mode || ledColor !== last.color) {
      last.mode = ledMode;
      last.color = ledColor;
    }
    const cells = parts.ledBar;
    for (let i = 0; i < cells.count; i++) {
      const u = i / (cells.count - 1);
      let k;
      if (ledMode === 'charging') {
        const fill = battery * 1.15;
        const sweep = 0.5 + 0.5 * Math.sin(elapsed * 1.6 - u * 3.4);
        k = u <= fill ? 0.32 + 0.5 * sweep : 0.05;
      } else if (ledMode === 'flight') {
        const c = (elapsed * 1.8) % 1;
        const blink = c < 0.1 || (c > 0.18 && c < 0.28) ? 1 : 0.06;
        k = blink;
      } else {
        k = 0.16 + 0.04 * Math.sin(elapsed * 0.7);
      }
      _c.setHex(ledColor).multiplyScalar(k);
      cells.setColorAt(i, _c);
    }
    if (cells.instanceColor) cells.instanceColor.needsUpdate = true;
    parts.ledBar.material.emissiveIntensity = 2.4;
  }

  return { group, parts, materials, hotspots, bbox: { width: size.x, height: size.y, depth: size.z }, parkY: trayY + 0.012, drive };
}
