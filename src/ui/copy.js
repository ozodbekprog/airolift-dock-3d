// AiroLift D2 — every user-visible string, in one map per locale.
// chrome.js reads only COPY. To add a language, add a map with the same shape to LOCALES
// (`ru`, `uz`) and point COPY at it. `{name}` marks a value chrome.js fills in at runtime.

const en = {
  brand: {
    name: 'AiroLift',
    wordmark: 'AIROLIFT',
    model: 'D2',
    product: 'AiroLift D2',
    home: 'AiroLift, back to top',
  },

  lang: { switchLabel: 'UZ', next: 'uz', label: 'Language' },

  nav: {
    label: 'Primary',
    menu: 'Menu',
    cta: 'Request a demo',
    items: [
      { id: 'product', label: 'Product' },
      { id: 'autonomy', label: 'Autonomy' },
      { id: 'specs', label: 'Specs' },
      { id: 'deploy', label: 'Deploy' },
    ],
  },

  hero: {
    eyebrow: 'Autonomous field infrastructure',
    title: 'The dock never sleeps.',
    body: 'AiroLift D2 houses, charges and launches a survey quadcopter with nobody on site: 90 s from cold start to airborne, an 8 km radius, -20 °C to 50 °C.',
    primary: 'Book a site survey',
    secondary: 'Read the spec',
  },

  boot: {
    label: 'AiroLift D2 is starting',
    percent: '{pct}%',
    ready: 'Dock online',
    // Shown when setProgress is called without its own label. `at` is the progress threshold.
    stages: [
      { at: 0, text: 'Powering dock controller' },
      { at: 0.2, text: 'Loading airframe' },
      { at: 0.5, text: 'Calibrating RTK base' },
      { at: 0.8, text: 'Linking telemetry' },
    ],
  },

  controls: {
    label: 'Scene controls',
    view: {
      label: 'View',
      options: { hero: 'Hero', top: 'Top', macro: 'Macro', detail: 'Detail', launch: 'Launch' },
    },
    weather: {
      label: 'Weather',
      options: { clear: 'Clear', rain: 'Rain', snow: 'Snow', dust: 'Dust' },
    },
    time: {
      label: 'Time',
      options: { day: 'Day', dusk: 'Dusk', night: 'Night' },
    },
    lid: {
      label: 'Lid',
      auto: 'Auto',
      autoLabel: 'Auto, cycle the lid open and closed',
      readout: '{pct}%',
      value: '{pct} percent open',
    },
    modes: { label: 'Modes', none: 'Off', both: 'Both' },
    explode: { label: 'Explode' },
    orbit: { label: 'Orbit' },
    land: { label: 'Land' },
    hotspot: {
      group: 'Dock components',
      open: '{label}, show details',
      close: 'Close details',
    },
  },

  rail: {
    label: 'Dock telemetry',
    title: 'Telemetry',
    live: 'Live',
    standby: 'Standby',
    limit: 'Limit',
    empty: '--',
    format: { group: ',', decimal: '.', minus: '-' },
    metrics: {
      windMs: { label: 'Wind', unit: 'm/s' },
      tempC: { label: 'Temp', unit: '°C' },
      humidity: { label: 'Humidity', unit: '%' },
      batteryPct: { label: 'Battery', unit: '%' },
      missions: { label: 'Missions flown', unit: '' },
      uptimeH: { label: 'Uptime', unit: 'h' },
    },
    ip: { rating: 'IP55', sealed: 'Sealed', open: 'Lid open' },
    timeline: {
      label: '24 h',
      rain: 'Rain',
      unit: 'mm',
      scale: ['00', '06', '12', '18', '24'],
      aria: '24 hour timeline. Scene time: {time}. Rain in the last 24 hours: {rain} mm.',
    },
  },

  // Keyed by hotspot id. A label or note sent through setHotspots takes precedence; these fill the gaps.
  hotspots: {
    lid: {
      label: 'Lid drive',
      note: 'Twin linear actuators open the roof in 12 s. Rated for 50,000 cycles, with a manual release behind the service hatch.',
    },
    pad: {
      label: 'Landing pad',
      note: 'Heated deck with fiducial markers. Clears ice at -20 °C and centres the airframe on the charge contacts.',
    },
    drone: {
      label: 'Survey airframe',
      note: 'Fold-arm quadcopter with wide, tele and thermal payload. 8 km operating radius with return reserve.',
    },
    charger: {
      label: 'Charge contacts',
      note: 'Spring-loaded contacts take the pack from 20 % to 90 % in 32 min. No battery swap, no connectors to seat.',
    },
    climate: {
      label: 'Climate control',
      note: 'Heating and cooling hold the bay inside battery limits from -20 °C to 50 °C ambient.',
    },
    weather: {
      label: 'Weather station',
      note: 'Wind, rain, temperature and humidity sampled at 1 Hz. Every launch is gated against the flight envelope.',
    },
    rtk: {
      label: 'RTK base',
      note: 'Dual-band GNSS base. Centimetre positioning for repeatable flight lines and precision landing.',
    },
    camera: {
      label: 'Pad camera',
      note: 'Wide-angle view of the pad and approach. Footage is logged with every launch and recovery.',
    },
    power: {
      label: 'Backup power',
      note: 'Internal battery keeps the dock online for 5 h after mains loss, long enough to recover the aircraft and report.',
    },
    link: {
      label: 'Data link',
      note: 'Ethernet and LTE with automatic failover. Command and video are encrypted with AES-256.',
    },
  },

  sections: [
    {
      id: 'muammolar',
      kicker: 'Problems',
      title: 'Manual inspection is slow, expensive and dangerous.',
      bullets: [
        'One crew covers a few hectares a day, and only in daylight.',
        'Night shifts, rain and dust stop the work outright.',
        'Every climb, roof and line puts a person at risk.',
      ],
      sectors: {
        label: 'Sectors that feel it first',
        items: [
          { id: 'solar', label: 'Solar farms', note: 'Hundreds of hectares; a thermal fault is found months late.', stat: '10,000 panels' },
          { id: 'warehouse', label: 'Warehouses', note: 'Racking and roof checks wait for a lift and a person.', stat: '24/7' },
          { id: 'perimeter', label: 'Perimeter security', note: 'A guard walks every two hours; the rest is a blind spot.', stat: '8 km radius' },
          { id: 'plant', label: 'Industrial plant', note: 'Stack and flare inspection stops production.', stat: '0 climbs' },
        ],
      },
    },
    {
      id: 'deploy',
      kicker: 'Deploy',
      title: 'Bolted down and flying in one shift.',
      bullets: [
        'Four anchor bolts, one mains feed, one data link.',
        'Commissioned by two technicians in under four hours.',
        'IP55 enclosure, rated −20 °C to 50 °C.',
      ],
    },
    {
      id: 'autonomy',
      kicker: 'Autonomy',
      title: 'Launch, survey, recover. Nobody on site.',
      bullets: [
        '90 s from cold start to airborne.',
        'Every launch gated on wind, rain and icing at the dock.',
        '8 km operating radius with RTK precision landing.',
      ],
    },
    {
      id: 'ops',
      kicker: 'Ops',
      title: 'Serviced on a schedule, not on a callout.',
      bullets: [
        '100 missions between services.',
        'MTBF 10,000 h on lid drive and charge contacts.',
        'Flight logs and dock health export to SCADA and GIS.',
      ],
    },
  ],

  specs: {
    title: 'Specification',
    note: 'Rated values for the production unit. Flight figures assume sea level, 25 °C and wind below 5 m/s.',
    // Default rows for setSpecs: k = label, v = value, unit = unit.
    items: [
      { k: 'Operating temperature', v: '-20 to 50', unit: '°C' },
      { k: 'Ingress protection', v: 'IP55', unit: '' },
      { k: 'Cold start to airborne', v: '90', unit: 's' },
      { k: 'Operating radius', v: '8', unit: 'km' },
      { k: 'Service interval', v: '100', unit: 'missions' },
      { k: 'MTBF, dock mechanics', v: '10,000', unit: 'h' },
      { k: 'Wind limit, launch and recovery', v: '12', unit: 'm/s' },
      { k: 'Recharge, 20 % to 90 %', v: '32', unit: 'min' },
      { k: 'Backup power', v: '5', unit: 'h' },
      { k: 'Positioning', v: 'RTK, 1 cm + 1 ppm', unit: '' },
      { k: 'Mains input', v: '100 to 240', unit: 'V AC' },
      { k: 'Mass without aircraft', v: '54', unit: 'kg' },
    ],
  },

  footer: {
    tagline: 'Autonomous drone docks for pipeline, mining and public-safety operators.',
    contactTitle: 'Contact',
    contacts: [
      { label: 'Sales', value: 'sales@airolift.example', href: 'mailto:sales@airolift.example' },
      { label: 'Site surveys', value: 'survey@airolift.example', href: 'mailto:survey@airolift.example' },
      { label: 'Support, 24/7', value: 'support@airolift.example', href: 'mailto:support@airolift.example' },
    ],
    legal: '© 2026 Xoshimov Group · Ozodbek Xoshimov Xusanovich',
  },
};

const uz = {
  brand: {
    name: 'AiroLift',
    wordmark: 'AIROLIFT',
    model: 'D2',
    product: 'AiroLift D2',
    home: 'AiroLift, boshiga qaytish',
  },

  lang: { switchLabel: 'EN', next: 'en', label: 'Til' },

  nav: {
    label: 'Asosiy',
    menu: 'Menyu',
    cta: 'Demo so‘rash',
    items: [
      { id: 'product', label: 'Mahsulot' },
      { id: 'autonomy', label: 'Avtonomiya' },
      { id: 'specs', label: 'Texnik ma’lumot' },
      { id: 'deploy', label: 'O‘rnatish' },
    ],
  },

  hero: {
    eyebrow: 'Avtonom dala infratuzilmasi',
    title: 'Dok hech qachon uxlamaydi.',
    body: 'AiroLift D2 geodezik kvadrokopterni o‘zi saqlaydi, quvvatlaydi va uchiradi: sovuqdan 90 soniyada havoda, 8 km radius, −20 °C dan 50 °C gacha.',
    primary: 'Dala ko‘rigini band qilish',
    secondary: 'Texnik varaqni o‘qish',
  },

  boot: {
    label: 'AiroLift D2 ishga tushmoqda',
    percent: '{pct}%',
    ready: 'Dok tarmoqda',
    stages: [
      { at: 0, text: 'Dok kontrolleri quvvatlanmoqda' },
      { at: 0.2, text: 'Apparat yuklanmoqda' },
      { at: 0.5, text: 'RTK baza sozlanmoqda' },
      { at: 0.8, text: 'Telemetriya ulanmoqda' },
    ],
  },

  controls: {
    label: 'Sahna boshqaruvi',
    view: {
      label: 'Ko‘rinish',
      options: { hero: 'Asosiy', top: 'Ustdan', macro: 'Makro', detail: 'Detal', launch: 'Uchirish' },
    },
    weather: {
      label: 'Ob-havo',
      options: { clear: 'Ochiq', rain: 'Yomg‘ir', snow: 'Qor', dust: 'Chang' },
    },
    time: {
      label: 'Vaqt',
      options: { day: 'Kunduz', dusk: 'Oqshom', night: 'Tun' },
    },
    lid: {
      label: 'Qopqoq',
      auto: 'Avto',
      autoLabel: 'Avto, qopqoqni ochib-yopadi',
      readout: '{pct}%',
      value: '{pct} foiz ochiq',
    },
    modes: { label: 'Rejimlar', none: 'O‘chiq', both: 'Ikkisi' },
    explode: { label: 'Yoyish' },
    orbit: { label: 'Aylanish' },
    land: { label: 'Posadka' },
    hotspot: {
      group: 'Dok qismlari',
      open: '{label}, tafsilotlarni ko‘rsatish',
      close: 'Tafsilotlarni yopish',
    },
  },

  rail: {
    label: 'Dok telemetriyasi',
    title: 'Telemetriya',
    live: 'Jonli',
    standby: 'Kutish',
    limit: 'Chegara',
    empty: '--',
    format: { group: ' ', decimal: ',', minus: '−' },
    metrics: {
      windMs: { label: 'Shamol', unit: 'm/s' },
      tempC: { label: 'Harorat', unit: '°C' },
      humidity: { label: 'Namlik', unit: '%' },
      batteryPct: { label: 'Batareya', unit: '%' },
      missions: { label: 'Missiyalar', unit: '' },
      uptimeH: { label: 'Ish vaqti', unit: 'h' },
    },
    ip: { rating: 'IP55', sealed: 'Yopiq', open: 'Qopqoq ochiq' },
    timeline: {
      label: '24 soat',
      rain: 'Yomg‘ir',
      unit: 'mm',
      scale: ['00', '06', '12', '18', '24'],
      aria: '24 soatlik shkala. Sahna vaqti: {time}. Oxirgi 24 soatda yomg‘ir: {rain} mm.',
    },
  },

  hotspots: {
    lid: {
      label: 'Qopqoq yuritmasi',
      note: 'Ikki chiziqli aktuator tomni 12 soniyada ochadi. 50 000 siklga mo‘ljallangan, servis lyukida qo‘lda ochish tugmasi bor.',
    },
    pad: {
      label: 'Qo‘nish maydoni',
      note: 'Isitiladigan platforma va fiducial belgilar. −20 °C da muzni eritadi va apparatni kontaktlarga o‘zi markazlaydi.',
    },
    drone: {
      label: 'Geodezik apparat',
      note: 'Yig‘iladigan kvadrokopter: keng burchak, tele va termal kamera. 8 km radius, qaytish zaxirasi bilan.',
    },
    charger: {
      label: 'Quvvat kontaktlari',
      note: 'Prujinali kontaktlar batareyani 20 % dan 90 % gacha 32 daqiqada to‘ldiradi. Batareya almashtirish yo‘q.',
    },
    climate: {
      label: 'Iqlim nazorati',
      note: 'Isitish va sovutish batareyani −20 °C dan 50 °C gacha muhitda ishchi haroratda ushlaydi.',
    },
    weather: {
      label: 'Ob-havo stansiyasi',
      note: 'Shamol, yomg‘ir, harorat va namlik 1 Hz da o‘lchanadi. Har bir uchish parvoz konverti bo‘yicha tekshiriladi.',
    },
    rtk: {
      label: 'RTK baza',
      note: 'Ikki diapazonli GNSS baza. Takrorlanadigan marshrut va aniq qo‘nish uchun santimetr aniqlik.',
    },
    camera: {
      label: 'Platforma kamerasi',
      note: 'Maydon va yondashuvni kuzatadi. Har bir uchish va qo‘nish yozib olinadi.',
    },
    power: {
      label: 'Zaxira quvvat',
      note: 'Ichki batareya tarmoq uzilganda dokni 5 soat ishlatadi — apparatni qaytarish va hisobot uchun yetarli.',
    },
    link: {
      label: 'Ma’lumot kanali',
      note: 'Ethernet va LTE avtomatik zaxira bilan. Buyruq va video AES-256 bilan shifrlangan.',
    },
  },

  sections: [
    {
      id: 'muammolar',
      kicker: 'Muammolar',
      title: 'Qo‘lda tekshiruv — sekin, qimmat va xavfli.',
      bullets: [
        'Bitta brigada kuniga bir necha gektarni ko‘radi, faqat kunduzi.',
        'Tungi smena, yomg‘ir va chang ishni butunlay to‘xtatadi.',
        'Har bir chiqish, tom va liniya — xavf ostidagi odam.',
      ],
      sectors: {
        label: 'Og‘riq eng ko‘p seziladigan joylar',
        items: [
          { id: 'solar', label: 'Quyosh fermalari', note: 'Yuzlab gektar; termik nuqson oylar o‘tib topiladi.', stat: '10 000 panel' },
          { id: 'warehouse', label: 'Omborlar', note: 'Rak va tom tekshiruvi lift va odamga bog‘liq.', stat: '24/7' },
          { id: 'perimeter', label: 'Perimetr xavfsizligi', note: 'Qo‘riqchi har 2 soatda aylanadi, qolgani ko‘r zona.', stat: '8 km radius' },
          { id: 'plant', label: 'Sanoat inspeksiyasi', note: 'Mo‘ri va faktel tekshiruvi ishlab chiqarishni to‘xtatadi.', stat: '0 marta chiqish' },
        ],
      },
    },
    {
      id: 'deploy',
      kicker: 'O‘rnatish',
      title: 'Bir smenada o‘rnatiladi va uchadi.',
      bullets: [
        'To‘rtta ankraj bolt, bitta quvvat liniyasi, bitta ma’lumot kanali.',
        'Ikki texnik to‘rt soatda ishga tushiradi.',
        'IP55 korpus, −20 °C dan 50 °C gacha.',
      ],
    },
    {
      id: 'autonomy',
      kicker: 'Avtonomiya',
      title: 'Uchirish, tekshirish, qaytarish. Saytda odam yo‘q.',
      bullets: [
        'Sovuqdan 90 soniyada havoda.',
        'Har bir uchish shamol, yomg‘ir va muzlash bo‘yicha tekshiriladi.',
        '8 km radius, RTK bilan aniq qo‘nish.',
      ],
    },
    {
      id: 'ops',
      kicker: 'Xizmat',
      title: 'Reja bo‘yicha xizmat, chaqiruv bo‘yicha emas.',
      bullets: [
        'Har 100 missiyada bitta servis.',
        'Qopqoq yuritmasi va kontaktlar uchun MTBF 10 000 soat.',
        'Parvoz jurnallari SCADA va GIS ga eksport qilinadi.',
      ],
    },
  ],

  specs: {
    title: 'Texnik xususiyatlar',
    note: 'Ishlab chiqarilgan birlik uchun nominal qiymatlar. Parvoz ko‘rsatkichlari dengiz sathida, 25 °C va 5 m/s dan past shamolda.',
    items: [
      { k: 'Ish harorati', v: '−20 … 50', unit: '°C' },
      { k: 'Himoya darajasi', v: 'IP55', unit: '' },
      { k: 'Sovuqdan havoga', v: '90', unit: 's' },
      { k: 'Ish radiusi', v: '8', unit: 'km' },
      { k: 'Servis oralig‘i', v: '100', unit: 'missiya' },
      { k: 'Mexanika MTBF', v: '10 000', unit: 'h' },
      { k: 'Shamol chegarasi', v: '12', unit: 'm/s' },
      { k: 'Quvvatlash, 20–90 %', v: '32', unit: 'daq' },
      { k: 'Zaxira quvvat', v: '5', unit: 'h' },
      { k: 'Joylashuv', v: 'RTK, 1 sm + 1 ppm', unit: '' },
      { k: 'Tarmoq kirishi', v: '100 … 240', unit: 'V AC' },
      { k: 'Massa, apparatsiz', v: '54', unit: 'kg' },
    ],
  },

  footer: {
    tagline: 'Quvur, kon va xavfsizlik operatorlari uchun avtonom dron doklari.',
    contactTitle: 'Aloqa',
    contacts: [
      { label: 'Sotuv', value: 'sales@airolift.example', href: 'mailto:sales@airolift.example' },
      { label: 'Dala ko‘rigi', value: 'survey@airolift.example', href: 'mailto:survey@airolift.example' },
      { label: 'Qo‘llab-quvvatlash, 24/7', value: 'support@airolift.example', href: 'mailto:support@airolift.example' },
    ],
    legal: '© 2026 Xoshimov Group · Ozodbek Xoshimov Xusanovich',
  },
};

export const LOCALES = { uz, en };

const stored = typeof localStorage !== 'undefined' ? localStorage.getItem('al-lang') : null;
const fromUrl = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('lang') : null;

export const LANG = LOCALES[fromUrl] ? fromUrl : LOCALES[stored] ? stored : 'uz';

export const COPY = LOCALES[LANG];

