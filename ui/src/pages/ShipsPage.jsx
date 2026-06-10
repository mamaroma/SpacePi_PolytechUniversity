import React, { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, AttributionControl, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Hint, { GuideBanner } from "../components/Hint";
import { fetchTeleaisAisPoints } from "../api";

/* Палитра типов судов в соответствии с фиолетово-оранжевой темой проекта. */
const SHIP_TYPES = {
  cargo:     { color: "#f39768", label: "Грузовое" },
  tanker:    { color: "#da4927", label: "Танкер" },
  passenger: { color: "#724796", label: "Пассажирское" },
  fishing:   { color: "#8a5ab0", label: "Рыболовецкое" },
  tug:       { color: "#6cc77b", label: "Буксир" },
  military:  { color: "#a52f1a", label: "Военный" },
  sailing:   { color: "#cbb98c", label: "Парусное" },
  other:     { color: "#9460b8", label: "Прочее" },
};
const SHIP_TYPE_LIST = Object.keys(SHIP_TYPES);

function makeShipIcon(type, course = 0, isLarge = false) {
  const color = SHIP_TYPES[type]?.color || "#9460b8";
  const size = isLarge ? 18 : 14;
  return L.divIcon({
    html: `<div style="transform:rotate(${Math.round(course)}deg);filter:drop-shadow(0 0 4px ${color});line-height:1;text-align:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 20h16L12 2z" stroke="#0d0a18" stroke-width="0.7"/>
      </svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

/** Детерминированный псевдо-генератор. */
function seededRng(seed) {
  let s = (seed | 0) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Генерация большого количества псевдо-судов в "горячих" зонах вокруг
 *  России, СНГ, Северной Европы, Китая, Юго-Восточной Азии и Арктики. */
function buildShipFleet() {
  // Зоны: [centerLat, centerLon, radiusDeg, density, biasTypes]
  // density — относительный вес, влияет на количество кораблей в зоне.
  // Особый фокус — РФ и СНГ: расширенный набор морей и речных артерий.
  const ZONES = [
    // ── РФ / СНГ — Балтика ─────────────────────────────────────────
    { name: "Балтика — СПб",         lat: 60.0, lon: 28.5,  rLat: 1.6, rLon: 4.2,  density: 48, types: ["cargo","tanker","passenger","tug","fishing"] },
    { name: "Финский залив",         lat: 59.7, lon: 25.0,  rLat: 1.0, rLon: 5.0,  density: 36, types: ["cargo","tanker","passenger"] },
    { name: "Балтика — центр",       lat: 56.5, lon: 18.0,  rLat: 2.0, rLon: 5.0,  density: 32, types: ["cargo","passenger","tanker"] },
    { name: "Калининград — Балтийск", lat: 54.7, lon: 19.9, rLat: 0.7, rLon: 1.5,  density: 22, types: ["cargo","tanker","military","tug","passenger"] },
    { name: "Ладожское озеро",       lat: 60.8, lon: 31.5,  rLat: 1.4, rLon: 1.5,  density: 16, types: ["cargo","passenger","fishing","tug"] },
    { name: "Онежское озеро",        lat: 61.7, lon: 35.6,  rLat: 1.5, rLon: 1.0,  density: 14, types: ["cargo","fishing","passenger"] },
    { name: "Беломорско-Балтийский канал", lat: 64.7, lon: 34.9, rLat: 1.8, rLon: 0.7, density: 10, types: ["cargo","tug","tanker"] },

    // ── РФ — Север ─────────────────────────────────────────────────
    { name: "Баренцево / Мурманск",  lat: 69.5, lon: 35.0,  rLat: 3.0, rLon: 9.0,  density: 30, types: ["cargo","tanker","military","fishing"] },
    { name: "Архангельск — Белое",   lat: 64.6, lon: 40.5,  rLat: 1.6, rLon: 3.5,  density: 22, types: ["cargo","tanker","fishing","tug"] },
    { name: "Новая Земля — Печора",  lat: 70.0, lon: 53.0,  rLat: 2.5, rLon: 6.0,  density: 14, types: ["tanker","cargo","military"] },

    // ── РФ — Северный морской путь ────────────────────────────────
    { name: "СМП — Карское",         lat: 73.0, lon: 65.0,  rLat: 3.0, rLon: 12.0, density: 18, types: ["cargo","tanker","fishing"] },
    { name: "СМП — Лаптевых",        lat: 75.5, lon: 125.0, rLat: 2.5, rLon: 14.0, density: 14, types: ["cargo","tanker"] },
    { name: "Восточно-Сибирское",    lat: 73.5, lon: 160.0, rLat: 2.5, rLon: 14.0, density: 12, types: ["cargo","tanker","fishing"] },
    { name: "Чукотское / Берингово", lat: 64.0, lon: 178.0, rLat: 3.0, rLon: 10.0, density: 14, types: ["cargo","fishing","tanker"] },

    // ── РФ — Чёрное / Азовское ────────────────────────────────────
    { name: "Чёрное море",           lat: 43.5, lon: 35.0,  rLat: 2.5, rLon: 5.0,  density: 38, types: ["cargo","tanker","passenger","military"] },
    { name: "Новороссийск",          lat: 44.7, lon: 37.7,  rLat: 0.7, rLon: 1.2,  density: 22, types: ["tanker","cargo","tug","military"] },
    { name: "Севастополь",           lat: 44.6, lon: 33.5,  rLat: 0.8, rLon: 1.4,  density: 22, types: ["military","cargo","tug","passenger"] },
    { name: "Сочи / Туапсе",         lat: 43.9, lon: 39.4,  rLat: 0.7, rLon: 1.0,  density: 16, types: ["passenger","cargo","tug","tanker"] },
    { name: "Азовское море",         lat: 46.0, lon: 36.5,  rLat: 1.5, rLon: 2.0,  density: 22, types: ["cargo","fishing","tug","tanker"] },
    { name: "Керченский пролив",     lat: 45.2, lon: 36.5,  rLat: 0.5, rLon: 0.8,  density: 16, types: ["cargo","tanker","tug"] },

    // ── СНГ — Каспий ───────────────────────────────────────────────
    { name: "Каспий — Север",        lat: 45.5, lon: 49.5,  rLat: 2.0, rLon: 2.5,  density: 18, types: ["tanker","cargo","fishing"] },
    { name: "Каспий — Центр",        lat: 41.5, lon: 50.5,  rLat: 4.5, rLon: 2.5,  density: 18, types: ["cargo","tanker","fishing"] },
    { name: "Махачкала",             lat: 43.0, lon: 47.5,  rLat: 0.6, rLon: 1.0,  density: 12, types: ["cargo","tanker","tug"] },
    { name: "Баку",                  lat: 40.4, lon: 50.0,  rLat: 0.5, rLon: 1.2,  density: 14, types: ["tanker","cargo","fishing"] },
    { name: "Туркменбаши",           lat: 40.0, lon: 53.0,  rLat: 0.7, rLon: 1.2,  density: 12, types: ["tanker","cargo","fishing"] },

    // ── РФ — Волга / Дон / Кама ───────────────────────────────────
    { name: "Волга — Астрахань",     lat: 46.4, lon: 48.0,  rLat: 1.5, rLon: 1.5,  density: 18, types: ["cargo","tanker","fishing","tug"] },
    { name: "Волга — Волгоград",     lat: 48.7, lon: 44.5,  rLat: 1.4, rLon: 1.0,  density: 14, types: ["cargo","tanker","passenger","tug"] },
    { name: "Волга — Самара",        lat: 53.2, lon: 50.1,  rLat: 1.2, rLon: 1.0,  density: 12, types: ["cargo","passenger","tug"] },
    { name: "Волга — Нижний Новг.",  lat: 56.3, lon: 44.0,  rLat: 1.2, rLon: 1.0,  density: 12, types: ["cargo","passenger","tug"] },
    { name: "Волго-Балт — Рыбинск",  lat: 58.0, lon: 38.8,  rLat: 1.6, rLon: 1.2,  density: 12, types: ["cargo","tug","passenger"] },
    { name: "Дон — Ростов",          lat: 47.2, lon: 39.6,  rLat: 0.7, rLon: 1.6,  density: 14, types: ["cargo","tanker","tug"] },

    // ── РФ — Дальний Восток ───────────────────────────────────────
    { name: "Японское море",         lat: 41.0, lon: 134.0, rLat: 4.5, rLon: 6.0,  density: 30, types: ["cargo","tanker","fishing","passenger"] },
    { name: "Владивосток",           lat: 43.0, lon: 132.0, rLat: 1.5, rLon: 2.5,  density: 26, types: ["cargo","tanker","military","tug"] },
    { name: "Находка",               lat: 42.8, lon: 132.9, rLat: 0.6, rLon: 1.0,  density: 16, types: ["tanker","cargo","tug"] },
    { name: "Сахалин — Корсаков",    lat: 46.6, lon: 142.8, rLat: 1.5, rLon: 2.0,  density: 18, types: ["cargo","tanker","passenger","fishing"] },
    { name: "Татарский пролив",      lat: 50.0, lon: 142.0, rLat: 3.0, rLon: 2.5,  density: 14, types: ["cargo","tanker","fishing"] },
    { name: "Камчатка — Авача",      lat: 53.0, lon: 158.6, rLat: 1.5, rLon: 2.5,  density: 18, types: ["fishing","cargo","military","passenger"] },
    { name: "Магадан",               lat: 59.6, lon: 150.8, rLat: 1.6, rLon: 4.0,  density: 14, types: ["cargo","tanker","fishing"] },

    // ── СНГ — Чёрное море (Украина, Грузия, Молдова Дунай) ────────
    { name: "Одесса",                lat: 46.4, lon: 30.7,  rLat: 0.8, rLon: 1.4,  density: 18, types: ["cargo","tanker","passenger","tug"] },
    { name: "Поти / Батуми",         lat: 42.0, lon: 41.5,  rLat: 0.6, rLon: 1.2,  density: 14, types: ["cargo","tanker","passenger"] },

    // ── ЕС соседи ─────────────────────────────────────────────────
    { name: "Босфор",                lat: 41.05, lon: 29.0, rLat: 0.6, rLon: 0.8,  density: 24, types: ["cargo","tanker","passenger"] },
    { name: "Северное море",         lat: 56.0, lon: 4.5,   rLat: 4.0, rLon: 4.5,  density: 24, types: ["cargo","tanker","fishing"] },

    // ── Азия (для масштаба) ───────────────────────────────────────
    { name: "Жёлтое море",           lat: 36.5, lon: 122.5, rLat: 3.0, rLon: 4.0,  density: 36, types: ["cargo","tanker","fishing"] },
    { name: "Шанхай",                lat: 31.0, lon: 122.5, rLat: 2.0, rLon: 3.0,  density: 38, types: ["cargo","tanker","passenger"] },
    { name: "Южный Китай",           lat: 23.0, lon: 116.0, rLat: 4.0, rLon: 5.5,  density: 32, types: ["cargo","tanker","fishing"] },
    { name: "Тайваньский пролив",    lat: 24.5, lon: 119.5, rLat: 2.5, rLon: 2.0,  density: 24, types: ["cargo","tanker","fishing"] },
    { name: "Гонконг — устье",       lat: 22.4, lon: 114.0, rLat: 1.0, rLon: 1.5,  density: 26, types: ["cargo","passenger","tug"] },
    { name: "Малаккский пролив",     lat:  3.0, lon: 101.5, rLat: 2.0, rLon: 4.0,  density: 30, types: ["cargo","tanker"] },
    { name: "Сингапур",              lat:  1.3, lon: 103.9, rLat: 0.6, rLon: 1.0,  density: 24, types: ["cargo","tanker","passenger"] },
  ];

  const NAMES = [
    "NORDIC STAR","ATLANTIC SPIRIT","PACIFIC VOYAGER","OCEAN BREEZE","SEA GUARDIAN",
    "LIBERTY WAVE","EMERALD QUEEN","CORAL DREAM","GOLDEN HARVEST","SILVER MOON",
    "CAPE RUNNER","ATLAS PIONEER","DRAGON PEARL","NEVA TRADER","BALTIC FERRY",
    "KRONSTADT TUG","PETERHOF FISHER","LADOGA TANKER","AURORA SAILING","VYBORG TRADER",
    "BALTIYSK PATROL","MURMANSK ICE","ARCTIC PATROL","YAMAL LNG","SOCHI SUNRISE",
    "NOVOROSSIYSK OIL","ISTANBUL FERRY","GENOVA CARGO","PALERMO TANKER","PIRAEUS TRADER",
    "ZHEJIANG STAR","FUJIAN PEARL","SHANGHAI GIANT","HONG KONG FERRY","SINGAPORE PASSAGE",
    "MALACCA RUNNER","TOKYO BAY EXPRESS","OSAKA TRADER","BUSAN STAR","VLADIVOSTOK TUG",
    "HAMBURG EXPRESS","STOCKHOLM LINK","HELSINKI CARGO","COPENHAGEN BREEZE","OSLO PRIDE",
  ];
  const CENTRY_PREFIX = ["NORD","BALT","ARCT","NEVA","DON","VOLGA","KAMA","OB","LENA","ENISEY","AMUR","HAN","WU","XI","YAN","FENG","SHAN","DA","HEI","LONG","JIN"];
  const CENTRY_SUFFIX = ["TRADER","STAR","PEARL","HARVEST","PATROL","CARGO","TANKER","BREEZE","RUNNER","VOYAGER","WAVE","SPIRIT","TUG","DREAM"];

  const MMSI_BASES = {
    russia: 273000000,
    china:  412800000,
    eu:     211000000,
    finland: 230000000,
    estonia: 276000000,
    denmark: 219000000,
    japan: 431000000,
    korea: 440000000,
    germany: 211400000,
    norway: 257000000,
  };

  const ships = [];
  let id = 1;

  for (const z of ZONES) {
    const rng = seededRng(z.lat * 91 + z.lon * 13);
    for (let i = 0; i < z.density; i++) {
      // равномерно по эллипсу зоны
      const lat = z.lat + (rng() - 0.5) * 2 * z.rLat;
      const lon = z.lon + (rng() - 0.5) * 2 * z.rLon;
      const type = z.types[Math.floor(rng() * z.types.length)];
      // имя: смесь либо готовое, либо префикс+суффикс
      const name = rng() < 0.55
        ? NAMES[Math.floor(rng() * NAMES.length)]
        : `${CENTRY_PREFIX[Math.floor(rng() * CENTRY_PREFIX.length)]} ${CENTRY_SUFFIX[Math.floor(rng() * CENTRY_SUFFIX.length)]}`;
      // курс: вдоль зоны (главная ось)
      const courseBase = z.rLon > z.rLat ? 90 : 0;
      const course = (courseBase + (rng() - 0.5) * 60 + 360) % 360;
      const speed = +(8 + rng() * 14).toFixed(1);
      const baseMmsi = Object.values(MMSI_BASES)[Math.floor(rng() * Object.values(MMSI_BASES).length)];
      const mmsi = baseMmsi + Math.floor(rng() * 999000) + 1;
      ships.push({
        id: id++, mmsi, name, type, lat, lon, course, speed,
        // Запоминаем bounding-box зоны и центр — нужно, чтобы при перемотке
        // времени корабль не «выкатывался» из своей акватории на сушу.
        zone: z.name,
        zoneLat: z.lat, zoneLon: z.lon,
        zoneRLat: z.rLat, zoneRLon: z.rLon,
      });
    }
  }
  return ships;
}

/** Имитация AIS Class A position-report. */
function buildAisPacket(ship, ts, rng) {
  const navStatuses = ["under-way", "at-anchor", "moored", "fishing", "constrained-by-draught"];
  const navStatus = navStatuses[Math.floor(rng() * navStatuses.length)];
  return {
    msgType: 1 + Math.floor(rng() * 3),
    mmsi: ship.mmsi,
    navStatus,
    rotDegPerMin: +((rng() - 0.5) * 6).toFixed(1),
    sogKn: +(ship.speed + (rng() - 0.5) * 0.6).toFixed(1),
    cogDeg: +ship.course.toFixed(1),
    headingDeg: Math.round((ship.course + (rng() - 0.5) * 8 + 360) % 360),
    lat: +ship.lat.toFixed(5),
    lon: +ship.lon.toFixed(5),
    receivedAt: new Date(ts).toISOString(),
    rssi_dbm: -(78 + Math.floor(rng() * 22)),
    snr_db: +(2 + rng() * 10).toFixed(1),
  };
}

/** Сдвинуть корабль вперёд по курсу за `minutes` минут.
 *
 *  Линейная экстраполяция позиции, но с двумя ограничителями:
 *    1) демо-демпфер — слайдер показывает «архивные данные», судно может
 *       только колыхаться вокруг своей реальной позиции, а не уплывать на
 *       сотни морских миль.
 *    2) clamp в bounding-box зоны (lat ± rLat, lon ± rLon) — корабль не
 *       выскакивает из своей акватории на сушу, даже если слайдер
 *       прокручен на максимум.
 */
function advance(ship, minutes) {
  // Демпфирующий коэффициент: на полном размахе бегунка (-360 мин) корабль
  // смещается всего на ~3% от своего часового пути. Этого хватает, чтобы
  // визуально «дышала» сцена, но судно не уплывало на сушу.
  const dampened = (ship.speed * minutes * 0.03) / 60;
  const courseRad = (ship.course * Math.PI) / 180;
  const dLat = (dampened / 60) * Math.cos(courseRad);
  const dLon =
    (dampened / 60) * Math.sin(courseRad) /
    Math.max(0.05, Math.cos((ship.lat * Math.PI) / 180));

  let lat = ship.lat + dLat;
  let lon = ship.lon + dLon;

  // Clamp к bounding-box зоны (если он задан) — судно остаётся в акватории.
  if (ship.zoneLat != null) {
    const minLat = ship.zoneLat - ship.zoneRLat;
    const maxLat = ship.zoneLat + ship.zoneRLat;
    const minLon = ship.zoneLon - ship.zoneRLon;
    const maxLon = ship.zoneLon + ship.zoneRLon;
    lat = Math.max(minLat, Math.min(maxLat, lat));
    lon = Math.max(minLon, Math.min(maxLon, lon));
  }

  return { lat, lon };
}

const FLEET = buildShipFleet();

/* ─── Главный компонент: переключатель табов ─────────────────────────────── */
export default function ShipsPage() {
  const [tab, setTab] = useState("demo"); // "demo" | "sat"
  return (
    <div className="app-body">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">AIS · корабли</h1>
          <p className="page-subtitle">
            Демо-карта со сгенерированным трафиком и реальные данные, полученные со спутников.
          </p>
        </div>
      </div>

      <div className="ctrl-row" style={{ marginBottom: 14, gap: 8 }}>
        <button
          className={`btn btn-tab ${tab === "demo" ? "active" : ""}`}
          onClick={() => setTab("demo")}
        >
          Демо-карта
        </button>
        <button
          className={`btn btn-tab ${tab === "sat" ? "active" : ""}`}
          onClick={() => setTab("sat")}
        >
          Данные со спутников
        </button>
      </div>

      {tab === "demo" ? <DemoMapTab /> : <SatDataMapTab />}
    </div>
  );
}

/* ─── Таб «Демо-карта» — то, что было раньше на странице ─────────────────── */
function DemoMapTab() {
  const [visibleTypes, setVisibleTypes] = useState(new Set(SHIP_TYPE_LIST));
  const [tOffsetMin, setTOffsetMin] = useState(0);  // -360..0..+0 (минуты от "сейчас")
  const [playing, setPlaying] = useState(false);
  const playRef = useRef();

  // Авто-проигрывание времени
  useEffect(() => {
    if (!playing) return;
    playRef.current = setInterval(() => {
      setTOffsetMin((t) => (t >= 0 ? -360 : t + 5));
    }, 220);
    return () => clearInterval(playRef.current);
  }, [playing]);

  const toggleType = (t) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const baseTs = useMemo(() => Date.now() + tOffsetMin * 60 * 1000, [tOffsetMin]);

  // Считаем позиции на момент tOffsetMin (от текущего «момента съёмки»)
  const ships = useMemo(() => {
    return FLEET.filter((s) => visibleTypes.has(s.type)).map((s) => {
      const adv = advance(s, tOffsetMin);
      const rng = seededRng(s.mmsi + Math.floor(baseTs / 60000));
      const moved = { ...s, lat: adv.lat, lon: adv.lon };
      moved.lastPacket = buildAisPacket(moved, baseTs, rng);
      return moved;
    });
  }, [visibleTypes, tOffsetMin, baseTs]);

  const fmtTimeLabel = () => {
    const d = new Date(baseTs);
    const pad = (n) => String(n).padStart(2, "0");
    const ago = Math.abs(tOffsetMin);
    const tag = tOffsetMin === 0 ? "сейчас" : `−${ago} мин назад`;
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth()+1)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC · ${tag}`;
  };

  return (
    <>
      <GuideBanner id="ais-intro">
        <strong>Демо-карта AIS.</strong> Здесь показаны{" "}
        <em>сгенерированные</em> суда в зонах активного судоходства (Россия, СНГ,
        Китай, ЮВА). Это <b>учебная модель</b> — для работы с реальными
        приёмами с орбиты переключитесь на вкладку «Данные со спутников».
      </GuideBanner>

      <div className="controls-card">
        <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
          <span className="ctrl-label" style={{ marginRight: 8 }}>Типы судов</span>
          <Hint text="Снимайте галочки, чтобы скрыть с карты лишние типы (танкеры, военные и т.д.)." />
          {SHIP_TYPE_LIST.map((t) => (
            <label key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginRight: 12, userSelect: "none" }}>
              <input
                type="checkbox"
                checked={visibleTypes.has(t)}
                onChange={() => toggleType(t)}
                style={{ accentColor: SHIP_TYPES[t].color }}
              />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: SHIP_TYPES[t].color, display: "inline-block" }} />
              {SHIP_TYPES[t].label}
            </label>
          ))}
          <div className="ctrl-spacer" />
          <span className="card-meta">{ships.length} судов · АИС-демо · архивные данные</span>
        </div>

        {/* Time-scrubber */}
        <div className="ctrl-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span className="ctrl-label">Время</span>
          <Hint text="Перетащите бегунок, чтобы сдвинуть карту во времени. Каждый шаг = 5 минут. Кнопка ▶ запускает анимацию." />
          <button
            className="btn btn-sm"
            onClick={() => setPlaying((p) => !p)}
          >
            {playing ? "❚❚ Пауза" : "▶ Воспроизвести"}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => { setTOffsetMin(0); setPlaying(false); }}
          >
            Сейчас
          </button>
          <input
            type="range"
            min={-360}
            max={0}
            step={5}
            value={tOffsetMin}
            onChange={(e) => setTOffsetMin(Number(e.target.value))}
            style={{ flex: 1, minWidth: 240, accentColor: "var(--orange)" }}
          />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "var(--text-dim)" }}>
            {fmtTimeLabel()}
          </span>
        </div>
      </div>

      <div className="globe-card">
        <div className="card-header">
          <span className="card-title">Демо-карта · AIS Vessel Tracking</span>
          <span className="card-meta">{ships.length} судов</span>
        </div>
        <div className="globe-inner" style={{ height: 640 }}>
          <style>{`
            .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #1b1530 !important; color: #f1ead2 !important; border: 1px solid #8a5ab0 !important; border-radius: 10px !important; box-shadow: 0 8px 24px rgba(0,0,0,.6) !important; }
            .leaflet-popup-content { margin: 10px 14px !important; }
            .leaflet-control-zoom a { background: #1a3220 !important; color: #f1ead2 !important; border-color: #3a5e3f !important; }
            .leaflet-container { background: #0d0a18 !important; }
            .leaflet-control-attribution { background: rgba(26,50,32,.85) !important; color: #8aa090 !important; font-size: 10px !important; }
            .leaflet-control-attribution a { color: #f39768 !important; }
          `}</style>
          <MapContainer center={[55, 60]} zoom={3} style={{ width: "100%", height: "100%" }} attributionControl={false} preferCanvas={true}>
            <AttributionControl position="bottomright" prefix={false} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            {ships.map((s) => (
              <Marker
                key={s.id}
                position={[s.lat, s.lon]}
                icon={makeShipIcon(s.type, s.course, true)}
              >
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, minWidth: 260 }}>
                    <div style={{ fontWeight: 700, color: SHIP_TYPES[s.type]?.color || "#f1ead2", marginBottom: 6, fontSize: 13 }}>
                      {s.name}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", marginBottom: 8 }}>
                      <span style={{ color: "#8aa090" }}>MMSI:</span><span>{s.mmsi}</span>
                      <span style={{ color: "#8aa090" }}>Тип:</span><span>{SHIP_TYPES[s.type]?.label}</span>
                      <span style={{ color: "#8aa090" }}>Скорость:</span><span>{s.speed} уз</span>
                      <span style={{ color: "#8aa090" }}>Курс:</span><span>{Math.round(s.course)}°</span>
                      <span style={{ color: "#8aa090" }}>Зона:</span><span>{s.zone}</span>
                      <span style={{ color: "#8aa090" }}>Позиция:</span><span>{s.lat.toFixed(3)} · {s.lon.toFixed(3)}</span>
                    </div>

                    <div style={{
                      borderTop: "1px dashed #8a5ab0",
                      paddingTop: 8,
                      marginBottom: 6,
                      color: "#f39768",
                      fontWeight: 700,
                      fontSize: 10,
                      letterSpacing: 0.6,
                      textTransform: "uppercase",
                    }}>
                      Последний AIS-пакет (архивные данные)
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", fontSize: 10.5 }}>
                      <span style={{ color: "#8aa090" }}>Принят:</span>
                      <span>{new Date(s.lastPacket.receivedAt).toLocaleString("ru")}</span>
                      <span style={{ color: "#8aa090" }}>Тип сообщ.:</span>
                      <span>AIS msg {s.lastPacket.msgType} (Pos.Report)</span>
                      <span style={{ color: "#8aa090" }}>NavStatus:</span>
                      <span>{s.lastPacket.navStatus}</span>
                      <span style={{ color: "#8aa090" }}>SOG / COG:</span>
                      <span>{s.lastPacket.sogKn} уз / {s.lastPacket.cogDeg}°</span>
                      <span style={{ color: "#8aa090" }}>HDG / ROT:</span>
                      <span>{s.lastPacket.headingDeg}° / {s.lastPacket.rotDegPerMin}°/мин</span>
                      <span style={{ color: "#8aa090" }}>RSSI / SNR:</span>
                      <span>{s.lastPacket.rssi_dbm} дБм · {s.lastPacket.snr_db} дБ</span>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>
    </>
  );
}

/* ─── Таб «Данные со спутников» ───────────────────────────────────────────── */

/** Источники AIS — спутники, с которых принят пакет. Цвет совпадает с
 *  отметкой кораблика на карте. */
const SAT_COLORS = {
  "CSTP-2.1":  "#f39768",
  "CSTP-2.2":  "#9460b8",
  "PU-4":      "#5ad6ff",
  "CSTP-2.10": "#6cc77b",
  "unknown":   "#8aa090",
};

const SAT_ORDER = ["CSTP-2.1", "CSTP-2.2", "PU-4"];

/** Последняя известная позиция каждого судна на момент ts.
 *  Берём все репорты не позже ts, но не старше windowMin — так на карте
 *  видно больше кораблей, а не только те, что попали в узкое ±окно. */
function pointsAtTime(points, ts, windowMin = 360) {
  const maxAge = windowMin * 60 * 1000;
  const byMmsi = new Map();
  for (const p of points) {
    if (p._t > ts) continue;
    if (ts - p._t > maxAge) continue;
    const key = p.mmsi || `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
    const prev = byMmsi.get(key);
    if (!prev || p._t > prev._t) byMmsi.set(key, p);
  }
  return Array.from(byMmsi.values());
}

function isPlausibleArcticPoint(p) {
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat >= 45 && p.lat <= 90;
}

function makeSatVesselIcon(satColor, course = 0) {
  return L.divIcon({
    html: `<div style="transform:rotate(${Math.round(course || 0)}deg);filter:drop-shadow(0 0 4px ${satColor});">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="${satColor}">
        <path d="M12 2L5 21l7-4 7 4z" stroke="#0d0a18" stroke-width="0.7"/>
      </svg>
    </div>`,
    className: "",
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -10],
  });
}

function SatDataMapTab() {
  const [raw, setRaw] = useState(null);   // вся выгрузка с сервера
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const [enabledSats, setEnabledSats] = useState(() => new Set(SAT_ORDER));
  const [tIdx, setTIdx] = useState(0);          // позиция бегунка (0..N-1)
  const [playing, setPlaying] = useState(false);
  const [windowMin, setWindowMin] = useState(4320); // свежесть позиции, минут
  const playRef = useRef();

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError("");
    fetchTeleaisAisPoints(null)
      .then((d) => {
        if (cancelled) return;
        // обогащаем точки числовым timestamp
        const pts = (d.points || [])
          .map((p) => ({ ...p, _t: Date.parse(p.ts) }))
          .filter((p) => Number.isFinite(p._t) && isPlausibleArcticPoint(p));
        setRaw({ ...d, points: pts });
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e?.message || String(e));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  // фильтрация по чекбоксам спутников
  const filteredAll = useMemo(() => {
    if (!raw) return [];
    return raw.points.filter((p) => enabledSats.has(p.sat));
  }, [raw, enabledSats]);

  // строим временную ось — равномерные шаги по 5 минут от min до max
  const timeline = useMemo(() => {
    if (!raw || !raw.min_ts || !raw.max_ts) return null;
    const min = Date.parse(raw.min_ts);
    const max = Date.parse(raw.max_ts);
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    const stepMs = 5 * 60 * 1000;
    const total = Math.ceil((max - min) / stepMs);
    return { min, max, stepMs, total };
  }, [raw]);

  useEffect(() => {
    // сброс позиции если timeline появился
    if (timeline) setTIdx(timeline.total);
  }, [timeline]);

  useEffect(() => {
    if (!playing || !timeline) return;
    playRef.current = setInterval(() => {
      setTIdx((i) => (i >= timeline.total ? 0 : i + 1));
    }, 200);
    return () => clearInterval(playRef.current);
  }, [playing, timeline]);

  const currentTs = timeline ? timeline.min + tIdx * timeline.stepMs : 0;

  const visiblePoints = useMemo(() => {
    if (!timeline) return [];
    return pointsAtTime(filteredAll, currentTs, windowMin);
  }, [filteredAll, currentTs, windowMin, timeline]);

  const toggleSat = (s) => {
    setEnabledSats((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const mapCenter = [72, 60];
  const mapZoom = 4;

  const fmtCurrent = () => {
    if (!timeline) return "—";
    const d = new Date(currentTs);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth()+1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  };

  return (
    <>
      <GuideBanner id="ais-sat-intro">
        <strong>Данные со спутников.</strong> Реальные AIS-репорты, принятые
        спутниками <b>CSTP-2.1</b>, <b>CSTP-2.2</b> и <b>PU-4</b> над Арктикой
        в феврале 2025 г. Чекбоксами выбирайте, какие источники
        отображать; бегунком — момент времени. Если выбраны все три — на карте
        все суда сразу.
      </GuideBanner>

      <div className="controls-card">
        <div className="ctrl-row" style={{ flexWrap: "wrap", gap: 12 }}>
          <span className="ctrl-label">Источник AIS</span>
          <Hint text="Эти чекбоксы фильтруют точки по тому, какой спутник их принял." />
          {SAT_ORDER.map((s) => (
            <label
              key={s}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                fontSize: 12,
                cursor: "pointer",
                userSelect: "none",
              }}
            >
              <input
                type="checkbox"
                checked={enabledSats.has(s)}
                onChange={() => toggleSat(s)}
                style={{ accentColor: SAT_COLORS[s] }}
              />
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: SAT_COLORS[s], display: "inline-block",
              }} />
              <span style={{ color: "var(--text)" }}>{s}</span>
              {raw && raw.by_sat && (
                <span style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace" }}>
                  · {raw.by_sat[s] || 0}
                </span>
              )}
            </label>
          ))}

          <div className="ctrl-spacer" />

          <span className="card-meta">
            {raw ? `${raw.total} точек · ${Object.keys(raw.sessions || {}).length} сессий` : "…"}
          </span>
        </div>

        <div className="ctrl-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span className="ctrl-label">Время</span>
          <Hint text="Перетащите бегунок, чтобы увидеть позиции кораблей в выбранный момент. ▶ запускает анимацию." />
          <button
            className="btn btn-sm"
            onClick={() => setPlaying((p) => !p)}
            disabled={!timeline}
          >
            {playing ? "❚❚ Пауза" : "▶ Воспроизвести"}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => { setTIdx(timeline?.total || 0); setPlaying(false); }}
            disabled={!timeline}
          >
            В конец
          </button>
          <button
            className="btn btn-sm"
            onClick={() => { setTIdx(0); setPlaying(false); }}
            disabled={!timeline}
          >
            В начало
          </button>
          <input
            type="range"
            min={0}
            max={timeline?.total ?? 0}
            step={1}
            value={tIdx}
            onChange={(e) => setTIdx(Number(e.target.value))}
            disabled={!timeline}
            style={{ flex: 1, minWidth: 240, accentColor: "var(--orange)" }}
          />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "var(--text-dim)" }}>
            {fmtCurrent()}
          </span>
        </div>

        <div className="ctrl-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span className="ctrl-label">Свежесть позиций</span>
          <Hint text="Показываем последнюю позицию судна, если её репорт не старше выбранного интервала относительно текущего момента на шкале." />
          {[60, 360, 720, 1440, 4320].map((w) => (
            <button
              key={w}
              className={`btn btn-sm ${windowMin === w ? "active" : ""}`}
              onClick={() => setWindowMin(w)}
            >
              {w >= 1440 ? `${w / 1440} сут` : w >= 60 ? `${w / 60} ч` : `${w} мин`}
            </button>
          ))}
          <div className="ctrl-spacer" />
          <span className="card-meta">
            На экране: {visiblePoints.length} судов
          </span>
        </div>
      </div>

      <div className="globe-card">
        <div className="card-header">
          <span className="card-title">AIS · реальные приёмы со спутников</span>
          <span className="card-meta">
            {raw && raw.min_ts && raw.max_ts
              ? `${new Date(raw.min_ts).toLocaleDateString("ru")} — ${new Date(raw.max_ts).toLocaleDateString("ru")}`
              : "—"}
          </span>
        </div>
        <div className="globe-inner" style={{ height: 640 }}>
          {error ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--orange-2)" }}>
              Не удалось загрузить данные: {error}
            </div>
          ) : loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              Загрузка реальных AIS-данных…
            </div>
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={mapZoom}
              style={{ width: "100%", height: "100%" }}
              attributionControl={false}
              preferCanvas
            >
              <AttributionControl position="bottomright" prefix={false} />
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                subdomains="abcd"
                maxZoom={19}
                attribution='&copy; <a href="https://carto.com/">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              />

              {visiblePoints.map((p, i) => {
                const color = SAT_COLORS[p.sat] || "#9460b8";
                const hasCourse = Number.isFinite(p.cog);
                return (
                  <Marker
                    key={`${p.mmsi}-${i}`}
                    position={[p.lat, p.lon]}
                    icon={makeSatVesselIcon(color, hasCourse ? p.cog : 0)}
                  >
                    <Popup>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, minWidth: 240 }}>
                        <div style={{ color, fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                          MMSI {p.mmsi || "—"}
                          {p.name ? ` · ${p.name}` : ""}
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px" }}>
                          <span style={{ color: "#8aa090" }}>Принят:</span>
                          <span>{new Date(p.ts).toLocaleString("ru")}</span>
                          <span style={{ color: "#8aa090" }}>Спутник:</span>
                          <span style={{ color }}>{p.sat}</span>
                          <span style={{ color: "#8aa090" }}>Сессия:</span>
                          <span style={{ fontSize: 10 }}>{p.session}</span>
                          <span style={{ color: "#8aa090" }}>Позиция:</span>
                          <span>{p.lat.toFixed(4)} · {p.lon.toFixed(4)}</span>
                          {Number.isFinite(p.sog) && (<>
                            <span style={{ color: "#8aa090" }}>SOG:</span>
                            <span>{p.sog} уз</span>
                          </>)}
                          {Number.isFinite(p.cog) && (<>
                            <span style={{ color: "#8aa090" }}>COG:</span>
                            <span>{Math.round(p.cog)}°</span>
                          </>)}
                        </div>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          )}
        </div>
      </div>
    </>
  );
}
