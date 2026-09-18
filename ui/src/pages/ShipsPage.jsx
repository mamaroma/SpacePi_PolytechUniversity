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

const REGION_META = {
  rf_sea:   { label: "РФ · моря",   color: "#f39768" },
  rf_river: { label: "РФ · реки",   color: "#6cc77b" },
  cis:      { label: "СНГ",         color: "#9460b8" },
  eu:       { label: "Европа",      color: "#5ad6ff" },
  asia:     { label: "Азия",        color: "#cbb98c" },
};

/** Имена/MMSI «как из агрегаторов» (gloap-подобные) — РФ и СНГ. */
const AGGREGATOR_VESSELS = [
  { name: "VOLGO-BALT 210", mmsi: 273314510, type: "cargo" },
  { name: "VOLGO-DON 5055", mmsi: 273358140, type: "cargo" },
  { name: "NEVA-LEADER 1", mmsi: 273442190, type: "cargo" },
  { name: "KAMA-TRADER", mmsi: 273381220, type: "cargo" },
  { name: "MOSKVA REKA", mmsi: 273218340, type: "passenger" },
  { name: "SIBERIAN STAR", mmsi: 273459880, type: "cargo" },
  { name: "OB RIVER", mmsi: 273367710, type: "tanker" },
  { name: "YENISEY PATH", mmsi: 273391450, type: "cargo" },
  { name: "LENA NORTH", mmsi: 273405560, type: "cargo" },
  { name: "AMUR BRIDGE", mmsi: 273422670, type: "cargo" },
  { name: "BAIKAL TUG", mmsi: 273198220, type: "tug" },
  { name: "LADY VOLGA", mmsi: 273276540, type: "passenger" },
  { name: "DON TANKER", mmsi: 273334890, type: "tanker" },
  { name: "ASTRAKHAN OIL", mmsi: 273351120, type: "tanker" },
  { name: "CASPIAN PEARL", mmsi: 423001450, type: "tanker" },
  { name: "BAKU TRADER", mmsi: 423002880, type: "cargo" },
  { name: "AKTAY FISH", mmsi: 436000910, type: "fishing" },
  { name: "TURKMENBASHI", mmsi: 434001220, type: "cargo" },
  { name: "DNIPRO CARGO", mmsi: 272011340, type: "cargo" },
  { name: "POTI FERRY", mmsi: 213001780, type: "passenger" },
  { name: "MURMANSK ICE", mmsi: 273449010, type: "cargo" },
  { name: "YAMAL LNG", mmsi: 273380660, type: "tanker" },
  { name: "VLADIVOSTOK TUG", mmsi: 273412230, type: "tug" },
  { name: "SAKHALIN FISHER", mmsi: 273398770, type: "fishing" },
  { name: "KRONSTADT PATROL", mmsi: 273215440, type: "military" },
];

/** Речные коридоры РФ/СНГ — суда ставятся вдоль полилинии (как в агрегаторах). */
const RIVER_CORRIDORS = [
  {
    name: "Волга", region: "rf_river", density: 42,
    types: ["cargo", "tanker", "passenger", "tug"],
    path: [[45.9, 48.0], [46.4, 48.0], [48.7, 44.5], [51.5, 46.0], [53.2, 50.1], [55.8, 49.1], [56.3, 44.0], [57.6, 39.9], [58.1, 38.8]],
  },
  {
    name: "Кама", region: "rf_river", density: 22,
    types: ["cargo", "tug", "tanker"],
    path: [[58.0, 56.2], [56.1, 54.0], [55.8, 52.0], [55.7, 49.2]],
  },
  {
    name: "Дон", region: "rf_river", density: 20,
    types: ["cargo", "tanker", "tug"],
    path: [[47.2, 39.7], [47.5, 40.8], [48.7, 42.3], [49.0, 44.0]],
  },
  {
    name: "Ока", region: "rf_river", density: 14,
    types: ["cargo", "passenger", "tug"],
    path: [[54.2, 37.6], [54.6, 39.7], [55.4, 42.0], [56.3, 44.0]],
  },
  {
    name: "Москва-река / канал", region: "rf_river", density: 16,
    types: ["passenger", "cargo", "tug"],
    path: [[55.7, 37.5], [56.0, 37.2], [56.7, 37.0], [56.8, 38.5]],
  },
  {
    name: "Обь", region: "rf_river", density: 28,
    types: ["cargo", "tanker", "tug", "fishing"],
    path: [[55.0, 82.9], [56.5, 84.9], [61.3, 73.4], [66.5, 66.5], [66.6, 71.0]],
  },
  {
    name: "Иртыш", region: "rf_river", density: 16,
    types: ["cargo", "tug", "tanker"],
    path: [[55.0, 73.4], [58.2, 68.3], [61.1, 68.8], [61.3, 73.4]],
  },
  {
    name: "Енисей", region: "rf_river", density: 24,
    types: ["cargo", "tanker", "tug"],
    path: [[56.0, 92.9], [58.5, 92.2], [64.0, 87.5], [69.4, 86.2], [73.5, 80.5]],
  },
  {
    name: "Лена", region: "rf_river", density: 18,
    types: ["cargo", "tug", "fishing"],
    path: [[62.0, 129.7], [63.5, 128.0], [67.5, 123.5], [71.5, 127.0], [73.0, 126.5]],
  },
  {
    name: "Амур", region: "rf_river", density: 20,
    types: ["cargo", "tug", "passenger", "fishing"],
    path: [[50.3, 127.5], [50.6, 137.0], [53.1, 140.7], [52.0, 141.3]],
  },
  {
    name: "Северная Двина", region: "rf_river", density: 12,
    types: ["cargo", "tug"],
    path: [[61.3, 47.0], [62.5, 43.5], [64.5, 40.5]],
  },
  {
    name: "Днепр (СНГ)", region: "cis", density: 14,
    types: ["cargo", "tug", "passenger"],
    path: [[50.4, 30.5], [48.7, 31.5], [46.6, 32.6], [46.5, 32.0]],
  },
  {
    name: "Урал-река", region: "cis", density: 10,
    types: ["cargo", "fishing", "tug"],
    path: [[51.2, 51.4], [49.0, 51.5], [47.1, 51.9], [46.8, 51.2]],
  },
];

/** Точка на полилинии реки + лёгкий снос «поперёк русла». */
function pointOnPath(path, t, jitter = 0.08, rng = Math.random) {
  const segs = path.length - 1;
  const f = Math.max(0, Math.min(0.999, t)) * segs;
  const i = Math.floor(f);
  const u = f - i;
  const a = path[i];
  const b = path[Math.min(i + 1, path.length - 1)];
  const lat = a[0] + (b[0] - a[0]) * u;
  const lon = a[1] + (b[1] - a[1]) * u;
  const dLat = b[0] - a[0];
  const dLon = b[1] - a[1];
  const len = Math.hypot(dLat, dLon) || 1;
  const nx = -dLon / len;
  const ny = dLat / len;
  const j = (rng() - 0.5) * 2 * jitter;
  const course = ((Math.atan2(dLon, dLat) * 180) / Math.PI + 360) % 360;
  return { lat: lat + nx * j, lon: lon + ny * j, course };
}

/**
 * Архивная выборка: через день в 10:00 и 22:00 UTC — меньше вес, больше месяцев.
 * Покрытие: март–август 2026 (учебный год DISPLAY).
 */
function buildArchiveSnapshots() {
  const out = [];
  const start = Date.UTC(2026, 2, 1); // 1 Mar 2026
  const end = Date.UTC(2026, 7, 31);  // 31 Aug 2026
  for (let day = start; day <= end; day += 2 * 86400000) {
    for (const hour of [10, 22]) {
      out.push(day + hour * 3600000);
    }
  }
  return out;
}

const ARCHIVE_SNAPSHOTS = buildArchiveSnapshots();

/** Генерация флота: моря РФ/СНГ + речные коридоры + умеренная Азия/Европа. */
function buildShipFleet() {
  const ZONES = [
    // ── РФ · моря / озёра ──────────────────────────────────────────
    { name: "Балтика — СПб", region: "rf_sea", lat: 60.0, lon: 28.5, rLat: 1.6, rLon: 4.2, density: 56, types: ["cargo","tanker","passenger","tug","fishing"] },
    { name: "Финский залив", region: "rf_sea", lat: 59.7, lon: 25.0, rLat: 1.0, rLon: 5.0, density: 40, types: ["cargo","tanker","passenger"] },
    { name: "Балтика — центр", region: "rf_sea", lat: 56.5, lon: 18.0, rLat: 2.0, rLon: 5.0, density: 28, types: ["cargo","passenger","tanker"] },
    { name: "Калининград — Балтийск", region: "rf_sea", lat: 54.7, lon: 19.9, rLat: 0.7, rLon: 1.5, density: 26, types: ["cargo","tanker","military","tug","passenger"] },
    { name: "Ладожское озеро", region: "rf_sea", lat: 60.8, lon: 31.5, rLat: 1.4, rLon: 1.5, density: 22, types: ["cargo","passenger","fishing","tug"] },
    { name: "Онежское озеро", region: "rf_sea", lat: 61.7, lon: 35.6, rLat: 1.5, rLon: 1.0, density: 18, types: ["cargo","fishing","passenger"] },
    { name: "Беломорско-Балтийский канал", region: "rf_river", lat: 64.7, lon: 34.9, rLat: 1.8, rLon: 0.7, density: 14, types: ["cargo","tug","tanker"] },
    { name: "Баренцево / Мурманск", region: "rf_sea", lat: 69.5, lon: 35.0, rLat: 3.0, rLon: 9.0, density: 36, types: ["cargo","tanker","military","fishing"] },
    { name: "Архангельск — Белое", region: "rf_sea", lat: 64.6, lon: 40.5, rLat: 1.6, rLon: 3.5, density: 26, types: ["cargo","tanker","fishing","tug"] },
    { name: "Новая Земля — Печора", region: "rf_sea", lat: 70.0, lon: 53.0, rLat: 2.5, rLon: 6.0, density: 16, types: ["tanker","cargo","military"] },
    { name: "СМП — Карское", region: "rf_sea", lat: 73.0, lon: 65.0, rLat: 3.0, rLon: 12.0, density: 22, types: ["cargo","tanker","fishing"] },
    { name: "СМП — Лаптевых", region: "rf_sea", lat: 75.5, lon: 125.0, rLat: 2.5, rLon: 14.0, density: 16, types: ["cargo","tanker"] },
    { name: "Восточно-Сибирское", region: "rf_sea", lat: 73.5, lon: 160.0, rLat: 2.5, rLon: 14.0, density: 14, types: ["cargo","tanker","fishing"] },
    { name: "Чукотское / Берингово", region: "rf_sea", lat: 64.0, lon: 178.0, rLat: 3.0, rLon: 10.0, density: 16, types: ["cargo","fishing","tanker"] },
    { name: "Чёрное море", region: "rf_sea", lat: 43.5, lon: 35.0, rLat: 2.5, rLon: 5.0, density: 44, types: ["cargo","tanker","passenger","military"] },
    { name: "Новороссийск", region: "rf_sea", lat: 44.7, lon: 37.7, rLat: 0.7, rLon: 1.2, density: 26, types: ["tanker","cargo","tug","military"] },
    { name: "Севастополь", region: "rf_sea", lat: 44.6, lon: 33.5, rLat: 0.8, rLon: 1.4, density: 24, types: ["military","cargo","tug","passenger"] },
    { name: "Сочи / Туапсе", region: "rf_sea", lat: 43.9, lon: 39.4, rLat: 0.7, rLon: 1.0, density: 18, types: ["passenger","cargo","tug","tanker"] },
    { name: "Азовское море", region: "rf_sea", lat: 46.0, lon: 36.5, rLat: 1.5, rLon: 2.0, density: 28, types: ["cargo","fishing","tug","tanker"] },
    { name: "Керченский пролив", region: "rf_sea", lat: 45.2, lon: 36.5, rLat: 0.5, rLon: 0.8, density: 18, types: ["cargo","tanker","tug"] },
    { name: "Японское море", region: "rf_sea", lat: 41.0, lon: 134.0, rLat: 4.5, rLon: 6.0, density: 34, types: ["cargo","tanker","fishing","passenger"] },
    { name: "Владивосток", region: "rf_sea", lat: 43.0, lon: 132.0, rLat: 1.5, rLon: 2.5, density: 30, types: ["cargo","tanker","military","tug"] },
    { name: "Находка", region: "rf_sea", lat: 42.8, lon: 132.9, rLat: 0.6, rLon: 1.0, density: 18, types: ["tanker","cargo","tug"] },
    { name: "Сахалин — Корсаков", region: "rf_sea", lat: 46.6, lon: 142.8, rLat: 1.5, rLon: 2.0, density: 20, types: ["cargo","tanker","passenger","fishing"] },
    { name: "Татарский пролив", region: "rf_sea", lat: 50.0, lon: 142.0, rLat: 3.0, rLon: 2.5, density: 16, types: ["cargo","tanker","fishing"] },
    { name: "Камчатка — Авача", region: "rf_sea", lat: 53.0, lon: 158.6, rLat: 1.5, rLon: 2.5, density: 20, types: ["fishing","cargo","military","passenger"] },
    { name: "Магадан", region: "rf_sea", lat: 59.6, lon: 150.8, rLat: 1.6, rLon: 4.0, density: 16, types: ["cargo","tanker","fishing"] },

    // ── СНГ ───────────────────────────────────────────────────────
    { name: "Каспий — Север", region: "cis", lat: 45.5, lon: 49.5, rLat: 2.0, rLon: 2.5, density: 24, types: ["tanker","cargo","fishing"] },
    { name: "Каспий — Центр", region: "cis", lat: 41.5, lon: 50.5, rLat: 4.5, rLon: 2.5, density: 22, types: ["cargo","tanker","fishing"] },
    { name: "Махачкала", region: "rf_sea", lat: 43.0, lon: 47.5, rLat: 0.6, rLon: 1.0, density: 14, types: ["cargo","tanker","tug"] },
    { name: "Баку", region: "cis", lat: 40.4, lon: 50.0, rLat: 0.5, rLon: 1.2, density: 18, types: ["tanker","cargo","fishing"] },
    { name: "Туркменбаши", region: "cis", lat: 40.0, lon: 53.0, rLat: 0.7, rLon: 1.2, density: 14, types: ["tanker","cargo","fishing"] },
    { name: "Актау", region: "cis", lat: 43.6, lon: 51.2, rLat: 0.6, rLon: 1.0, density: 12, types: ["tanker","cargo","tug"] },
    { name: "Одесса", region: "cis", lat: 46.4, lon: 30.7, rLat: 0.8, rLon: 1.4, density: 20, types: ["cargo","tanker","passenger","tug"] },
    { name: "Поти / Батуми", region: "cis", lat: 42.0, lon: 41.5, rLat: 0.6, rLon: 1.2, density: 16, types: ["cargo","tanker","passenger"] },

    // ── Европа (масштаб) ──────────────────────────────────────────
    { name: "Босфор", region: "eu", lat: 41.05, lon: 29.0, rLat: 0.6, rLon: 0.8, density: 20, types: ["cargo","tanker","passenger"] },
    { name: "Северное море", region: "eu", lat: 56.0, lon: 4.5, rLat: 4.0, rLon: 4.5, density: 18, types: ["cargo","tanker","fishing"] },

    // ── Азия — меньше, чтобы не забивать РФ ───────────────────────
    { name: "Жёлтое море", region: "asia", lat: 36.5, lon: 122.5, rLat: 3.0, rLon: 4.0, density: 22, types: ["cargo","tanker","fishing"] },
    { name: "Шанхай", region: "asia", lat: 31.0, lon: 122.5, rLat: 2.0, rLon: 3.0, density: 24, types: ["cargo","tanker","passenger"] },
    { name: "Южный Китай", region: "asia", lat: 23.0, lon: 116.0, rLat: 4.0, rLon: 5.5, density: 18, types: ["cargo","tanker","fishing"] },
    { name: "Сингапур", region: "asia", lat: 1.3, lon: 103.9, rLat: 0.6, rLon: 1.0, density: 16, types: ["cargo","tanker","passenger"] },
  ];

  const NAMES = [
    "NORDIC STAR","NEVA TRADER","BALTIC FERRY","KRONSTADT TUG","LADOGA TANKER",
    "MURMANSK ICE","ARCTIC PATROL","YAMAL LNG","SOCHI SUNRISE","NOVOROSSIYSK OIL",
    "VLADIVOSTOK TUG","SAKHALIN FISHER","CASPIAN PEARL","BAKU TRADER","DNIPRO CARGO",
    "HAMBURG EXPRESS","STOCKHOLM LINK","HELSINKI CARGO","SHANGHAI GIANT","SINGAPORE PASSAGE",
  ];
  const PREFIX = ["NORD","BALT","ARCT","NEVA","DON","VOLGA","KAMA","OB","LENA","ENISEY","AMUR","IRTYSH","CASP","DNIPRO"];
  const SUFFIX = ["TRADER","STAR","PEARL","HARVEST","PATROL","CARGO","TANKER","BREEZE","RUNNER","VOYAGER","TUG","DREAM"];

  const MMSI_BY_REGION = {
    rf_sea: 273000000, rf_river: 273200000, cis: 423000000, eu: 211000000, asia: 412800000,
  };

  const ships = [];
  let id = 1;
  let aggIdx = 0;

  const pushShip = (base, rng) => {
    const region = base.region || "rf_sea";
    const useAgg = region !== "asia" && region !== "eu" && rng() < 0.35 && aggIdx < AGGREGATOR_VESSELS.length * 3;
    const agg = AGGREGATOR_VESSELS[aggIdx % AGGREGATOR_VESSELS.length];
    if (useAgg) aggIdx += 1;
    const name = useAgg
      ? agg.name
      : (rng() < 0.5
        ? NAMES[Math.floor(rng() * NAMES.length)]
        : `${PREFIX[Math.floor(rng() * PREFIX.length)]} ${SUFFIX[Math.floor(rng() * SUFFIX.length)]}`);
    const type = useAgg ? agg.type : base.type;
    const mmsiBase = MMSI_BY_REGION[region] || 273000000;
    const mmsi = useAgg
      ? agg.mmsi + Math.floor(rng() * 90)
      : mmsiBase + Math.floor(rng() * 799000) + id;
    ships.push({
      id: id++,
      mmsi,
      name,
      type,
      lat: base.lat,
      lon: base.lon,
      course: base.course,
      speed: base.speed,
      zone: base.zone,
      region,
      river: !!base.river,
      path: base.path || null,
      pathT: base.pathT ?? null,
      zoneLat: base.zoneLat,
      zoneLon: base.zoneLon,
      zoneRLat: base.zoneRLat,
      zoneRLon: base.zoneRLon,
      source: useAgg ? "aggregator" : "model",
    });
  };

  for (const z of ZONES) {
    const rng = seededRng(Math.floor(z.lat * 91 + z.lon * 13));
    for (let i = 0; i < z.density; i++) {
      const lat = z.lat + (rng() - 0.5) * 2 * z.rLat;
      const lon = z.lon + (rng() - 0.5) * 2 * z.rLon;
      const type = z.types[Math.floor(rng() * z.types.length)];
      const courseBase = z.rLon > z.rLat ? 90 : 0;
      const course = (courseBase + (rng() - 0.5) * 60 + 360) % 360;
      const speed = +(6 + rng() * 14).toFixed(1);
      pushShip({
        region: z.region, type, lat, lon, course, speed,
        zone: z.name, zoneLat: z.lat, zoneLon: z.lon, zoneRLat: z.rLat, zoneRLon: z.rLon,
      }, rng);
    }
  }

  for (const riv of RIVER_CORRIDORS) {
    const rng = seededRng(riv.name.length * 97 + riv.path[0][0] * 11);
    const types = riv.types.filter((t) => SHIP_TYPES[t]);
    for (let i = 0; i < riv.density; i++) {
      const t0 = (i + 0.5) / riv.density;
      const pt = pointOnPath(riv.path, t0, 0.06, rng);
      const type = types[Math.floor(rng() * types.length)] || "cargo";
      const speed = +(4 + rng() * 8).toFixed(1);
      pushShip({
        region: riv.region, type, river: true,
        lat: pt.lat, lon: pt.lon, course: pt.course, speed,
        zone: riv.name, path: riv.path, pathT: t0,
        zoneLat: pt.lat, zoneLon: pt.lon, zoneRLat: 0.35, zoneRLon: 0.45,
      }, rng);
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

/** Позиция судна на выбранный архивный снимок (без хранения треков). */
function positionAtSnapshot(ship, snapIdx) {
  const rng = seededRng(ship.mmsi ^ (snapIdx * 9973));
  if (ship.path && ship.path.length >= 2) {
    const drift = (rng() - 0.5) * 0.08;
    const t = Math.max(0.02, Math.min(0.98, (ship.pathT ?? 0.5) + drift));
    const pt = pointOnPath(ship.path, t, 0.05, rng);
    return { lat: pt.lat, lon: pt.lon, course: pt.course };
  }
  // Море: лёгкое «дыхание» вокруг якорной позиции, clamp в зоне.
  const minutes = (rng() - 0.5) * 180;
  const moved = advance(ship, minutes);
  return { lat: moved.lat, lon: moved.lon, course: ship.course };
}

function fmtSnapLabel(ms) {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth() + 1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:00 UTC`;
}

function monthKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  const names = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return `${names[Number(m) - 1]} ${y}`;
}

const FLEET = buildShipFleet();

const ARCHIVE_MONTHS = (() => {
  const seen = [];
  const keys = new Set();
  for (const ms of ARCHIVE_SNAPSHOTS) {
    const k = monthKey(ms);
    if (!keys.has(k)) { keys.add(k); seen.push(k); }
  }
  return seen;
})();

/* ─── Главный компонент: переключатель табов ─────────────────────────────── */
export default function ShipsPage() {
  const [tab, setTab] = useState("demo"); // "demo" | "sat"
  return (
    <div className="app-body">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">AIS · корабли</h1>
          <p className="page-subtitle">
            Демо с акцентом на РФ/СНГ и реки (архивная выборка 10:00/22:00) плюс реальные приёмы со спутников.
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

/* ─── Таб «Демо-карта» ───────────────────────────────────────────────────── */
function DemoMapTab() {
  const [visibleTypes, setVisibleTypes] = useState(new Set(SHIP_TYPE_LIST));
  const [regionFilter, setRegionFilter] = useState(() => new Set(Object.keys(REGION_META)));
  const [month, setMonth] = useState(ARCHIVE_MONTHS[ARCHIVE_MONTHS.length - 1] || ARCHIVE_MONTHS[0]);
  const [snapIdx, setSnapIdx] = useState(() => Math.max(0, ARCHIVE_SNAPSHOTS.length - 1));
  const [playing, setPlaying] = useState(false);
  const playRef = useRef();

  const monthSnaps = useMemo(() => {
    return ARCHIVE_SNAPSHOTS
      .map((ms, i) => ({ ms, i }))
      .filter((x) => monthKey(x.ms) === month);
  }, [month]);

  // При смене месяца — прыгаем на первый снимок месяца
  useEffect(() => {
    if (!monthSnaps.length) return;
    if (!monthSnaps.some((s) => s.i === snapIdx)) {
      setSnapIdx(monthSnaps[0].i);
    }
  }, [month, monthSnaps, snapIdx]);

  useEffect(() => {
    if (!playing || !monthSnaps.length) return;
    playRef.current = setInterval(() => {
      setSnapIdx((cur) => {
        const pos = monthSnaps.findIndex((s) => s.i === cur);
        const next = monthSnaps[(pos + 1) % monthSnaps.length];
        return next.i;
      });
    }, 700);
    return () => clearInterval(playRef.current);
  }, [playing, monthSnaps]);

  const toggleType = (t) => {
    setVisibleTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleRegion = (r) => {
    setRegionFilter((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });
  };

  const snapMs = ARCHIVE_SNAPSHOTS[snapIdx] ?? ARCHIVE_SNAPSHOTS[0];
  const localIdxInMonth = Math.max(0, monthSnaps.findIndex((s) => s.i === snapIdx));

  const ships = useMemo(() => {
    return FLEET
      .filter((s) => visibleTypes.has(s.type) && regionFilter.has(s.region))
      .map((s) => {
        const pos = positionAtSnapshot(s, snapIdx);
        const rng = seededRng(s.mmsi + snapIdx);
        const moved = { ...s, lat: pos.lat, lon: pos.lon, course: pos.course };
        moved.lastPacket = buildAisPacket(moved, snapMs, rng);
        return moved;
      });
  }, [visibleTypes, regionFilter, snapIdx, snapMs]);

  const analytics = useMemo(() => {
    const byRegion = {};
    const byType = {};
    let river = 0;
    let sea = 0;
    let aggregator = 0;
    for (const s of ships) {
      byRegion[s.region] = (byRegion[s.region] || 0) + 1;
      byType[s.type] = (byType[s.type] || 0) + 1;
      if (s.river) river += 1; else sea += 1;
      if (s.source === "aggregator") aggregator += 1;
    }
    const maxR = Math.max(1, ...Object.values(byRegion));
    return { byRegion, byType, river, sea, aggregator, maxR, total: ships.length };
  }, [ships]);

  return (
    <>
      <GuideBanner id="ais-intro-v3">
        <strong>Демо-карта AIS.</strong> Фокус — <b>РФ и СНГ</b>, включая речной флот
        (Волга, Обь, Енисей, Лена, Амур…). Архив: выборка{" "}
        <b>через день в 10:00 и 22:00 UTC</b> за март–август 2026 — меньше вес,
        больше месяцев. Имена частично как в агрегаторах. Реальные приёмы с орбиты —
        вкладка «Данные со спутников».
      </GuideBanner>

      <div className="ais-analytics">
        <div className="ais-analytics-card">
          <div className="ais-analytics-k">Суда на снимке</div>
          <div className="ais-analytics-v">{analytics.total}</div>
          <div className="ais-analytics-sub">флот {FLEET.length} · снимков {ARCHIVE_SNAPSHOTS.length}</div>
        </div>
        <div className="ais-analytics-card">
          <div className="ais-analytics-k">Реки / моря</div>
          <div className="ais-analytics-v">{analytics.river} <span>/ {analytics.sea}</span></div>
          <div className="ais-analytics-sub">из них «агрегатор» · {analytics.aggregator}</div>
        </div>
        <div className="ais-analytics-card ais-analytics-card--wide">
          <div className="ais-analytics-k">По регионам</div>
          <div className="ais-analytics-bars">
            {Object.entries(REGION_META).map(([key, meta]) => {
              const n = analytics.byRegion[key] || 0;
              const pct = Math.round((n / analytics.maxR) * 100);
              return (
                <div key={key} className="ais-analytics-bar-row">
                  <span className="ais-analytics-bar-label" style={{ color: meta.color }}>{meta.label}</span>
                  <div className="ais-analytics-bar-track">
                    <div className="ais-analytics-bar-fill" style={{ width: `${pct}%`, background: meta.color }} />
                  </div>
                  <span className="ais-analytics-bar-n">{n}</span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="ais-analytics-card">
          <div className="ais-analytics-k">Типы</div>
          <div className="ais-analytics-types">
            {SHIP_TYPE_LIST.map((t) => (
              <span key={t} className="ais-analytics-type-chip" style={{ borderColor: SHIP_TYPES[t].color }}>
                <i style={{ background: SHIP_TYPES[t].color }} />
                {(analytics.byType[t] || 0)}
              </span>
            ))}
          </div>
          <div className="ais-analytics-sub">10:00 · 22:00 · через день</div>
        </div>
      </div>

      <div className="controls-card">
        <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
          <span className="ctrl-label" style={{ marginRight: 8 }}>Регион</span>
          {Object.entries(REGION_META).map(([key, meta]) => (
            <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginRight: 10, userSelect: "none" }}>
              <input
                type="checkbox"
                checked={regionFilter.has(key)}
                onChange={() => toggleRegion(key)}
                style={{ accentColor: meta.color }}
              />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: meta.color, display: "inline-block" }} />
              {meta.label}
            </label>
          ))}
        </div>

        <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
          <span className="ctrl-label" style={{ marginRight: 8 }}>Типы судов</span>
          <Hint text="Снимайте галочки, чтобы скрыть типы. Речной флот — в основном грузовые, танкеры и буксиры." />
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
          <span className="card-meta">{ships.length} судов · архивный снимок</span>
        </div>

        <div className="ctrl-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <span className="ctrl-label">Месяц</span>
          <div className="ais-window-pills">
            {ARCHIVE_MONTHS.map((m) => (
              <button
                key={m}
                type="button"
                className={`ais-window-pill${month === m ? " ais-window-pill--active" : ""}`}
                onClick={() => { setMonth(m); setPlaying(false); }}
              >
                {monthLabel(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="ctrl-row" style={{ alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <span className="ctrl-label">Снимок</span>
          <Hint text="Выборка через день: 10:00 и 22:00 UTC. Так покрываем месяцы без тяжёлого непрерывного трека." />
          <button className="btn btn-sm" onClick={() => setPlaying((p) => !p)}>
            {playing ? "❚❚ Пауза" : "▶ Воспроизвести"}
          </button>
          <button
            className="btn btn-sm"
            onClick={() => {
              if (monthSnaps.length) setSnapIdx(monthSnaps[monthSnaps.length - 1].i);
              setPlaying(false);
            }}
          >
            Конец месяца
          </button>
          <input
            type="range"
            min={0}
            max={Math.max(0, monthSnaps.length - 1)}
            step={1}
            value={localIdxInMonth}
            onChange={(e) => {
              const s = monthSnaps[Number(e.target.value)];
              if (s) setSnapIdx(s.i);
            }}
            style={{ flex: 1, minWidth: 240, accentColor: "var(--orange)" }}
          />
          <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "var(--text-dim)" }}>
            {fmtSnapLabel(snapMs)} · {localIdxInMonth + 1}/{monthSnaps.length || 1}
          </span>
        </div>
      </div>

      <div className="globe-card sat-monitor-shell">
        <div className="sat-monitor-header">
          <div>
            <div className="sat-monitor-header-title">SAT-MONITOR</div>
            <div className="sat-monitor-header-sub">
              Демо-карта · AIS Vessel Tracking · {ships.length} судов · {fmtSnapLabel(snapMs)}
            </div>
          </div>
        </div>
        <div className="globe-inner" style={{ height: 640, borderRadius: 0 }}>
          <style>{`
            .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #1b1530 !important; color: #f1ead2 !important; border: 1px solid #8a5ab0 !important; border-radius: 10px !important; box-shadow: 0 8px 24px rgba(0,0,0,.6) !important; }
            .leaflet-popup-content { margin: 10px 14px !important; }
            .leaflet-control-zoom a { background: #1a3220 !important; color: #f1ead2 !important; border-color: #3a5e3f !important; }
            .leaflet-container { background: #0d0a18 !important; }
            .leaflet-control-attribution { background: rgba(26,50,32,.85) !important; color: #8aa090 !important; font-size: 10px !important; }
            .leaflet-control-attribution a { color: #f39768 !important; }
          `}</style>
          <MapContainer center={[58, 70]} zoom={3} style={{ width: "100%", height: "100%" }} attributionControl={false} preferCanvas={true}>
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
                icon={makeShipIcon(s.type, s.course, s.river)}
              >
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, minWidth: 260 }}>
                    <div style={{ fontWeight: 700, color: SHIP_TYPES[s.type]?.color || "#f1ead2", marginBottom: 6, fontSize: 13 }}>
                      {s.name}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", marginBottom: 8 }}>
                      <span style={{ color: "#8aa090" }}>MMSI:</span><span>{s.mmsi}</span>
                      <span style={{ color: "#8aa090" }}>Тип:</span><span>{SHIP_TYPES[s.type]?.label}</span>
                      <span style={{ color: "#8aa090" }}>Регион:</span>
                      <span>{REGION_META[s.region]?.label || s.region}{s.river ? " · река" : ""}</span>
                      <span style={{ color: "#8aa090" }}>Источник:</span>
                      <span>{s.source === "aggregator" ? "агрегатор (выборка)" : "модель зоны"}</span>
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
                      AIS-пакет · архивный снимок
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", fontSize: 10.5 }}>
                      <span style={{ color: "#8aa090" }}>Снимок:</span>
                      <span>{fmtSnapLabel(snapMs)}</span>
                      <span style={{ color: "#8aa090" }}>Тип сообщ.:</span>
                      <span>AIS msg {s.lastPacket.msgType} (Pos.Report)</span>
                      <span style={{ color: "#8aa090" }}>NavStatus:</span>
                      <span>{s.lastPacket.navStatus}</span>
                      <span style={{ color: "#8aa090" }}>SOG / COG:</span>
                      <span>{s.lastPacket.sogKn} уз / {s.lastPacket.cogDeg}°</span>
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

const SAT_ORDER = ["CSTP-2.1", "CSTP-2.2", "PU-4", "CSTP-2.10"];

/** Пресеты «окна свежести» позиций (минуты). */
const WINDOW_PRESETS = [
  { min: 60,   label: "1 ч" },
  { min: 360,  label: "6 ч" },
  { min: 720,  label: "12 ч" },
  { min: 1440, label: "1 сут" },
  { min: 4320, label: "3 сут" },
  { min: 8640, label: "6 сут" },
];

/** Последняя известная позиция каждого судна на момент ts.
 *  Берём все репорты не позже ts, но не старше windowMin — так на карте
 *  видно больше кораблей, а не только те, что попали в узкое ±окно. */
function pointsAtTime(points, ts, windowMin = 360) {
  const maxAge = Math.max(1, Number(windowMin) || 360) * 60 * 1000;
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
  const [windowMin, setWindowMin] = useState(1440); // свежесть позиции, минут
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
    if (!raw?.points?.length) return null;
    // Берём min/max по фактическим точкам (после подмены года на бэке)
    let min = Infinity;
    let max = -Infinity;
    for (const p of raw.points) {
      if (p._t < min) min = p._t;
      if (p._t > max) max = p._t;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) return null;
    const stepMs = 5 * 60 * 1000;
    const total = Math.max(1, Math.ceil((max - min) / stepMs));
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

  const currentTs = timeline ? Math.min(timeline.max, timeline.min + tIdx * timeline.stepMs) : 0;

  const visiblePoints = useMemo(() => {
    if (!timeline) return [];
    return pointsAtTime(filteredAll, currentTs, windowMin);
  }, [filteredAll, currentTs, windowMin, timeline]);

  // Сколько судов было бы видно при каждом пресете — для подсказки у кнопок
  const windowPreviews = useMemo(() => {
    if (!timeline) return {};
    const out = {};
    for (const w of WINDOW_PRESETS) {
      out[w.min] = pointsAtTime(filteredAll, currentTs, w.min).length;
    }
    return out;
  }, [filteredAll, currentTs, timeline]);

  const toggleSat = (s) => {
    setEnabledSats((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  };

  const applyWindow = (w) => {
    setWindowMin(Number(w));
    // Если окно больше текущего «хвоста» шкалы — подтягиваем бегунок к концу,
    // чтобы пользователь сразу видел эффект длинного окна.
    if (timeline && tIdx < timeline.total * 0.15) {
      setTIdx(timeline.total);
    }
  };

  const mapCenter = [72, 60];
  const mapZoom = 4;

  const fmtCurrent = () => {
    if (!timeline) return "—";
    const d = new Date(currentTs);
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getUTCDate())}.${pad(d.getUTCMonth()+1)}.${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} UTC`;
  };

  const rangeLabel = useMemo(() => {
    if (!timeline) return "";
    const a = new Date(timeline.min);
    const b = new Date(timeline.max);
    const f = (d) => d.toLocaleDateString("ru", { day: "2-digit", month: "2-digit", year: "numeric" });
    return `${f(a)} — ${f(b)}`;
  }, [timeline]);

  return (
    <>
      <GuideBanner id="ais-sat-intro-v2" icon={null}>
        <strong>Данные со спутников.</strong> AIS-репорты CSTP-2.1 / CSTP-2.2 / PU-4
        (арктические пролёты). Календарные даты показаны как <b>2026</b> — пока нет
        свежего архива, год подменён для учебной шкалы. Чекбоксы — источники;
        бегунок — момент времени; кнопки окна — насколько «свежей» должна быть
        последняя позиция судна.
      </GuideBanner>

      <div className="controls-card ais-controls">
        <div className="ctrl-row" style={{ flexWrap: "wrap", gap: 12 }}>
          <span className="ctrl-label">Источник AIS</span>
          <Hint text="Эти чекбоксы фильтруют точки по тому, какой спутник их принял." />
          {SAT_ORDER.map((s) => (
            <label
              key={s}
              className="ais-sat-chip"
              style={{ "--sat-color": SAT_COLORS[s] }}
            >
              <input
                type="checkbox"
                checked={enabledSats.has(s)}
                onChange={() => toggleSat(s)}
                style={{ accentColor: SAT_COLORS[s] }}
              />
              <span className="ais-sat-dot" />
              <span style={{ color: "var(--text)" }}>{s}</span>
              {raw?.by_sat && (
                <span className="ais-sat-count">{raw.by_sat[s] || 0}</span>
              )}
            </label>
          ))}

          <div className="ctrl-spacer" />

          <span className="card-meta">
            {raw ? `${raw.total} точек · ${Object.keys(raw.sessions || {}).length} сессий` : "…"}
            {rangeLabel ? ` · ${rangeLabel}` : ""}
          </span>
        </div>

        <div className="ctrl-row ais-time-row">
          <span className="ctrl-label">Время</span>
          <Hint text="Перетащите бегунок, чтобы увидеть позиции кораблей в выбранный момент. ▶ запускает анимацию." />
          <div className="ais-play-btns">
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setPlaying((p) => !p)}
              disabled={!timeline}
            >
              {playing ? "❚❚ Пауза" : "▶ Воспроизвести"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setTIdx(timeline?.total || 0); setPlaying(false); }}
              disabled={!timeline}
            >
              В конец
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => { setTIdx(0); setPlaying(false); }}
              disabled={!timeline}
            >
              В начало
            </button>
          </div>
          <input
            type="range"
            className="ais-timeline"
            min={0}
            max={timeline?.total ?? 0}
            step={1}
            value={Math.min(tIdx, timeline?.total ?? 0)}
            onChange={(e) => { setPlaying(false); setTIdx(Number(e.target.value)); }}
            disabled={!timeline}
          />
          <span className="ais-time-readout">{fmtCurrent()}</span>
        </div>

        <div className="ctrl-row ais-window-row">
          <span className="ctrl-label">Окно свежести</span>
          <Hint text="Показываем последнюю позицию судна, если репорт не старше выбранного интервала относительно момента на шкале. 3 и 6 суток покрывают почти весь арктический архив." />
          <div className="ais-window-pills" role="group" aria-label="Окно свежести позиций">
            {WINDOW_PRESETS.map((w) => (
              <button
                key={w.min}
                type="button"
                className={`ais-window-pill${windowMin === w.min ? " ais-window-pill--active" : ""}`}
                onClick={() => applyWindow(w.min)}
                title={`Показать суда с репортом не старше ${w.label} · сейчас ~${windowPreviews[w.min] ?? "—"}`}
              >
                <span>{w.label}</span>
                <span className="ais-window-pill-n">{windowPreviews[w.min] ?? "—"}</span>
              </button>
            ))}
          </div>
          <label className="ais-window-slider">
            <span>точно</span>
            <input
              type="range"
              min={30}
              max={10080}
              step={30}
              value={windowMin}
              onChange={(e) => applyWindow(Number(e.target.value))}
            />
            <span className="ais-window-slider-val">
              {windowMin >= 1440
                ? `${(windowMin / 1440).toFixed(windowMin % 1440 === 0 ? 0 : 1)} сут`
                : windowMin >= 60
                  ? `${Math.round(windowMin / 60)} ч`
                  : `${windowMin} мин`}
            </span>
          </label>
          <div className="ctrl-spacer" />
          <span className="card-meta">
            На экране: <b style={{ color: "var(--orange)" }}>{visiblePoints.length}</b> судов
          </span>
        </div>
      </div>

      <div className="globe-card sat-monitor-shell">
        <div className="sat-monitor-header">
          <div>
            <div className="sat-monitor-header-title">SAT-MONITOR</div>
            <div className="sat-monitor-header-sub">
              AIS · приёмы со спутников
              {rangeLabel ? ` · ${rangeLabel}` : ""}
              {raw?.display_year ? ` · даты → ${raw.display_year}` : ""}
            </div>
          </div>
        </div>
        <div className="globe-inner" style={{ height: 640, borderRadius: 0 }}>
          {error ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--orange-2)" }}>
              Не удалось загрузить данные: {error}
            </div>
          ) : loading ? (
            <div style={{ padding: 40, textAlign: "center", color: "var(--text-muted)" }}>
              Загрузка AIS-данных…
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
                    key={`${p.mmsi}-${p._t}-${i}`}
                    position={[p.lat, p.lon]}
                    icon={makeSatVesselIcon(color, hasCourse ? p.cog : 0)}
                  >
                    <Popup>
                      <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, minWidth: 240 }}>
                        <div style={{ color, fontWeight: 700, marginBottom: 6, fontSize: 13 }}>
                          MMSI {p.mmsi || "—"}
                          {p.name ? ` · ${p.name}` : ""}
                          {p.synthetic ? " · synth" : ""}
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
