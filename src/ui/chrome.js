// AiroLift D2 — 2D interface layer over the stage canvas.
// Screen-space numbers in, named actions out. No scene knowledge, no top-level side effects.
import { COPY, LANG } from './copy.js';

const CHOICES = {
  view: ['hero', 'top', 'macro', 'detail', 'launch'],
  weather: ['clear', 'rain', 'snow', 'dust'],
  time: ['day', 'dusk', 'night'],
};
const TOGGLES = ['explode', 'orbit'];
const GROUPS = ['view', 'weather', 'time', 'lid', 'modes'];
// Rail readouts in display order. `warn` is the flight envelope from the spec sheet; rain feeds the timeline.
const METRICS = [
  { key: 'windMs', digits: 1, warn: (v) => v > 12 },
  { key: 'tempC', digits: 1, warn: (v) => v < -20 || v > 50 },
  { key: 'humidity', digits: 0 },
  { key: 'batteryPct', digits: 0, warn: (v) => v < 20 },
  { key: 'missions', digits: 0 },
  { key: 'uptimeH', digits: 0 },
  { key: 'rainMm', digits: 1 },
];
const TIME_HOUR = { day: 12, dusk: 19, night: 1 };
const COUNT_MS = 800;
const TWEEN_MS = 240;
const FADE_MS = 280;
const LID = { steps: 1000, gapMs: 15, holdMs: 1200, eps: 0.006, travelMs: 2600, dwellMs: 900 };
const LID_KEYS = { ArrowRight: 20, ArrowUp: 20, ArrowLeft: -20, ArrowDown: -20, PageUp: 100, PageDown: -100 };
// Hotspot geometry in px; mirrors .al-hs and .al-card in ui.css.
const SPOT = { reach: 27, half: 14, margin: 12, band: 28, clear: 6 };
const RING = 2 * Math.PI * 47;

const line = (d) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="${d}"/></svg>`;
const ICON = {
  mark: '<svg class="al-mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path d="M3 17h18v3.5H3z" fill="currentColor"/><path d="M4.5 13.5 9 7.5M19.5 13.5 15 7.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square"/><circle cx="12" cy="4.5" r="2.25"/></svg>',
  ring: '<svg class="al-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="56" pathLength="120"/><circle cx="60" cy="60" r="47"/><circle cx="60" cy="60" r="47" transform="rotate(-90 60 60)"/></svg>',
  arrowRight: line('M2.5 8h10M8.5 4l4 4-4 4'),
  arrowDown: line('M8 2.5v10M4 8.5l4 4 4-4'),
  close: line('M4 4l8 8M12 4l-8 8'),
  menu: line('M2 5.5h12M2 10.5h12'),
  explode: line('M6 6h4v4H6zM8 1.5V4M8 12v2.5M1.5 8H4M12 8h2.5'),
  orbit: line('M13 8a5 5 0 1 1-1.5-3.55M13.25 2.25V5H10.5'),
  land: line('M8 2.5v8M4.5 7 8 10.5 11.5 7M2.5 13.5h11'),
};

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const fill = (template, vars) => String(template).replace(/\{(\w+)\}/g, (match, key) => (key in vars ? vars[key] : match));
const band = (hour) => (hour < 5 || hour >= 21 ? 'night' : hour < 7 || hour >= 18 ? 'dusk' : 'day');
const easeOut = (k) => 1 - (1 - k) ** 3;
const easeInOut = (k) => (k < 0.5 ? 2 * k * k : 1 - (2 - 2 * k) ** 2 / 2);
const formatNumber = (value, digits, format) => {
  const [whole, frac] = Math.abs(value).toFixed(digits).split('.');
  const sign = value < 0 && Number(whole + '.' + (frac || 0)) !== 0 ? format.minus : '';
  return sign + whole.replace(/\B(?=(\d{3})+$)/g, format.group) + (frac ? format.decimal + frac : '');
};

export function createUI(root, handlers = {}) {
  const api = handlers || {};
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const docEl = doc.documentElement;
  const C = COPY.controls;
  const R = COPY.rail;
  const ac = new AbortController();
  const on = (target, type, fn, opts) => target.addEventListener(type, fn, { ...opts, signal: ac.signal });
  const now = () => view.performance.now();
  const raf = (fn) => view.requestAnimationFrame(fn);
  const caf = (id) => view.cancelAnimationFrame(id);
  const reduced = view.matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = view.matchMedia('(max-width: 1023.98px)');
  const timers = new Set();
  const later = (fn, ms) => {
    const id = view.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
    return id;
  };
  let dead = false;
  // Every interaction leaves through here.
  const emit = (name, value) => (dead || typeof api.onAction !== 'function' ? undefined : api.onAction(name, value));

  // h('tag.class', { attrs }, ...children). Strings become text nodes; null, false and nested arrays are fine.
  const h = (sel, attrs, ...kids) => {
    const [tag, ...classes] = sel.split('.');
    const node = doc.createElement(tag);
    if (classes.length) node.className = classes.join(' ');
    if (attrs != null && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) {
      kids.unshift(attrs);
      attrs = null;
    }
    for (const key in attrs) {
      if (attrs[key] != null && attrs[key] !== false) node.setAttribute(key, attrs[key] === true ? '' : attrs[key]);
    }
    node.append(...kids.flat().filter((kid) => kid != null && kid !== false));
    return node;
  };
  const icon = (name) => {
    const holder = doc.createElement('template');
    holder.innerHTML = ICON[name];
    return holder.content.firstChild;
  };
  const setText = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  const button = (sel, attrs, ...kids) => h('button.' + sel, { type: 'button', ...attrs }, ...kids);

  // ---- Boot veil ----
  const boot = { value: 0, done: false, revealed: false };
  const veilLabel = h('span', COPY.boot.stages[0].text);
  const veilPct = h('span.al-num', { 'aria-hidden': true }, fill(COPY.boot.percent, { pct: '00' }));
  const ring = icon('ring');
  const arc = ring.lastChild;
  arc.style.strokeDasharray = arc.style.strokeDashoffset = RING.toFixed(2);
  const veil = h('div.al-veil', { role: 'progressbar', 'aria-label': COPY.boot.label, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': 0 },
    h('div.al-veil__dial', ring, icon('mark')),
    h('p.al-veil__name', COPY.brand.wordmark, h('span.al-num', COPY.brand.model)),
    h('p.al-veil__status', veilLabel, veilPct));

  // ---- Top bar ----
  const brand = () => h('a.al-brand', { href: '#al-top', 'data-nav': 'product', 'aria-label': COPY.brand.home }, icon('mark'), h('span', COPY.brand.wordmark));
  const navLinks = COPY.nav.items.map((item) => h('a', { href: '#al-' + (item.id === 'product' ? 'top' : item.id), 'data-nav': item.id }, item.label));
  const menuBtn = button('al-iconbtn.al-top__menu', { 'aria-expanded': 'false', 'aria-controls': 'al-nav', 'aria-label': COPY.nav.menu, 'data-menu': true }, icon('menu'));
  const langBtn = button('al-btn.al-btn--ghost.al-lang', { 'data-lang': true, 'aria-label': COPY.lang.label, lang: COPY.lang.next }, COPY.lang.switchLabel);
  const topBar = h('header.al-top', brand(), h('nav.al-nav', { id: 'al-nav', 'aria-label': COPY.nav.label }, navLinks),
    h('div.al-top__actions', langBtn, button('al-btn.al-btn--ghost', { 'data-cta': 'demo' }, COPY.nav.cta), menuBtn));

  // ---- Hero ----
  const hero = h('section.al-hero.al-fade', { 'aria-labelledby': 'al-title' },
    h('p.al-eyebrow', COPY.hero.eyebrow),
    h('h1', { id: 'al-title' }, COPY.hero.title),
    h('p.al-hero__lede', COPY.hero.body),
    h('div.al-hero__cta',
      button('al-btn.al-btn--primary', { 'data-cta': 'demo' }, COPY.hero.primary, icon('arrowRight')),
      button('al-btn.al-btn--secondary', { 'data-cta': 'docs' }, COPY.hero.secondary, icon('arrowDown'))));

  // ---- Control dock ----
  // Each group is a labelled panel. Below 1024 px the tab strip shows its value and opens one panel at a time.
  const groups = {};
  const addGroup = (name, body) => {
    const label = C[name].label;
    const panel = h('div.al-group.al-group--' + name, { id: 'al-group-' + name }, h('span.al-cap', label), body);
    const value = h('b');
    const tab = button('al-tab', { 'data-tab': name, 'aria-expanded': 'false', 'aria-controls': panel.id }, h('span.al-cap', label), value);
    groups[name] = { panel, tab, value };
  };
  const segs = {};
  for (const name of Object.keys(CHOICES)) {
    segs[name] = CHOICES[name].map((value) => button('al-seg__opt', { role: 'radio', 'aria-checked': 'false', tabindex: -1, 'data-seg': name, 'data-value': value }, C[name].options[value]));
    addGroup(name, h('div.al-seg', { role: 'radiogroup', 'aria-label': C[name].label }, segs[name]));
  }
  const lidInput = h('input.al-range', { type: 'range', min: 0, max: LID.steps, step: 1, value: 0, 'aria-label': C.lid.label });
  const lidReadout = h('span.al-num', { 'aria-hidden': true });
  const autoBtn = button('al-toggle', { 'aria-pressed': 'false', 'aria-label': C.lid.autoLabel, 'data-auto': true }, C.lid.auto);
  addGroup('lid', h('div.al-lid', lidInput, lidReadout, autoBtn));
  const toggles = {};
  for (const name of TOGGLES) toggles[name] = button('al-toggle', { 'aria-pressed': 'false', 'data-toggle': name }, icon(name), C[name].label);
  const landBtn = button('al-toggle.al-land', { 'data-land': true, disabled: '' }, icon('land'), C.land.label);
  addGroup('modes', h('div.al-modes', TOGGLES.map((name) => toggles[name]), landBtn));
  const dock = h('section.al-dock.al-plate.al-fade', { 'aria-label': C.label },
    h('div.al-tabs', GROUPS.map((name) => groups[name].tab)),
    h('div.al-dock__groups', GROUPS.map((name) => groups[name].panel)));

  // ---- Instrument rail ----
  const meters = METRICS.map((def) => ({ ...def, value: null, to: null, from: 0, start: 0, dur: 0, counting: false, text: '', num: h('span.al-num', R.empty) }));
  const rain = meters[meters.length - 1];
  const rows = meters.slice(0, -1).map((m) => {
    m.flag = h('span.al-flag', { hidden: true }, R.limit);
    m.row = h('div.al-metric', { 'data-key': m.key }, h('dt.al-cap', R.metrics[m.key].label, m.flag), h('dd', m.num, h('span.al-unit', R.metrics[m.key].unit)));
    return m.row;
  });
  const ipRating = h('span.al-num', R.ip.rating);
  const ipState = h('span.al-cap', R.ip.sealed);
  const ipChip = h('div.al-chip', ipRating, ipState);
  const cursor = h('span.al-timeline__cursor');
  const timeline = h('div.al-timeline', { role: 'img' },
    h('div.al-timeline__head', h('span.al-cap', R.timeline.label), h('span.al-cap', R.timeline.rain, ' ', rain.num, ' ', h('span.al-unit', R.timeline.unit))),
    h('div.al-timeline__bar', Array.from({ length: 24 }, (_, hour) => h('i', { 'data-band': band(hour) })), cursor),
    h('div.al-timeline__scale.al-num', R.timeline.scale.map((tick) => h('span', tick))));
  const liveEl = h('span.al-live.al-cap', R.standby);
  const rail = h('aside.al-rail.al-plate.al-fade', { 'aria-label': R.label },
    h('div.al-rail__head', h('span.al-cap', R.title), liveEl), h('dl', rows), h('div.al-rail__foot', ipChip, timeline));

  // ---- Hotspot layer and its one shared card ----
  const spotLayer = h('div.al-hotspots', { role: 'group', 'aria-label': C.hotspot.group });
  const cardTitle = h('p.al-cap', { id: 'al-card-title' });
  const cardNote = h('p.al-card__note');
  const card = h('div.al-card.al-plate', { id: 'al-card', role: 'group', 'aria-labelledby': 'al-card-title' },
    cardTitle, button('al-iconbtn', { 'aria-label': C.hotspot.close, 'data-spot-close': true }, icon('close')), cardNote);

  // ---- Scroll story, specs, footer ----
  const sectorButtons = [];
  const sectorRow = (section) => {
    if (!section.sectors) return null;
    const row = h('div.al-sectors', { role: 'group', 'aria-label': section.sectors.label },
      section.sectors.items.map((sector) => {
        const btn = button('al-sector', { 'data-sector': sector.id, 'aria-pressed': 'false' },
          h('span.al-sector__label', sector.label),
          h('span.al-sector__note', sector.note),
          h('span.al-sector__stat.al-num', sector.stat));
        btn.sectorId = sector.id;
        sectorButtons.push(btn);
        return btn;
      }));
    return row;
  };
  const panels = COPY.sections.map((section, i) => h('section.al-panel', { id: 'al-' + section.id },
    h('div.al-panel__body',
      h('p.al-panel__index', h('span.al-num', String(i + 1).padStart(2, '0')), h('span.al-cap', section.kicker)),
      h('h2', { tabindex: -1 }, section.title),
      h('ul.al-bullets', section.bullets.map((bullet) => h('li', bullet))),
      sectorRow(section))));
  const fold = h('div.al-fold', { 'aria-hidden': true });
  const story = h('div', panels);
  const specList = h('dl.al-rows');
  const specs = h('section.al-specs', { id: 'al-specs' },
    h('div', h('p.al-cap', COPY.brand.product), h('h2', { tabindex: -1 }, COPY.specs.title), h('p.al-note', COPY.specs.note)), specList);
  const foot = h('footer.al-foot', { id: 'al-contact' },
    h('div', brand(), h('p.al-note', COPY.footer.tagline)),
    h('div', h('h2.al-cap', { tabindex: -1 }, COPY.footer.contactTitle),
      h('ul.al-rows', COPY.footer.contacts.map((item) => h('li', h('span', item.label), h('a.al-num', { href: item.href }, item.value))))),
    h('p.al-foot__legal', COPY.footer.legal));

  // ---- Assembly ----
  const toastEl = h('div.al-toast', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const layer = h('div.al-layer', topBar, hero, dock, rail, spotLayer);
  const flow = h('main.al-flow', fold, story, specs);
  const wrapper = h('div.al-ui', { id: 'al-top' }, h('div.al-scrim'), layer, flow, foot, h('div.al-busy'), toastEl, veil);
  const stageChrome = [hero, dock, rail, spotLayer];
  const behindVeil = [layer, flow, foot];
  behindVeil.forEach((el) => el.toggleAttribute('inert', true));
  root.append(wrapper);

  // main.js normally imports ui.css. If it has not, attach it here so the chrome never renders unstyled.
  let styleLink = null;
  if (view.getComputedStyle(wrapper).getPropertyValue('--al-ui').trim() !== '1') {
    styleLink = h('link', { rel: 'stylesheet', href: new URL('./ui.css', import.meta.url).href });
    wrapper.style.visibility = 'hidden';
    const reveal = () => { wrapper.style.visibility = ''; };
    on(styleLink, 'load', reveal);
    on(styleLink, 'error', reveal);
    later(reveal, 1500);
    doc.head.append(styleLink);
  }

  // ---- Segmented controls and toggles ----
  const state = { view: 'hero', weather: 'clear', time: 'day', explode: false, orbit: false, loading: null, theme: null };
  const themeBefore = docEl.getAttribute('data-theme');
  const renderTimeline = () => {
    cursor.style.left = (((TIME_HOUR[state.time] + 0.5) / 24) * 100).toFixed(2) + '%';
    timeline.setAttribute('aria-label', fill(R.timeline.aria, {
      time: C.time.options[state.time],
      rain: rain.to == null ? R.empty : formatNumber(rain.to, rain.digits, R.format),
    }));
  };
  const renderChoice = (name) => {
    for (const btn of segs[name]) {
      const checked = btn.dataset.value === state[name];
      btn.setAttribute('aria-checked', checked);
      btn.tabIndex = checked ? 0 : -1;
    }
    setText(groups[name].value, C[name].options[state[name]]);
    if (name === 'time') renderTimeline();
  };
  const renderToggles = () => {
    for (const name of TOGGLES) toggles[name].setAttribute('aria-pressed', state[name]);
    setText(groups.modes.value, state.explode && state.orbit ? C.modes.both : state.explode ? C.explode.label : state.orbit ? C.orbit.label : C.modes.none);
    landBtn.disabled = !(state.explode || state.view === 'launch');
  };
  const choose = (name, value) => {
    if (state[name] === value) return;
    state[name] = value;
    renderChoice(name);
    emit(name, value);
  };

  // ---- Lid: hand-dragged slider, auto cycle, 60 Hz emit, echo-safe sync ----
  // Whoever moved the lid last owns the thumb. After the user or the auto cycle sends a value the thumb
  // holds it while the scene closes in, and follows the scene again once it arrives or stalls.
  const lid = { value: 0, pct: -1, remote: 0, heard: false, owned: false, until: 0, timer: 0, gap: Infinity, dragging: false, auto: false, pending: null, sent: null, lastEmit: -Infinity, raf: 0, autoRaf: 0, clock: 0, last: 0, from: 0, dir: 1, dwell: false };
  let ipOverride = null;
  const renderIp = () => {
    const sealed = ipOverride == null ? lid.pct === 0 : ipOverride;
    ipChip.toggleAttribute('data-open', !sealed);
    setText(ipState, sealed ? R.ip.sealed : R.ip.open);
  };
  const showLid = (v) => {
    lid.value = clamp(v, 0, 1);
    const step = Math.round(lid.value * LID.steps);
    if (Number(lidInput.value) !== step) lidInput.value = step;
    const pct = Math.round(lid.value * 100);
    if (pct === lid.pct) return;
    lid.pct = pct;
    const text = fill(C.lid.readout, { pct });
    lidReadout.textContent = text;
    groups.lid.value.textContent = text;
    lidInput.style.setProperty('--fill', pct + '%');
    lidInput.setAttribute('aria-valuetext', fill(C.lid.value, { pct }));
    renderIp();
  };
  const follow = () => {
    lid.owned = false;
    lid.sent = null;
    if (lid.heard) showLid(lid.remote);
  };
  const release = () => {
    lid.timer = 0;
    if (!lid.owned) return;
    const wait = lid.until - now();
    if (wait > 0 || lid.dragging || lid.auto || lid.pending != null) lid.timer = later(release, Math.max(wait, 250));
    else follow();
  };
  const own = () => {
    lid.owned = true;
    lid.until = now() + LID.holdMs;
    if (!lid.timer) lid.timer = later(release, LID.holdMs);
  };
  const acceptLid = (v) => {
    lid.remote = clamp(v, 0, 1);
    lid.heard = true;
    if (lid.dragging || lid.auto || lid.pending != null) return;
    const gap = lid.owned && lid.sent != null ? Math.abs(lid.remote - lid.sent) : 0;
    if (gap <= LID.eps) { follow(); return; }
    if (gap < lid.gap - 1e-4) lid.until = now() + LID.holdMs; // still closing in on what was sent
    lid.gap = gap;
  };
  const flushLid = (t) => {
    lid.raf = 0;
    if (dead || lid.pending == null) return;
    if (t - lid.lastEmit < LID.gapMs) { lid.raf = raf(flushLid); return; }
    const v = lid.pending;
    lid.pending = null;
    if (v === lid.sent) return;
    lid.lastEmit = t;
    lid.sent = v;
    lid.gap = Infinity;
    lid.heard = false;
    own();
    emit('lid', v);
  };
  const queueLid = (v, t) => {
    lid.pending = Math.round(v * LID.steps) / LID.steps;
    if (lid.raf) return;
    if (t == null) lid.raf = raf(flushLid);
    else flushLid(t);
  };
  const stopAuto = () => {
    if (!lid.auto) return;
    lid.auto = false;
    caf(lid.autoRaf);
    autoBtn.setAttribute('aria-pressed', 'false');
  };
  const stepAuto = (t) => {
    if (dead || !lid.auto) return;
    lid.clock += clamp(t - lid.last, 0, 50);
    lid.last = t;
    const target = lid.dir > 0 ? 1 : 0;
    if (!lid.dwell) {
      const k = clamp(lid.clock / Math.max(320, LID.travelMs * Math.abs(target - lid.from)), 0, 1);
      showLid(lid.from + (target - lid.from) * easeInOut(k));
      queueLid(lid.value, t);
      if (k >= 1) Object.assign(lid, { dwell: true, clock: 0 });
    } else if (lid.clock >= LID.dwellMs) {
      Object.assign(lid, { dwell: false, clock: 0, from: target, dir: -lid.dir });
    }
    lid.autoRaf = raf(stepAuto);
  };
  const startAuto = () => {
    if (reduced.matches) { // no scripted motion: one step to the other end, and the toggle stays off
      showLid(lid.value < 0.5 ? 1 : 0);
      queueLid(lid.value);
      return;
    }
    Object.assign(lid, { auto: true, dwell: false, clock: 0, last: now(), from: lid.value, dir: lid.value >= 0.995 ? -1 : 1 });
    autoBtn.setAttribute('aria-pressed', 'true');
    lid.autoRaf = raf(stepAuto);
  };
  const userLid = (step) => {
    stopAuto();
    showLid(clamp(step, 0, LID.steps) / LID.steps);
    queueLid(lid.value);
  };
  const endDrag = () => {
    if (!lid.dragging) return;
    lid.dragging = false;
    if (!lid.owned && lid.pending == null) follow();
  };
  on(lidInput, 'input', () => userLid(Number(lidInput.value)));
  on(lidInput, 'pointerdown', () => { lid.dragging = true; stopAuto(); });
  on(lidInput, 'change', endDrag);
  on(lidInput, 'blur', endDrag);
  on(view, 'pointerup', endDrag);
  on(view, 'pointercancel', endDrag);
  on(lidInput, 'keydown', (event) => {
    const delta = LID_KEYS[event.key];
    const step = delta ? Number(lidInput.value) + delta * (event.shiftKey ? 5 : 1) : event.key === 'Home' ? 0 : event.key === 'End' ? LID.steps : null;
    if (step == null) return;
    event.preventDefault();
    userLid(step);
  });

  // ---- Mobile menu, compact dock tabs, in-page navigation ----
  let menuOpen = false;
  const setMenu = (open) => {
    menuOpen = open;
    topBar.toggleAttribute('data-menu', open);
    menuBtn.setAttribute('aria-expanded', open);
  };
  let openName = null;
  const openGroup = (name) => {
    openName = name;
    for (const key of GROUPS) {
      groups[key].panel.toggleAttribute('data-open', key === name);
      groups[key].tab.setAttribute('aria-expanded', key === name);
    }
  };
  const targets = { product: wrapper, specs, contact: foot };
  COPY.sections.forEach((section, i) => { targets[section.id] = panels[i]; });
  const navigate = (key) => {
    const el = targets[key];
    setMenu(false);
    if (!el) return;
    el.scrollIntoView({ behavior: reduced.matches ? 'auto' : 'smooth', block: 'start' });
    const heading = el === wrapper ? null : el.querySelector('[tabindex="-1"]');
    if (heading) heading.focus({ preventScroll: true });
  };

  // ---- Hotspots: keyed nodes, reused every frame ----
  const spots = new Map();
  const keepOut = [];
  const cardBox = { w: 0, h: 0, dx: NaN, dy: NaN };
  let activeId = null;
  let spotPass = 0;
  let vw = 0;
  let vh = 0;
  let dpr = 1;
  let topH = 0;
  const hits = (list, box) => list.some((k) => k.rec !== box.rec && box.l < k.r && box.r > k.l && box.t < k.b && box.b > k.t);
  const dotBox = (rec) => ({ rec, l: rec.nx - 7, t: rec.ny - 7, r: rec.nx + 7, b: rec.ny + 7 });
  // Viewport rects of the fixed chrome. Labels flip, fold to their dot or hide rather than cross them.
  const surveyChrome = () => {
    topH = topBar.offsetHeight;
    cardBox.w = 0;
    cardBox.dx = NaN;
    for (const rec of spots.values()) rec.lw = 0;
    keepOut.length = 0;
    for (const el of [topBar, hero, rail, dock]) {
      const box = el.getBoundingClientRect();
      if (box.width && box.height) keepOut.push({ l: box.left - SPOT.clear, t: box.top - SPOT.clear, r: box.right + SPOT.clear, b: box.bottom + SPOT.clear });
    }
  };
  const createSpot = (key) => {
    const text = h('span.al-hs__label');
    const btn = button('al-hs__btn', { 'data-spot': key, 'aria-expanded': 'false', 'aria-controls': 'al-card' }, h('i'), text);
    const el = h('div.al-hs', { 'data-side': 'r' }, btn);
    const rec = { id: key, el, btn, text, label: null, note: '', x: NaN, y: NaN, nx: NaN, ny: NaN, depth: 0, want: false, lw: 0, side: 'r', fold: false, on: false, z: -1, pass: 0 };
    spots.set(key, rec);
    spotLayer.append(el);
    return rec;
  };
  const showSpot = (rec, visible) => {
    if (visible === rec.on) return;
    rec.on = visible;
    rec.el.toggleAttribute('data-on', visible);
  };
  const placeCard = () => {
    const rec = spots.get(activeId);
    if (!rec || !rec.on) return;
    if (!cardBox.w) { cardBox.w = card.offsetWidth; cardBox.h = card.offsetHeight; }
    const m = SPOT.margin;
    const restX = rec.side === 'r' ? rec.x + SPOT.reach : rec.x - SPOT.reach - cardBox.w;
    const restY = rec.y - SPOT.half;
    const dx = Math.round(clamp(restX, m, Math.max(m, vw - m - cardBox.w)) - restX);
    let top = restY;
    if (Math.abs(dx) > SPOT.reach) { // no room beside the anchor: sit below it, or above when the floor is near
      top = rec.y + 16 + cardBox.h > vh - m ? rec.y - 16 - cardBox.h : rec.y + 16;
    }
    const dy = Math.round(clamp(top, topH + m, Math.max(topH + m, vh - m - cardBox.h)) - restY);
    if (dx === cardBox.dx && dy === cardBox.dy) return;
    cardBox.dx = dx;
    cardBox.dy = dy;
    card.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    rec.el.toggleAttribute('data-loose', top !== restY); // the leader no longer meets the card
  };
  const mountCard = (rec) => {
    setText(cardTitle, rec.label);
    setText(cardNote, rec.note);
    cardNote.hidden = !rec.note;
    rec.el.toggleAttribute('data-active', true);
    rec.btn.setAttribute('aria-expanded', 'true');
    if (card.parentNode !== rec.el) rec.el.append(card);
    cardBox.w = 0;
    cardBox.dx = NaN;
    card.style.transform = '';
    placeCard();
  };
  const activate = (key, fromUser) => {
    if (key === activeId) return;
    const prev = spots.get(activeId);
    const hadFocus = card.contains(doc.activeElement);
    if (prev) {
      prev.el.removeAttribute('data-active');
      prev.el.removeAttribute('data-loose');
      prev.btn.setAttribute('aria-expanded', 'false');
    }
    card.remove();
    activeId = key;
    const rec = spots.get(key);
    if (rec && rec.label !== null) mountCard(rec);
    if (hadFocus && prev) prev.btn.focus({ preventScroll: true });
    if (fromUser) emit('hotspot', key);
  };
  // A label or note sent by the scene wins; COPY.hotspots fills the gaps.
  const describeSpot = (rec, item) => {
    const copy = COPY.hotspots[rec.id] || {};
    const label = String(item.label || copy.label || rec.id);
    const note = String(item.note || copy.note || '');
    if (label === rec.label && note === rec.note) return;
    rec.label = label;
    rec.note = note;
    rec.lw = 0;
    rec.text.textContent = label;
    rec.btn.setAttribute('aria-label', fill(C.hotspot.open, { label }));
    if (rec.id === activeId) mountCard(rec);
  };
  // One pass per frame, nearest anchor first. A label points away from the cluster centre; if that side is
  // taken by the chrome, the viewport edge, a nearer label or another dot it tries the other side, then
  // folds to its dot. Hover, focus or a tap brings a folded label back.
  const layoutSpot = (rec, frame) => {
    const x = rec.nx;
    const y = rec.ny;
    const active = rec.id === activeId;
    if (!rec.lw) rec.lw = rec.text.offsetWidth;
    const reach = SPOT.reach + (active ? cardBox.w || card.offsetWidth : rec.lw);
    const pad = rec.fold ? SPOT.clear : 0; // a folded label needs a little more room before it returns
    const box = (s, p) => ({ rec, l: (s === 'r' ? x + 7 : x - reach) - p, t: y - SPOT.half - p, r: (s === 'r' ? x + reach : x - 7) + p, b: y + SPOT.half + p });
    const fits = (s) => {
      const b = box(s, pad);
      if (b.l < SPOT.margin || b.r > vw - SPOT.margin) return false;
      return active || !(hits(keepOut, b) || hits(frame.labels, b) || hits(frame.dots, b));
    };
    let side = rec.side;
    if (side === 'l' && x > frame.cx + SPOT.band) side = 'r';
    else if (side === 'r' && x < frame.cx - SPOT.band) side = 'l';
    const other = side === 'r' ? 'l' : 'r';
    let fold = false;
    if (!fits(side)) {
      if (fits(other)) side = other;
      else fold = !active;
    }
    if (!fold && !active) frame.labels.push(box(side, 0));
    if (side !== rec.side) {
      rec.side = side;
      rec.el.setAttribute('data-side', side);
      if (active) cardBox.dx = NaN;
    }
    if (fold !== rec.fold) {
      rec.fold = fold;
      rec.el.toggleAttribute('data-fold', fold);
    }
    if (x !== rec.x || y !== rec.y) {
      rec.x = x;
      rec.y = y;
      rec.el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
    const z = 100 - Math.round((frame.span > 1e-6 ? clamp((rec.depth - frame.near) / frame.span, 0, 1) : 0) * 90);
    if (z !== rec.z) {
      rec.z = z;
      rec.el.style.zIndex = z;
    }
    showSpot(rec, true);
  };

  // ---- Telemetry: count up once, then tween ----
  const moving = new Set();
  let meterRaf = 0;
  const paintMeter = (m) => {
    const text = formatNumber(m.value, m.digits, R.format);
    if (text === m.text) return;
    m.text = text;
    m.num.textContent = text;
  };
  const stepMeters = (t) => {
    meterRaf = 0;
    if (dead) return;
    for (const m of moving) {
      const k = clamp((t - m.start) / m.dur, 0, 1);
      m.value = k >= 1 ? m.to : m.from + (m.to - m.from) * easeOut(k);
      paintMeter(m);
      if (k >= 1) {
        m.counting = false;
        moving.delete(m);
      }
    }
    if (moving.size) meterRaf = raf(stepMeters);
  };
  const animate = (m) => {
    const first = m.value === null;
    if (reduced.matches) {
      m.value = m.to;
      m.counting = false;
      moving.delete(m);
      paintMeter(m);
      return;
    }
    if (m.counting) return; // the count-up keeps its clock and lands on the newest value
    m.from = first ? 0 : m.value;
    m.value = m.from;
    m.counting = first;
    m.dur = first ? COUNT_MS : TWEEN_MS;
    m.start = now();
    moving.add(m);
    if (!meterRaf) meterRaf = raf(stepMeters);
  };
  const retarget = (m, target) => {
    if (m.to === target) return;
    m.to = target;
    if (m.warn) {
      const warned = m.warn(target);
      m.row.toggleAttribute('data-warn', warned);
      m.flag.hidden = !warned;
    }
    if (m === rain) renderTimeline();
    if (boot.revealed) animate(m); // values that arrive under the veil count up when it lifts
  };

  // ---- Scroll: thin the stage, track the story ----
  const scroll = { raf: 0, thin: -1, away: false, solid: false, section: -1, zone: null };
  const setSection = (index) => {
    if (index === scroll.section) return;
    const prev = scroll.section;
    scroll.section = index;
    panels.forEach((panel, i) => panel.toggleAttribute('data-current', i === index));
    if (index >= 0) emit('section', index);
    else if (prev >= 0) emit('view', state.view); // back above the story: re-assert the selected view
  };
  let activeSector = null;
  const setSector = (id) => {
    activeSector = activeSector === id ? null : id;
    for (const btn of sectorButtons) btn.setAttribute('aria-pressed', String(btn.sectorId === activeSector));
    emit('sector', activeSector || 'default');
  };

  const measure = () => {
    scroll.raf = 0;
    if (dead) return;
    const mid = (vh || 1) / 2;
    const thin = clamp(-fold.getBoundingClientRect().top / (mid * 0.7), 0, 1);
    if (thin !== scroll.thin) {
      scroll.thin = thin;
      docEl.style.setProperty('--thin', thin.toFixed(3));
    }
    if ((thin >= 1) !== scroll.away) {
      scroll.away = thin >= 1;
      layer.toggleAttribute('data-away', scroll.away);
      stageChrome.forEach((el) => el.toggleAttribute('inert', scroll.away));
    }
    if ((thin > 0.04) !== scroll.solid) {
      scroll.solid = thin > 0.04;
      topBar.toggleAttribute('data-solid', scroll.solid);
    }
    const storyBox = story.getBoundingClientRect();
    const specBox = specs.getBoundingClientRect();
    let index = -1;
    panels.forEach((panel, i) => {
      const box = panel.getBoundingClientRect();
      if (box.top <= mid && box.bottom > mid) index = i;
    });
    if (index < 0 && storyBox.height > 0 && storyBox.bottom <= mid) index = scroll.section; // below the story: hold the last panel
    if (boot.done) setSection(index);
    const zone = specBox.top <= mid && specBox.bottom > mid ? 'specs' : index >= 0 && storyBox.bottom > mid ? COPY.sections[index].id : thin < 1 ? 'product' : '';
    if (zone === scroll.zone) return;
    scroll.zone = zone;
    for (const link of navLinks) {
      if (link.dataset.nav === zone) link.setAttribute('aria-current', 'true');
      else link.removeAttribute('aria-current');
    }
  };
  const requestMeasure = () => {
    if (!scroll.raf && !dead) scroll.raf = raf(measure);
  };
  const onResize = () => {
    vw = view.innerWidth;
    vh = view.innerHeight;
    dpr = view.devicePixelRatio || 1;
    surveyChrome();
    requestMeasure();
  };
  const syncRailFocus = () => { // the rail scrolls only as a strip; make it keyboard-scrollable there
    if (narrow.matches) rail.tabIndex = 0;
    else rail.removeAttribute('tabindex');
  };

  // ---- Events ----
  on(wrapper, 'click', (event) => {
    const hit = (sel) => event.target.closest(sel);
    let el = hit('[data-nav]');
    if (el) {
      event.preventDefault();
      navigate(el.dataset.nav);
    } else if ((el = hit('[data-cta]'))) { // a handler that returns false keeps the page where it is
      if (emit('cta', el.dataset.cta) !== false) navigate(el.dataset.cta === 'docs' ? 'specs' : 'contact');
    } else if ((el = hit('[data-seg]'))) {
      choose(el.dataset.seg, el.dataset.value);
    } else if ((el = hit('[data-toggle]'))) {
      const name = el.dataset.toggle;
      state[name] = !state[name];
      renderToggles();
      emit(name, state[name]);
    } else if (hit('[data-land]')) {
      emit('land');
    } else if (hit('[data-auto]')) {
      if (lid.auto) stopAuto();
      else startAuto();
    } else if ((el = hit('[data-tab]'))) {
      openGroup(openName === el.dataset.tab ? null : el.dataset.tab);
    } else if (hit('[data-spot-close]')) {
      activate(null, true);
    } else if ((el = hit('[data-spot]'))) {
      activate(activeId === el.dataset.spot ? null : el.dataset.spot, true);
    } else if ((el = hit('[data-sector]'))) {
      setSector(el.dataset.sector);
    } else if (hit('[data-lang]')) {
      emit('lang', COPY.lang.next);
    } else if (hit('[data-menu]') === menuBtn) {
      setMenu(!menuOpen);
    }
  });
  on(dock, 'keydown', (event) => { // radio groups: arrows move and select, Home and End jump
    const btn = event.target.closest('[data-seg]');
    if (!btn) return;
    const list = segs[btn.dataset.seg];
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
    const j = step ? (list.indexOf(btn) + step + list.length) % list.length : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
    if (j < 0) return;
    event.preventDefault();
    choose(btn.dataset.seg, list[j].dataset.value);
    list[j].focus();
  });
  on(doc, 'keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (menuOpen) {
      setMenu(false);
      menuBtn.focus();
    } else if (activeId !== null) {
      activate(null, true);
    } else if (openName && dock.contains(doc.activeElement)) {
      const tab = groups[openName].tab;
      openGroup(null);
      tab.focus();
    } else return;
    event.preventDefault();
  });
  on(doc, 'pointerdown', (event) => { if (menuOpen && !topBar.contains(event.target)) setMenu(false); });
  on(view, 'scroll', requestMeasure, { passive: true, capture: true });
  on(view, 'resize', onResize);
  on(reduced, 'change', () => { if (reduced.matches) stopAuto(); });
  on(narrow, 'change', syncRailFocus);
  const observer = new view.ResizeObserver(surveyChrome);
  [topBar, hero, rail, dock].forEach((el) => observer.observe(el));

  // ---- Public API ----
  function setProgress(v, label) {
    if (dead || boot.done) return;
    if (Number.isFinite(Number(v))) boot.value = Math.max(boot.value, clamp(Number(v), 0, 1)); // the sweep never runs backwards
    const done = boot.value >= 1;
    const pct = Math.floor(boot.value * 100 + 1e-6);
    const stage = COPY.boot.stages.filter((item) => boot.value >= item.at).pop() || COPY.boot.stages[0];
    const text = typeof label === 'string' && label ? label : done ? COPY.boot.ready : stage.text;
    arc.style.strokeDashoffset = (RING * (1 - boot.value)).toFixed(2);
    veil.setAttribute('aria-valuenow', pct);
    veil.setAttribute('aria-valuetext', text);
    setText(veilLabel, text);
    setText(veilPct, fill(COPY.boot.percent, { pct: String(pct).padStart(2, '0') }));
    if (!done) return;
    boot.done = true;
    behindVeil.forEach((el) => el.removeAttribute('inert'));
    later(() => {
      boot.revealed = true;
      veil.toggleAttribute('data-done', true);
      for (const m of meters) if (m.to !== null) animate(m);
      later(() => { veil.hidden = true; }, FADE_MS);
    }, 200);
    requestMeasure();
  }

  function setState(next) {
    if (dead || !next || typeof next !== 'object') return;
    for (const name of Object.keys(CHOICES)) {
      if (next[name] !== state[name] && CHOICES[name].includes(next[name])) {
        state[name] = next[name];
        renderChoice(name);
        if (name === 'view') renderToggles();
      }
    }
    for (const name of TOGGLES) {
      if (next[name] != null && Boolean(next[name]) !== state[name]) {
        state[name] = Boolean(next[name]);
        renderToggles();
      }
    }
    if (Number.isFinite(next.lid)) acceptLid(next.lid);
    if (next.loading != null && Boolean(next.loading) !== state.loading) {
      const wasLoading = state.loading;
      state.loading = Boolean(next.loading);
      wrapper.toggleAttribute('data-loading', state.loading);
      dock.setAttribute('aria-busy', state.loading);
      if (wasLoading && !state.loading) setProgress(1); // the scene reports ready: never strand the veil
    }
    if (next.theme !== state.theme && (next.theme === 'light' || next.theme === 'dark')) {
      state.theme = next.theme;
      docEl.setAttribute('data-theme', next.theme);
    }
  }

  function setHotspots(list) {
    if (dead) return;
    const frame = { cx: vw / 2, near: Infinity, span: 0, labels: [], dots: [] };
    const shown = [];
    let far = -Infinity;
    let sum = 0;
    let count = 0;
    spotPass += 1;
    for (const item of Array.isArray(list) ? list : []) {
      if (!item || item.id == null) continue;
      const key = String(item.id);
      const rec = spots.get(key) || createSpot(key);
      rec.pass = spotPass;
      describeSpot(rec, item);
      rec.nx = Math.round(Number(item.x) * dpr) / dpr;
      rec.ny = Math.round(Number(item.y) * dpr) / dpr;
      rec.depth = Number.isFinite(item.depth) ? item.depth : 0;
      const finite = Number.isFinite(rec.nx) && Number.isFinite(rec.ny);
      if (finite) { sum += rec.nx; count += 1; }
      // An anchor under the chrome is hidden, unless its card is open.
      rec.want = finite && Boolean(item.visible) && (key === activeId || !hits(keepOut, dotBox(rec)));
      if (!rec.want) continue;
      shown.push(rec);
      frame.dots.push(dotBox(rec));
      frame.near = Math.min(frame.near, rec.depth);
      far = Math.max(far, rec.depth);
    }
    if (count) frame.cx = sum / count;
    if (shown.length) frame.span = far - frame.near;
    shown.sort((a, b) => (b.id === activeId) - (a.id === activeId) || a.depth - b.depth);
    for (const rec of shown) layoutSpot(rec, frame);
    for (const rec of spots.values()) if (rec.pass !== spotPass || !rec.want) showSpot(rec, false);
    if (activeId !== null) placeCard();
  }

  function setActiveHotspot(key) {
    if (!dead) activate(key == null ? null : String(key), false);
  }

  function setTelemetry(data) {
    if (dead || !data || typeof data !== 'object') return;
    let live = false;
    for (const m of meters) {
      if (!Number.isFinite(data[m.key])) continue;
      live = true;
      retarget(m, data[m.key]);
    }
    const ip = data.ipRated; // 'IP55', 55, or a boolean seal state
    if (typeof ip === 'boolean') {
      ipOverride = ip;
      renderIp();
    } else if (ip) setText(ipRating, typeof ip === 'number' ? 'IP' + ip : String(ip));
    if (live && !liveEl.hasAttribute('data-live')) {
      liveEl.toggleAttribute('data-live', true);
      liveEl.textContent = R.live;
    }
  }

  function setSpecs(list) {
    if (dead) return;
    const items = Array.isArray(list) ? list : list && Array.isArray(list.items) ? list.items : [];
    specList.replaceChildren(...items.filter(Boolean).map((item) => h('div', h('dt', item.k), h('dd.al-num', item.v, ' ', h('span.al-unit', item.unit)))));
    requestMeasure();
  }

  let toastTimer = 0;
  let toastRaf = 0;
  function toast(message) {
    if (dead || message == null || message === '') return;
    view.clearTimeout(toastTimer);
    caf(toastRaf);
    toastEl.textContent = ''; // clear first so an identical message is announced again
    toastRaf = raf(() => {
      toastEl.textContent = message;
      toastEl.toggleAttribute('data-show', true);
    });
    toastTimer = later(() => toastEl.removeAttribute('data-show'), 3800);
  }

  function dispose() {
    if (dead) return;
    dead = true;
    ac.abort();
    observer.disconnect();
    [lid.raf, lid.autoRaf, meterRaf, scroll.raf, toastRaf].forEach(caf);
    timers.forEach((id) => view.clearTimeout(id));
    docEl.style.removeProperty('--thin');
    if (state.theme !== null) {
      if (themeBefore === null) docEl.removeAttribute('data-theme');
      else docEl.setAttribute('data-theme', themeBefore);
    }
    if (styleLink) styleLink.remove();
    wrapper.remove();
  }

  // ---- First paint ----
  Object.keys(CHOICES).forEach(renderChoice);
  renderToggles();
  showLid(0);
  setSpecs(COPY.specs.items);
  syncRailFocus();
  onResize();

  return { setProgress, setState, setHotspots, setActiveHotspot, setTelemetry, setSpecs, toast, dispose };
}
