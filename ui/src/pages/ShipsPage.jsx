import React, { useEffect, useMemo, useState, useRef } from "react";
import { MapContainer, TileLayer, Marker, Popup, AttributionControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Hint, { GuideBanner } from "../components/Hint";

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
  // density — относительный вес, влияет на количество кораблей в зоне
  const ZONES = [
    // Балтика, СПб
    { name: "Балтика — СПб",      lat: 60.0, lon: 28.5,  rLat: 1.6, rLon: 4.2,  density: 36, types: ["cargo","tanker","passenger","tug","fishing"] },
    { name: "Финский залив",      lat: 59.7, lon: 25.0,  rLat: 1.0, rLon: 5.0,  density: 28, types: ["cargo","tanker","passenger"] },
    { name: "Балтика — центр",    lat: 56.5, lon: 18.0,  rLat: 2.0, rLon: 5.0,  density: 30, types: ["cargo","passenger","tanker"] },
    // Чёрное море
    { name: "Чёрное море",        lat: 43.5, lon: 35.0,  rLat: 2.5, rLon: 5.0,  density: 28, types: ["cargo","tanker","passenger","military"] },
    { name: "Босфор",             lat: 41.05, lon: 29.0, rLat: 0.6, rLon: 0.8,  density: 22, types: ["cargo","tanker","passenger"] },
    // Каспий
    { name: "Каспий",             lat: 41.5, lon: 50.5,  rLat: 4.5, rLon: 2.5,  density: 16, types: ["cargo","tanker","fishing"] },
    // Мурманск / Баренцево
    { name: "Баренцево / Мурманск", lat: 69.5, lon: 35.0, rLat: 3.0, rLon: 9.0, density: 20, types: ["cargo","tanker","military","fishing"] },
    // Северный морской путь
    { name: "СМП — Карское",      lat: 73.0, lon: 65.0,  rLat: 3.0, rLon: 12.0, density: 14, types: ["cargo","tanker","fishing"] },
    { name: "СМП — Лаптевых",     lat: 75.5, lon: 125.0, rLat: 2.5, rLon: 14.0, density: 10, types: ["cargo","tanker"] },
    { name: "Чукотское / Берингово", lat: 64.0, lon: 178.0, rLat: 3.0, rLon: 10.0, density: 12, types: ["cargo","fishing","tanker"] },
    // Дальний Восток
    { name: "Японское море",      lat: 41.0, lon: 134.0, rLat: 4.5, rLon: 6.0,  density: 26, types: ["cargo","tanker","fishing","passenger"] },
    { name: "Владивосток",        lat: 43.0, lon: 132.0, rLat: 1.5, rLon: 2.5,  density: 22, types: ["cargo","tanker","military","tug"] },
    // Китай — побережье
    { name: "Жёлтое море",        lat: 36.5, lon: 122.5, rLat: 3.0, rLon: 4.0,  density: 38, types: ["cargo","tanker","fishing"] },
    { name: "Шанхай",             lat: 31.0, lon: 122.5, rLat: 2.0, rLon: 3.0,  density: 42, types: ["cargo","tanker","passenger"] },
    { name: "Южный Китай",        lat: 23.0, lon: 116.0, rLat: 4.0, rLon: 5.5,  density: 36, types: ["cargo","tanker","fishing"] },
    { name: "Тайваньский пролив", lat: 24.5, lon: 119.5, rLat: 2.5, rLon: 2.0,  density: 26, types: ["cargo","tanker","fishing"] },
    { name: "Гонконг — устье",    lat: 22.4, lon: 114.0, rLat: 1.0, rLon: 1.5,  density: 28, types: ["cargo","passenger","tug"] },
    // Юго-Восточная Азия
    { name: "Малаккский пролив",  lat:  3.0, lon: 101.5, rLat: 2.0, rLon: 4.0,  density: 32, types: ["cargo","tanker"] },
    { name: "Сингапур",           lat:  1.3, lon: 103.9, rLat: 0.6, rLon: 1.0,  density: 24, types: ["cargo","tanker","passenger"] },
    // СНГ — Каспий + Чёрное море уже выше
    { name: "Азовское море",      lat: 46.0, lon: 36.5,  rLat: 1.5, rLon: 2.0,  density: 14, types: ["cargo","fishing","tug"] },
    // Дополнительно — Северное море
    { name: "Северное море",      lat: 56.0, lon: 4.5,   rLat: 4.0, rLon: 4.5,  density: 22, types: ["cargo","tanker","fishing"] },
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
        zone: z.name,
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

/** Сдвинуть корабль вперёд по курсу за `minutes` минут. */
function advance(ship, minutes) {
  const dist_nm = (ship.speed * minutes) / 60;       // морских миль
  const dist_deg = dist_nm / 60;                      // 1 mile ≈ 1/60°
  const course = (ship.course * Math.PI) / 180;
  const dLat = dist_deg * Math.cos(course);
  const dLon = (dist_deg * Math.sin(course)) / Math.max(0.05, Math.cos((ship.lat * Math.PI) / 180));
  return { lat: ship.lat + dLat, lon: ship.lon + dLon };
}

const FLEET = buildShipFleet();

export default function ShipsPage() {
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
    <div className="app-body">
      <GuideBanner id="ais-intro">
        <strong>AIS-карта.</strong> Здесь показаны суда, которые мы видим через
        приёмник AIS-сигналов в зонах активного судоходства (Россия, СНГ, Китай,
        ЮВА). Кликните по корме корабля, чтобы увидеть последний принятый AIS-пакет
        с координатами, скоростью и качеством сигнала. Используйте бегунок
        времени, чтобы посмотреть, как двигались корабли в течение последних
        6 часов.
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
          <span className="card-title">AIS Vessel Tracking — 2D Карта</span>
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
    </div>
  );
}
