import * as THREE from 'three';

// AiroLift D2 — compact fold-arm survey quadcopter for pipeline / mining / perimeter
// inspection, housed and charged in an autonomous dock. Modelled as a sealed
// industrial airframe: magnesium-composite shell, vented battery bay, belly charge
// plate, RTK puck, chin-mounted 2-axis EO/IR pod. Units: 1 = metre, Y-up,
// landing-gear lowest point at local y = 0.

const PAL = { paper: 0xf2f1ee, ink: 0x14171a, shell: 0xd9dde0, signal: 0xff7a18 };
const TAU = Math.PI * 2, DEG = Math.PI / 180;

// One extrude-option factory so every shell part shares the same bevel language.
function bev(depth, bt, seg = 2, curve = 6) {
  return { depth, bevelEnabled: true, bevelThickness: bt, bevelSize: bt, bevelSegments: seg, curveSegments: curve };
}

function roundedRectShape(w, d, r) {
  const rr = Math.max(1e-4, Math.min(r, Math.min(w, d) / 2 - 1e-4));
  const hx = w / 2, hz = d / 2;
  const s = new THREE.Shape();
  s.moveTo(-hx + rr, -hz);
  s.lineTo(hx - rr, -hz);
  s.quadraticCurveTo(hx, -hz, hx, -hz + rr);
  s.lineTo(hx, hz - rr);
  s.quadraticCurveTo(hx, hz, hx - rr, hz);
  s.lineTo(-hx + rr, hz);
  s.quadraticCurveTo(-hx, hz, -hx, hz - rr);
  s.lineTo(-hx, -hz + rr);
  s.quadraticCurveTo(-hx, -hz, -hx + rr, -hz);
  return s;
}

// Chamfered slab: rounded footprint in XZ, thickness along Y, centred on origin.
// Replaces BoxGeometry so no visible surface is an un-broken cube.
function slab(w, d, h, r, ch = 0.0025) {
  const bt = Math.min(ch, Math.max(1e-4, h / 2));
  const depth = Math.max(1e-4, h - 2 * bt);
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * bt, d - 2 * bt, r - bt), bev(depth, bt));
  g.rotateX(-Math.PI / 2);
  g.translate(0, -depth / 2, 0);
  g.computeVertexNormals();
  return g;
}

// Vertical rounded plate for louvers, windows and trim (profile in XY).
function plate(w, h, t, r) {
  const bt = Math.min(0.0012, t / 2);
  const depth = Math.max(1e-4, t - 2 * bt);
  const g = new THREE.ExtrudeGeometry(roundedRectShape(w - 2 * bt, h - 2 * bt, r - bt), bev(depth, bt, 1, 5));
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

function mesh(geo, mat, x, y, z) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function dataTexture(size, fill) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = fill(x / size, y / size);
      data[i] = v[0]; data[i + 1] = v[1]; data[i + 2] = v[2]; data[i + 3] = v[3];
    }
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

// Woven composite relief, used only as a roughness map — no external assets.
function weaveMap() {
  return dataTexture(64, (u, v) => {
    const g = 150 + (Math.sin(u * TAU * 8) * 0.5 + 0.5) * (Math.sin(v * TAU * 8) * 0.5 + 0.5) * 46 - 20
      + (((u * 91 + v * 57) % 1) * 22 - 11);
    const c = Math.max(0, Math.min(255, g)) | 0;
    return [c, c, c, 255];
  });
}

// Radial ramp so the ghosted rotor disc reads brightest at the tip circle.
function discAlphaMap() {
  return dataTexture(64, (u, v) => {
    const r = Math.hypot(u - 0.5, v - 0.5) * 2;
    const a = r < 0.18 ? 0.04 : Math.max(0, Math.min(1, 1 - Math.abs(r - 0.72) / 0.55));
    const c = (a * 255) | 0;
    return [255, 255, 255, c];
  });
}

function makeMaterials() {
  const shellRough = weaveMap();
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  return {
    shell: std({ color: PAL.shell, roughness: 0.52, metalness: 0.42, roughnessMap: shellRough, envMapIntensity: 0.9 }),
    shellMatte: std({ color: 0xc6cbd0, roughness: 0.74, metalness: 0.28, roughnessMap: shellRough }),
    ink: std({ color: PAL.ink, roughness: 0.36, metalness: 0.62, envMapIntensity: 1.1 }),
    alloy: std({ color: 0x8d959c, roughness: 0.28, metalness: 0.92 }),
    motorCan: std({ color: 0x242a30, roughness: 0.44, metalness: 0.78 }),
    rubber: std({ color: 0x1b1e22, roughness: 0.92, metalness: 0.05 }),
    gasket: std({ color: 0x2a2f35, roughness: 0.85, metalness: 0 }),
    orange: std({ color: PAL.signal, roughness: 0.55, metalness: 0.12 }),
    paperTrim: std({ color: PAL.paper, roughness: 0.62, metalness: 0.1 }),
    gold: std({ color: 0xd8b45a, roughness: 0.22, metalness: 0.95 }),
    blade: std({ color: 0x191d21, roughness: 0.34, metalness: 0.24, transparent: true, opacity: 1 }),
    disc: phys({ color: 0xb9c2cb, roughness: 0.12, transparent: true, opacity: 0, alphaMap: discAlphaMap(), side: THREE.DoubleSide, depthWrite: false }),
    glass: phys({ color: 0xeef3f8, roughness: 0.03, transmission: 0.92, thickness: 0.006, ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.03 }),
    irWindow: phys({ color: 0x0e1418, roughness: 0.08, metalness: 0.1, transmission: 0.25, thickness: 0.004, ior: 2.2, clearcoat: 1, clearcoatRoughness: 0.04 }),
    navRed: std({ color: 0x3a0d0d, roughness: 0.3, emissive: new THREE.Color(0xff2436), emissiveIntensity: 0 }),
    navGreen: std({ color: 0x0d2a16, roughness: 0.3, emissive: new THREE.Color(0x27ff7a), emissiveIntensity: 0 }),
    strobe: std({ color: 0x20242a, roughness: 0.28, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0 }),
    downlight: std({ color: 0x2a2a26, roughness: 0.4, emissive: new THREE.Color(0xffd8a0), emissiveIntensity: 0 }),
    led: std({ color: 0x101416, roughness: 0.3, metalness: 0.2, emissive: new THREE.Color(PAL.signal), emissiveIntensity: 0.4 }),
  };
}

// ---------------------------------------------------------------- station constants
const ARM_DEPLOY = [-45 * DEG, 45 * DEG, -135 * DEG, 135 * DEG];
// Fold deltas: front arms swing back alongside the hull, rear arms tuck inboard.
const ARM_FOLD = [120 * DEG, 51 * DEG, -120 * DEG, -51 * DEG];
const ARM_TILT = [0.14, 0.1, 0.14, 0.1];
const SPIN_DIR = [-1, 1, -1, 1];
const HINGE = [[0.065, 0.038], [0.065, -0.038], [-0.065, 0.038], [-0.065, -0.038]];
const ARM_LEN = 0.148, PROP_R = 0.055;
const BODY_W = 0.152, BODY_D = 0.104, BODY_Y = 0.105;
const HINGE_Y = BODY_Y + 0.012, BLADE_Y = HINGE_Y + 0.049;

export function buildDrone() {
  const M = makeMaterials();
  const group = new THREE.Group(); group.name = 'AiroLift-D2';
  const root = new THREE.Group(); root.name = 'airframe'; group.add(root);
  const fastenSpots = [], ventSpots = [], padSpots = [], ledSpots = [];

  // ---- fuselage: stacked composite hulls with a silicone gasket seam and panel lines
  const fuselage = new THREE.Group(); fuselage.name = 'fuselage'; root.add(fuselage);
  fuselage.add(mesh(slab(BODY_W, BODY_D, 0.03, 0.024, 0.005), M.shellMatte, 0, BODY_Y - 0.017, 0));
  fuselage.add(mesh(slab(BODY_W + 0.0035, BODY_D + 0.0035, 0.0022, 0.025, 0.0008), M.gasket, 0, BODY_Y + 0.001, 0));
  fuselage.add(mesh(slab(BODY_W - 0.006, BODY_D - 0.006, 0.029, 0.021, 0.006), M.shell, 0, BODY_Y + 0.0175, 0));
  fuselage.add(mesh(slab(0.058, 0.082, 0.009, 0.02, 0.003), M.ink, 0, BODY_Y + 0.035, -0.004));
  for (let i = 0; i < 2; i++) {
    const seam = mesh(slab(BODY_W + 0.0012, BODY_D + 0.0012, 0.0012, 0.023, 0.0005), M.ink, 0, BODY_Y - 0.026 + i * 0.033, 0);
    seam.castShadow = false; fuselage.add(seam);
  }
  for (const sx of [-1, 1]) {
    const fairing = mesh(slab(0.05, 0.016, 0.024, 0.007, 0.004), M.shell, sx * 0.058, BODY_Y + 0.004, 0);
    fairing.rotation.y = sx * 0.05;
    fuselage.add(fairing);
    for (let k = 0; k < 3; k++) fastenSpots.push({ p: [sx * 0.076, BODY_Y - 0.006 + k * 0.012, -0.03 + k * 0.03], n: [sx, 0.1, 0] });
  }

  // ---- RTK puck and link antennas
  const rtk = new THREE.Group(); rtk.name = 'rtk'; root.add(rtk);
  rtk.add(mesh(new THREE.CylinderGeometry(0.023, 0.026, 0.008, 24), M.ink, 0, BODY_Y + 0.0365, -0.02));
  const dome = mesh(new THREE.SphereGeometry(0.022, 20, 12, 0, TAU, 0, Math.PI / 2), M.paperTrim, 0, BODY_Y + 0.0405, -0.02);
  dome.scale.y = 0.5;
  const rtkRing = mesh(new THREE.TorusGeometry(0.0235, 0.0016, 8, 28), M.orange, 0, BODY_Y + 0.0405, -0.02);
  rtkRing.rotation.x = Math.PI / 2;
  rtk.add(dome, rtkRing);

  const antennas = new THREE.Group(); root.add(antennas);
  for (let i = 0; i < 2; i++) {
    const ax = (i === 0 ? -1 : 1) * 0.042;
    const stub = mesh(new THREE.CapsuleGeometry(0.0035, 0.018, 4, 12), M.ink, ax, BODY_Y + 0.05, -0.036);
    stub.rotation.x = -0.22;
    const collar = mesh(new THREE.CylinderGeometry(0.0052, 0.0058, 0.005, 14), M.alloy, ax, BODY_Y + 0.0395, -0.034);
    collar.rotation.x = -0.22;
    antennas.add(stub, collar);
  }

  // ---- battery-bay vents: instanced louvers behind a sealed service cover
  const vents = new THREE.Group(); vents.name = 'vents'; root.add(vents);
  for (const sx of [-1, 1]) {
    for (let i = 0; i < 5; i++) {
      ventSpots.push({ p: [sx * (BODY_W / 2 - 0.001), BODY_Y - 0.016, -0.024 + i * 0.012], r: [0, sx * Math.PI / 2, sx * 0.28] });
    }
    vents.add(mesh(slab(0.004, 0.076, 0.03, 0.002, 0.001), M.shellMatte, sx * (BODY_W / 2 + 0.0008), BODY_Y + 0.006, 0));
    fastenSpots.push({ p: [sx * (BODY_W / 2 + 0.0022), BODY_Y + 0.018, 0], n: [sx, 0, 0] });
    fastenSpots.push({ p: [sx * (BODY_W / 2 + 0.0022), BODY_Y - 0.02, 0], n: [sx, 0, 0] });
  }

  // ---- belly: charge-contact plate, dock guide funnels, status LEDs, downlight
  const belly = new THREE.Group(); belly.name = 'belly'; root.add(belly);
  belly.add(mesh(slab(0.086, 0.06, 0.006, 0.014, 0.002), M.ink, 0, BODY_Y - 0.0345, 0.004));
  belly.add(mesh(slab(0.092, 0.066, 0.0022, 0.017, 0.0008), M.gasket, 0, BODY_Y - 0.0362, 0.004));
  for (let i = 0; i < 4; i++) padSpots.push({ p: [-0.024 + i * 0.016, BODY_Y - 0.0383, 0.004], n: [0, -1, 0] });
  for (let i = 0; i < 5; i++) ledSpots.push({ p: [-0.014 + i * 0.007, BODY_Y - 0.0376, -0.019], n: [0, -1, 0] });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    belly.add(mesh(new THREE.CylinderGeometry(0.0075, 0.0042, 0.008, 14, 1, true), M.alloy, sx * 0.056, BODY_Y - 0.036, sz * 0.04));
  }
  belly.add(mesh(slab(0.03, 0.03, 0.008, 0.012, 0.002), M.ink, 0, BODY_Y - 0.0465, 0.03));
  const downlightLens = mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.0025, 18), M.downlight, 0, BODY_Y - 0.052, 0.03);
  const strobeLens = mesh(new THREE.CylinderGeometry(0.005, 0.006, 0.004, 14), M.strobe, 0, BODY_Y - 0.0565, -0.026);
  belly.add(downlightLens, strobeLens);

  // ---- landing gear: skid rails plus angled struts; rail underside defines y = 0
  const gear = new THREE.Group(); gear.name = 'gear'; root.add(gear);
  const RAIL_R = 0.008;
  for (const sz of [-1, 1]) {
    const rail = mesh(new THREE.CapsuleGeometry(RAIL_R, 0.14, 5, 14), M.rubber, 0, RAIL_R, sz * 0.056);
    rail.rotation.z = Math.PI / 2;
    gear.add(rail);
    for (const ex of [-1, 1]) {
      const shoe = mesh(new THREE.CylinderGeometry(RAIL_R + 0.0016, RAIL_R + 0.0016, 0.014, 14), M.ink, ex * 0.062, RAIL_R, sz * 0.056);
      shoe.rotation.z = Math.PI / 2;
      gear.add(shoe);
      fastenSpots.push({ p: [ex * 0.05, RAIL_R + 0.001, sz * 0.056], n: [0, 1, 0] });
    }
    for (const lx of [-1, 1]) {
      const strut = mesh(new THREE.CapsuleGeometry(0.0045, 0.055, 4, 12), M.shell, lx * 0.052, BODY_Y - 0.046, sz * 0.048);
      strut.rotation.set(sz * -0.16, 0, lx * 0.12);
      gear.add(strut, mesh(slab(0.02, 0.016, 0.01, 0.005, 0.002), M.ink, lx * 0.05, BODY_Y - 0.03, sz * 0.044));
    }
  }

  // ---- 2-axis gimbal: yaw ring first, then the pitch cradle carrying the pod
  const gimbal = new THREE.Group();
  gimbal.name = 'gimbal';
  gimbal.position.set(0, BODY_Y - 0.04, 0.048);
  root.add(gimbal);
  gimbal.add(mesh(new THREE.CylinderGeometry(0.0085, 0.0105, 0.012, 16), M.ink, 0, 0.004, 0));
  gimbal.add(mesh(slab(0.016, 0.016, 0.01, 0.004, 0.002), M.motorCan, 0.013, -0.006, 0));

  const yaw = new THREE.Group(); yaw.name = 'gimbalYaw'; gimbal.add(yaw);
  const yawRing = mesh(new THREE.TorusGeometry(0.014, 0.0026, 8, 26), M.alloy, 0, -0.006, 0);
  yawRing.rotation.x = Math.PI / 2;
  yaw.add(yawRing);

  const pitch = new THREE.Group();
  pitch.name = 'gimbalPitch';
  pitch.position.set(0, -0.006, 0);
  yaw.add(pitch);
  const payload = new THREE.Group(); payload.name = 'payload'; pitch.add(payload);

  for (const sx of [-1, 1]) {
    payload.add(mesh(new THREE.CapsuleGeometry(0.0035, 0.016, 4, 12), M.alloy, sx * 0.019, -0.012, 0));
    const pm = mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.007, 16), M.motorCan, sx * 0.019, -0.006, 0);
    pm.rotation.z = Math.PI / 2;
    payload.add(pm);
  }
  payload.add(mesh(slab(0.036, 0.05, 0.036, 0.01, 0.004), M.shell, 0, -0.03, 0));
  payload.add(mesh(slab(0.038, 0.052, 0.002, 0.011, 0.0007), M.gasket, 0, -0.0135, 0));
  payload.add(mesh(slab(0.037, 0.012, 0.0025, 0.006, 0.0008), M.orange, 0, -0.0475, 0.012));

  const eoBarrel = mesh(new THREE.CylinderGeometry(0.0115, 0.0125, 0.016, 22), M.ink, 0, -0.03, -0.029);
  eoBarrel.rotation.x = Math.PI / 2;
  const eoRing = mesh(new THREE.TorusGeometry(0.0116, 0.0013, 8, 24), M.paperTrim, 0, -0.03, -0.0375);
  const eoGlass = mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.0022, 22), M.glass, 0, -0.03, -0.0385);
  eoGlass.rotation.x = Math.PI / 2;
  const eoBulb = mesh(new THREE.SphereGeometry(0.0092, 18, 12), M.glass, 0, -0.03, -0.0395);
  eoBulb.scale.z = 0.42;
  eoGlass.castShadow = false;
  eoBulb.castShadow = false;
  payload.add(eoBarrel, eoRing, eoGlass, eoBulb);

  // IR core window and laser-rangefinder aperture beside the EO lens.
  payload.add(mesh(slab(0.016, 0.012, 0.012, 0.004, 0.002), M.ink, 0.0115, -0.031, -0.026));
  const irGlass = mesh(plate(0.012, 0.009, 0.0022, 0.003), M.irWindow, 0.0115, -0.031, -0.0325);
  irGlass.castShadow = false;
  const laser = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.004, 14), M.irWindow, -0.0115, -0.036, -0.0255);
  laser.rotation.x = Math.PI / 2;
  laser.castShadow = false;
  payload.add(irGlass, laser);
  // Pod cover screws live in the payload frame, not the hull frame, because the
  // gimbal carries them through yaw and pitch.
  const screwGeo = new THREE.CylinderGeometry(0.0019, 0.0021, 0.0013, 6);
  for (let i = 0; i < 3; i++) {
    const s = mesh(screwGeo, M.alloy, -0.012 + i * 0.012, -0.021 + i * 0.009, 0.0262);
    s.rotation.x = Math.PI / 2;
    payload.add(s);
  }

  // ---- fold arms: hinge knuckle -> tube -> motor -> rotor
  const bladeGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.0042);
    s.quadraticCurveTo(0.026, -0.0058, 0.049, -0.0021);
    s.quadraticCurveTo(0.0525, 0, 0.049, 0.0021);
    s.quadraticCurveTo(0.02, 0.0056, 0, 0.0042);
    s.quadraticCurveTo(-0.004, 0, 0, -0.0042);
    const g = new THREE.ExtrudeGeometry(s, bev(0.0016, 0.0006, 1, 5));
    g.translate(0.006, 0, -0.0008);
    g.computeVertexNormals();
    return g;
  })();

  const arms = [], rotors = [], blades = [], discs = [], armRigs = [];
  const bladeDummy = new THREE.Object3D();
  for (let i = 0; i < 4; i++) {
    const hinge = new THREE.Group();
    hinge.name = 'arm' + i;
    hinge.position.set(HINGE[i][0], HINGE_Y, HINGE[i][1]);
    root.add(hinge);
    arms.push(hinge);

    hinge.add(mesh(new THREE.CylinderGeometry(0.0105, 0.012, 0.016, 18), M.ink, 0, -0.002, 0));
    const knuckleRing = mesh(new THREE.TorusGeometry(0.0108, 0.0012, 7, 22), M.orange, 0, 0.006, 0);
    knuckleRing.rotation.x = Math.PI / 2;
    hinge.add(knuckleRing, mesh(slab(0.012, 0.008, 0.005, 0.003, 0.0012), M.alloy, 0.006, 0.008, 0));

    const tube = mesh(new THREE.CapsuleGeometry(0.0062, ARM_LEN - 0.02, 4, 14), M.shell, ARM_LEN / 2, 0.001, 0);
    tube.rotation.z = Math.PI / 2;
    hinge.add(tube, mesh(slab(ARM_LEN - 0.045, 0.006, 0.0035, 0.002, 0.001), M.ink, ARM_LEN / 2, 0.0072, 0));

    // Signal cable in a sealed trough; parented to the arm so it folds captive.
    const cable = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.004, 0.006),
      new THREE.Vector3(ARM_LEN * 0.35, -0.005, 0.0075),
      new THREE.Vector3(ARM_LEN * 0.72, -0.004, 0.006),
      new THREE.Vector3(ARM_LEN - 0.012, 0.002, 0.0035),
    ]), 20, 0.0016, 7, false), M.rubber);
    cable.castShadow = true;
    hinge.add(cable);
    fastenSpots.push({ p: [HINGE[i][0], HINGE_Y + 0.011, HINGE[i][1]], n: [0, 1, 0] });

    const motor = new THREE.Group();
    motor.name = 'motor' + i;
    motor.position.set(ARM_LEN, 0, 0);
    hinge.add(motor);
    motor.add(mesh(new THREE.CylinderGeometry(0.0115, 0.0125, 0.024, 22), M.motorCan, 0, 0.013, 0));
    for (let k = 0; k < 5; k++) {
      const slot = mesh(new THREE.TorusGeometry(0.0126, 0.0007, 5, 20), M.ink, 0, 0.006 + k * 0.0032, 0);
      slot.rotation.x = Math.PI / 2;
      motor.add(slot);
    }
    motor.add(mesh(new THREE.CylinderGeometry(0.0092, 0.0115, 0.006, 20), M.alloy, 0, 0.028, 0));
    motor.add(mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.014, 12), M.alloy, 0, 0.036, 0));
    const guard = mesh(new THREE.TorusGeometry(0.0135, 0.0016, 7, 24), M.orange, 0, 0.0055, 0);
    guard.rotation.x = Math.PI / 2;
    motor.add(guard);

    const spinner = new THREE.Group();
    spinner.name = 'rotor' + i;
    spinner.position.set(0, BLADE_Y - HINGE_Y, 0);
    motor.add(spinner);
    rotors.push(spinner);
    spinner.add(mesh(new THREE.CylinderGeometry(0.0068, 0.0078, 0.0085, 18), M.ink, 0, 0, 0));
    spinner.add(mesh(new THREE.CylinderGeometry(0.0052, 0.0068, 0.0035, 18), M.orange, 0, 0.006, 0));

    const im = new THREE.InstancedMesh(bladeGeo, M.blade, 2);
    for (let b = 0; b < 2; b++) {
      bladeDummy.position.set(0, 0, 0);
      bladeDummy.rotation.set(0, b * Math.PI, 0);
      bladeDummy.rotateX(-0.42); // rigid pitch about the blade's own long axis
      bladeDummy.scale.set(1, 1, 1);
      bladeDummy.updateMatrix();
      im.setMatrixAt(b, bladeDummy.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.name = 'blades' + i;
    spinner.add(im);
    blades.push(im);

    const disc = new THREE.Mesh(new THREE.RingGeometry(0.011, PROP_R, 26, 1), M.disc);
    disc.rotation.x = -Math.PI / 2;
    disc.visible = false;
    disc.name = 'disc' + i;
    spinner.add(disc);
    discs.push(disc);

    armRigs.push({ hinge, motor, spinner, deploy: ARM_DEPLOY[i], fold: ARM_FOLD[i], tilt: ARM_TILT[i], dir: SPIN_DIR[i] });
  }

  // Wingtip navs: green on the right front tip, red on the left (arms 0 and 2).
  const navLights = [];
  for (const tip of [{ i: 0, mat: M.navGreen }, { i: 2, mat: M.navRed }]) {
    const rig = armRigs[tip.i];
    rig.motor.add(mesh(slab(0.014, 0.012, 0.008, 0.004, 0.002), M.ink, 0, -0.011, 0));
    const lens = mesh(new THREE.SphereGeometry(0.0045, 14, 10), tip.mat, 0, -0.017, 0);
    rig.motor.add(lens);
    navLights.push(lens);
  }

  // ---- instanced repeats: fasteners, louvers, charge pads, LED cells
  function instanced(geo, mat, spots) {
    const im = new THREE.InstancedMesh(geo, mat, spots.length);
    const d = new THREE.Object3D();
    const up = new THREE.Vector3(0, 1, 0);
    const n = new THREE.Vector3();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      d.position.set(s.p[0], s.p[1], s.p[2]);
      if (s.r) d.rotation.set(s.r[0], s.r[1], s.r[2]);
      else d.quaternion.setFromUnitVectors(up, n.set(s.n[0], s.n[1], s.n[2]));
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      im.setMatrixAt(i, d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
    im.castShadow = true;
    im.receiveShadow = true;
    return im;
  }

  const fasteners = instanced(screwGeo, M.alloy, fastenSpots);
  fasteners.name = 'fasteners';
  root.add(fasteners);
  const ventGrille = instanced(plate(0.011, 0.0042, 0.0035, 0.0015), M.ink, ventSpots);
  ventGrille.name = 'ventGrille';
  vents.add(ventGrille);
  const contacts = instanced(slab(0.011, 0.0075, 0.0022, 0.003, 0.0008), M.gold, padSpots);
  contacts.name = 'contacts';
  belly.add(contacts);
  const ledStrip = instanced(new THREE.CylinderGeometry(0.0018, 0.0018, 0.0016, 10), M.led, ledSpots);
  ledStrip.name = 'ledStrip';
  belly.add(ledStrip);

  function setArms(dep) {
    const k = 1 - THREE.MathUtils.clamp(dep, 0, 1);
    for (let i = 0; i < 4; i++) {
      const r = armRigs[i];
      r.hinge.rotation.y = r.deploy + k * r.fold;
      r.hinge.rotation.z = k * r.tilt;
      r.motor.rotation.z = -k * r.tilt; // keeps the rotor disc level while the arm droops
    }
  }

  // Centre in XZ and seat the lowest point (gear underside) on local y = 0,
  // measured with arms deployed because that is how the integrator flies it.
  setArms(1);
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  root.position.set(-centre.x, -box.min.y, -centre.z);
  group.updateMatrixWorld(true);

  const hotspotDefs = [
    { id: 'battery-bay', label: 'Swappable battery bay', note: '104 Wh sealed pack, 40 min endurance class, vented bay, rated -20 to +50 C.', p: [0.079, BODY_Y - 0.01, 0] },
    { id: 'survey-pod', label: 'EO/IR survey pod', note: 'EO 48 MP stills plus IR 640x512 radiometric core on a 2-axis stabilised gimbal.', p: [0, BODY_Y - 0.078, 0.05] },
    { id: 'rtk-module', label: 'RTK heading module', note: 'Dual-band RTK delivers cm-level landing onto the dock charge pad.', p: [0, BODY_Y + 0.058, -0.02] },
    { id: 'charge-plate', label: 'Dock charge contacts', note: 'Gold belly contacts take 60 W from the dock pad; IP54 sealed airframe.', p: [0, BODY_Y - 0.045, 0.004] },
    { id: 'fold-arm', label: 'Sealed fold hinge', note: '0.34 m folded, 0.55 m rotor span, 1.2 kg dry weight, 8 km link.', p: [HINGE[0][0] + 0.012, HINGE_Y, HINGE[0][1] + 0.012] },
  ];
  const hotspots = hotspotDefs.map((h) => ({
    id: h.id, label: h.label, note: h.note,
    world: new THREE.Vector3(h.p[0] + root.position.x, h.p[1] + root.position.y, h.p[2] + root.position.z),
  }));

  const bbox = { width: +size.x.toFixed(3), height: +size.y.toFixed(3), depth: +size.z.toFixed(3) };
  const parts = {
    fuselage, gimbal, yaw, pitch, payload, arms, rotors, blades, gear, vents, ventGrille,
    navLights, rtk, antennas, belly, contacts, ledStrip, fasteners,
    strobe: strobeLens, downlight: downlightLens,
  };

  // Allocation-free per-frame driver.
  function drive(state) {
    const elapsed = state.elapsed || 0;
    const rpm = Math.max(0, Math.min(6000, state.propSpin || 0));
    setArms(state.armsDeploy === undefined ? 1 : state.armsDeploy);

    // Above ~1500 rpm discrete blades stop reading: fade them and lift a
    // translucent disc so rotation stays legible without strobe aliasing.
    const ghost = THREE.MathUtils.clamp((rpm - 1500) / 1400, 0, 1);
    M.blade.opacity = 1 - 0.72 * ghost;
    M.disc.opacity = 0.06 + 0.26 * ghost;
    const frac = ((elapsed * rpm) / 60) % 1;
    for (let i = 0; i < 4; i++) {
      armRigs[i].spinner.rotation.y = armRigs[i].dir * frac * TAU;
      discs[i].visible = ghost > 0.02;
    }

    yaw.rotation.y = state.gimbalYaw || 0;
    pitch.rotation.x = THREE.MathUtils.clamp(state.gimbalPitch || 0, -1.5, 0.5);

    const on = !!state.navLights;
    // Real pattern: steady wingtip navs, white double-flash strobe every 1.4 s.
    const phase = elapsed % 1.4;
    const flash = on && (phase < 0.06 || (phase > 0.14 && phase < 0.2));
    M.navRed.emissiveIntensity = on ? 2.2 : 0;
    M.navGreen.emissiveIntensity = on ? 2.2 : 0;
    M.strobe.emissiveIntensity = flash ? 3 : 0;
    M.downlight.emissiveIntensity = on ? 1.6 : 0;
    M.led.emissiveIntensity = on ? 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(elapsed * 1.6)) : 0.18;
  }

  setArms(0);
  return { group, parts, materials: M, hotspots, bbox, drive };
}
