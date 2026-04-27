import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, AttributionControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Hint, { GuideBanner } from "../components/Hint";

/* В палитре проекта (зелёный/оранжевый): */
const SHIP_TYPES = {
  cargo:     { color: "#f39768", label: "Cargo" },
  tanker:    { color: "#da4927", label: "Tanker" },
  passenger: { color: "#724796", label: "Passenger" },
  fishing:   { color: "#8a5ab0", label: "Fishing" },
  tug:       { color: "#6cc77b", label: "Tug" },
  military:  { color: "#a52f1a", label: "Military" },
  sailing:   { color: "#cbb98c", label: "Sailing" },
  other:     { color: "#8aa090", label: "Other" },
};

function makeShipIcon(type, course = 0, isLarge = false) {
  const color = SHIP_TYPES[type]?.color || "#8aa090";
  const size = isLarge ? 28 : 22;
  return L.divIcon({
    html: `<div style="transform:rotate(${Math.round(course)}deg);filter:drop-shadow(0 0 5px ${color});line-height:1;text-align:center;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 20h16L12 2z" stroke="#1a3220" stroke-width="0.7"/>
      </svg>
    </div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2 - 2],
  });
}

/** Детерминированный псевдо-генератор: один и тот же MMSI → одинаковая «последняя пачка». */
function seededRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Имитация AIS Class A position-report (тип 1/3): MMSI, NavStatus, ROT, SOG, COG, HDG, lat/lon. */
function buildAisPacket(s, rnd) {
  const navStatuses = ["under-way", "at-anchor", "moored", "fishing", "constrained-by-draught", "engaged-in-fishing"];
  const navStatus = navStatuses[Math.floor(rnd() * navStatuses.length)];
  const rotDegPerMin = (rnd() - 0.5) * 6;
  const heading = (s.course + (rnd() - 0.5) * 8 + 360) % 360;
  return {
    msgType: 1 + Math.floor(rnd() * 3),
    mmsi: s.mmsi,
    navStatus,
    rotDegPerMin: +rotDegPerMin.toFixed(1),
    sogKn: +(s.speed + (rnd() - 0.5) * 0.4).toFixed(1),
    cogDeg: +s.course.toFixed(1),
    headingDeg: +heading.toFixed(0),
    lat: +s.lat.toFixed(5),
    lon: +s.lon.toFixed(5),
    receivedAt: new Date(Date.now() - Math.floor(rnd() * 14 * 60 * 1000)).toISOString(),
    rssi_dbm: -(78 + Math.floor(rnd() * 22)),
    snr_db: +(2 + rnd() * 10).toFixed(1),
  };
}

const RAW_SHIPS = [
  // Северная Атлантика / Гибралтар
  { mmsi: 256787000, name: "NORDIC STAR", type: "cargo", lat: -33.365, lon: 8.315, course: 126, speed: 17.4 },
  { mmsi: 352003339, name: "ATLANTIC SPIRIT", type: "tanker", lat: -30.848, lon: 14.134, course: 142, speed: 13.5 },
  { mmsi: 372754000, name: "PACIFIC VOYAGER", type: "cargo", lat: -33.292, lon: 4.038, course: 96, speed: 11.1 },
  { mmsi: 354341000, name: "OCEAN BREEZE", type: "tanker", lat: -32.342, lon: 3.675, course: 280, speed: 12.2 },
  { mmsi: 636023327, name: "SEA GUARDIAN", type: "passenger", lat: -29.874, lon: 12.740, course: 142, speed: 12.2 },
  { mmsi: 366771000, name: "LIBERTY WAVE", type: "cargo", lat: -32.097, lon: 11.579, course: 117, speed: 17.6 },
  { mmsi: 357395000, name: "EMERALD QUEEN", type: "tanker", lat: -33.584, lon: 11.059, course: 290, speed: 12.8 },
  { mmsi: 314601000, name: "CORAL DREAM", type: "passenger", lat: -33.699, lon: 1.802, course: 95, speed: 12.6 },
  { mmsi: 477620900, name: "GOLDEN HARVEST", type: "cargo", lat: -32.038, lon: 10.457, course: 113, speed: 15.2 },
  { mmsi: 538007194, name: "SILVER MOON", type: "fishing", lat: -33.893, lon: 4.286, course: 90, speed: 11.5 },
  { mmsi: 636021561, name: "CAPE RUNNER", type: "cargo", lat: -32.135, lon: 13.325, course: 124, speed: 12.5 },
  { mmsi: 601027720, name: "ATLAS PIONEER", type: "tug", lat: -29.871, lon: 13.826, course: 324, speed: 13.7 },
  { mmsi: 477967700, name: "DRAGON PEARL", type: "tanker", lat: -32.627, lon: 16.113, course: 317, speed: 20.4 },

  // Балтика / СПб
  { mmsi: 273456780, name: "NEVA TRADER", type: "cargo", lat: 59.94, lon: 29.80, course: 270, speed: 8.2 },
  { mmsi: 273456781, name: "BALTIC FERRY", type: "passenger", lat: 59.85, lon: 28.50, course: 90, speed: 14.0 },
  { mmsi: 273456782, name: "KRONSTADT TUG", type: "tug", lat: 59.99, lon: 29.75, course: 180, speed: 5.5 },
  { mmsi: 273456783, name: "PETERHOF FISHER", type: "fishing", lat: 59.88, lon: 29.90, course: 45, speed: 4.2 },
  { mmsi: 273456784, name: "LADOGA TANKER", type: "tanker", lat: 60.05, lon: 29.50, course: 310, speed: 10.1 },
  { mmsi: 273456785, name: "AURORA SAILING", type: "sailing", lat: 59.92, lon: 30.15, course: 200, speed: 6.8 },
  { mmsi: 273456786, name: "VYBORG TRADER", type: "cargo", lat: 60.71, lon: 28.74, course: 200, speed: 9.5 },
  { mmsi: 273456787, name: "BALTIYSK PATROL", type: "military", lat: 54.65, lon: 19.91, course: 270, speed: 18.4 },

  // Балтика — порты
  { mmsi: 211456001, name: "HAMBURG EXPRESS", type: "cargo", lat: 54.15, lon: 12.10, course: 85, speed: 16.3 },
  { mmsi: 211456002, name: "KIEL PATROL", type: "military", lat: 54.33, lon: 10.15, course: 350, speed: 22.0 },
  { mmsi: 265456001, name: "STOCKHOLM LINK", type: "passenger", lat: 59.32, lon: 18.08, course: 210, speed: 18.5 },
  { mmsi: 230456001, name: "HELSINKI CARGO", type: "cargo", lat: 60.15, lon: 24.95, course: 180, speed: 12.0 },
  { mmsi: 219123001, name: "COPENHAGEN BREEZE", type: "passenger", lat: 55.69, lon: 12.59, course: 145, speed: 16.8 },
  { mmsi: 248123001, name: "MALTA STAR", type: "cargo", lat: 35.89, lon: 14.51, course: 80, speed: 14.7 },
  { mmsi: 246123001, name: "ROTTERDAM RUNNER", type: "cargo", lat: 51.90, lon: 4.07, course: 240, speed: 13.0 },
  { mmsi: 244123001, name: "AMSTERDAM TUG", type: "tug", lat: 52.45, lon: 4.55, course: 90, speed: 6.4 },
  { mmsi: 257123001, name: "OSLO PRIDE", type: "passenger", lat: 59.91, lon: 10.74, course: 175, speed: 15.2 },

  // Чёрное / Средиземное
  { mmsi: 273500001, name: "SOCHI SUNRISE", type: "passenger", lat: 43.58, lon: 39.72, course: 180, speed: 12.4 },
  { mmsi: 273500002, name: "NOVOROSSIYSK OIL", type: "tanker", lat: 44.65, lon: 37.80, course: 245, speed: 11.3 },
  { mmsi: 271111001, name: "ISTANBUL FERRY", type: "passenger", lat: 41.02, lon: 28.97, course: 90, speed: 8.1 },
  { mmsi: 247111001, name: "GENOVA CARGO", type: "cargo", lat: 44.40, lon: 8.94, course: 180, speed: 13.6 },
  { mmsi: 247111002, name: "PALERMO TANKER", type: "tanker", lat: 38.13, lon: 13.34, course: 60, speed: 11.0 },
  { mmsi: 240111001, name: "PIRAEUS TRADER", type: "cargo", lat: 37.94, lon: 23.65, course: 220, speed: 14.5 },
  { mmsi: 256111001, name: "VALLETTA FISHER", type: "fishing", lat: 35.90, lon: 14.51, course: 110, speed: 6.2 },

  // Северное море / Норвегия
  { mmsi: 257500001, name: "NORTH SEA RIG", type: "tanker", lat: 58.00, lon: 2.50, course: 90, speed: 9.0 },
  { mmsi: 257500002, name: "BERGEN STAR", type: "fishing", lat: 60.39, lon: 5.32, course: 200, speed: 5.6 },
  { mmsi: 257500003, name: "TROMSO PATROL", type: "military", lat: 69.65, lon: 18.96, course: 30, speed: 16.5 },

  // Атлантика
  { mmsi: 538777001, name: "ATLANTIC GIANT", type: "cargo", lat: 30.0, lon: -40.0, course: 70, speed: 18.4 },
  { mmsi: 538777002, name: "MID-ATLANTIC OIL", type: "tanker", lat: 25.0, lon: -55.0, course: 60, speed: 13.7 },
  { mmsi: 538777003, name: "AZORES VOYAGER", type: "passenger", lat: 38.5, lon: -28.0, course: 250, speed: 19.1 },
  { mmsi: 538777004, name: "REYKJAVIK FISHER", type: "fishing", lat: 64.13, lon: -21.95, course: 280, speed: 7.2 },

  // США / Карибы
  { mmsi: 366801001, name: "MIAMI VIBE", type: "passenger", lat: 25.77, lon: -80.13, course: 90, speed: 21.0 },
  { mmsi: 366801002, name: "GULF EXPLORER", type: "tanker", lat: 27.5, lon: -90.0, course: 180, speed: 12.2 },
  { mmsi: 366801003, name: "NY HARBOR PILOT", type: "tug", lat: 40.71, lon: -74.00, course: 270, speed: 7.5 },
  { mmsi: 366801004, name: "BOSTON CARGO", type: "cargo", lat: 42.36, lon: -71.05, course: 90, speed: 13.0 },
  { mmsi: 309000001, name: "BAHAMAS PEARL", type: "sailing", lat: 25.0, lon: -77.0, course: 110, speed: 5.5 },
  { mmsi: 235123001, name: "HAVANA CRUISE", type: "passenger", lat: 23.13, lon: -82.36, course: 320, speed: 16.2 },

  // Тихий океан / Япония / Корея
  { mmsi: 431777001, name: "TOKYO BAY EXPRESS", type: "cargo", lat: 35.55, lon: 139.78, course: 180, speed: 14.0 },
  { mmsi: 431777002, name: "OSAKA TRADER", type: "cargo", lat: 34.66, lon: 135.43, course: 90, speed: 13.0 },
  { mmsi: 440777001, name: "BUSAN STAR", type: "tanker", lat: 35.10, lon: 129.04, course: 200, speed: 12.5 },
  { mmsi: 412888001, name: "SHANGHAI GIANT", type: "cargo", lat: 31.23, lon: 121.47, course: 110, speed: 15.8 },
  { mmsi: 412888002, name: "HONG KONG FERRY", type: "passenger", lat: 22.30, lon: 114.17, course: 280, speed: 17.0 },
  { mmsi: 477888001, name: "SINGAPORE PASSAGE", type: "tanker", lat: 1.27, lon: 103.85, course: 270, speed: 13.4 },
  { mmsi: 533777001, name: "MALACCA RUNNER", type: "cargo", lat: 2.5, lon: 102.0, course: 310, speed: 14.7 },

  // Юг / Индийский / Австралия
  { mmsi: 431900001, name: "PERTH PIONEER", type: "cargo", lat: -32.05, lon: 115.74, course: 350, speed: 12.6 },
  { mmsi: 431900002, name: "SYDNEY TUG", type: "tug", lat: -33.86, lon: 151.21, course: 180, speed: 6.8 },
  { mmsi: 431900003, name: "MELBOURNE FISHER", type: "fishing", lat: -37.81, lon: 144.96, course: 90, speed: 5.4 },
  { mmsi: 432900001, name: "MUMBAI MERCHANT", type: "cargo", lat: 18.97, lon: 72.83, course: 250, speed: 12.0 },
  { mmsi: 423900001, name: "PERSIAN OIL", type: "tanker", lat: 26.0, lon: 53.0, course: 130, speed: 10.4 },
  { mmsi: 470900001, name: "DUBAI PEARL", type: "passenger", lat: 25.27, lon: 55.30, course: 270, speed: 18.5 },
  { mmsi: 503900001, name: "CAPE TOWN PATROL", type: "military", lat: -33.91, lon: 18.42, course: 180, speed: 19.2 },
  { mmsi: 503900002, name: "INDIAN OCEAN OIL", type: "tanker", lat: -10.0, lon: 80.0, course: 70, speed: 12.7 },

  // Южная Америка
  { mmsi: 710900001, name: "RIO STAR", type: "cargo", lat: -22.91, lon: -43.17, course: 30, speed: 13.5 },
  { mmsi: 710900002, name: "BUENOS AIRES TUG", type: "tug", lat: -34.61, lon: -58.38, course: 180, speed: 5.2 },
  { mmsi: 725900001, name: "VALPARAISO TRADER", type: "cargo", lat: -33.05, lon: -71.62, course: 350, speed: 13.0 },

  // Арктика
  { mmsi: 273900001, name: "MURMANSK ICE", type: "cargo", lat: 68.97, lon: 33.08, course: 350, speed: 9.7 },
  { mmsi: 273900002, name: "ARCTIC PATROL", type: "military", lat: 75.0, lon: 60.0, course: 180, speed: 14.2 },
  { mmsi: 273900003, name: "YAMAL LNG", type: "tanker", lat: 71.0, lon: 72.0, course: 90, speed: 10.5 },
];

const SHIP_TYPE_LIST = Object.keys(SHIP_TYPES);

const SHIPS = RAW_SHIPS.map((s) => {
  const seed = s.mmsi;
  const rnd = seededRng(seed);
  return { ...s, lastPacket: buildAisPacket(s, rnd) };
});

export default function ShipsPage() {
  const [visibleTypes, setVisibleTypes] = useState(new Set(SHIP_TYPE_LIST));

  const toggleType = (t) => {
    setVisibleTypes(prev => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const filtered = useMemo(
    () => SHIPS.filter(s => visibleTypes.has(s.type)),
    [visibleTypes]
  );

  return (
    <div className="app-body">
      <GuideBanner id="ais-intro">
        <strong>AIS-карта.</strong> Здесь показаны суда, которые мы видим через
        приёмник AIS-сигналов (имитация с переходом на <em>Marine Traffic</em>).
        Кликните по корме корабля, чтобы увидеть последний принятый AIS-пакет
        с координатами, скоростью и качеством сигнала.
      </GuideBanner>

      <div className="controls-card">
        <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
          <span className="ctrl-label" style={{ marginRight: 8 }}>Типы судов</span>
          <Hint text="Снимайте галочки, чтобы скрыть с карты лишние типы (танкеры, военные и т.д.)." />
          {SHIP_TYPE_LIST.map(t => (
            <label key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginRight: 12, userSelect: "none" }}>
              <input type="checkbox" checked={visibleTypes.has(t)} onChange={() => toggleType(t)} style={{ accentColor: SHIP_TYPES[t].color }} />
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: SHIP_TYPES[t].color, display: "inline-block" }} />
              {SHIP_TYPES[t].label}
            </label>
          ))}
          <div className="ctrl-spacer" />
          <span className="card-meta">{filtered.length} судов · live AIS feed (demo)</span>
        </div>
      </div>

      <div className="globe-card">
        <div className="card-header">
          <span className="card-title">AIS Vessel Tracking — 2D Карта</span>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Hint text="При наведении на корабль показывается последний принятый AIS-пакет: координаты, скорость, курс, RSSI/SNR." position="bottom" />
            <a
              href="https://www.marinetraffic.com/"
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-sm btn-primary"
            >
              ↗ MarineTraffic
            </a>
            <span className="card-meta">{filtered.length} судов</span>
          </div>
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
          <MapContainer center={[20, 15]} zoom={3} style={{ width: "100%", height: "100%" }} attributionControl={false}>
            <AttributionControl position="bottomright" prefix={false} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a> · live feed: <a href="https://www.marinetraffic.com/">MarineTraffic</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            {filtered.map(s => (
              <Marker
                key={s.mmsi}
                position={[s.lat, s.lon]}
                icon={makeShipIcon(s.type, s.course, true)}
              >
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, minWidth: 260 }}>
                    <div style={{ fontWeight: 700, color: SHIP_TYPES[s.type]?.color || "#f1ead2", marginBottom: 6, fontSize: 13 }}>
                      🚢 {s.name}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "3px 10px", marginBottom: 8 }}>
                      <span style={{ color: "#8aa090" }}>MMSI:</span><span>{s.mmsi}</span>
                      <span style={{ color: "#8aa090" }}>Тип:</span><span>{SHIP_TYPES[s.type]?.label}</span>
                      <span style={{ color: "#8aa090" }}>Скорость:</span><span>{s.speed} kn</span>
                      <span style={{ color: "#8aa090" }}>Курс:</span><span>{s.course}°</span>
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
                      Последний AIS-пакет
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "2px 10px", fontSize: 10.5 }}>
                      <span style={{ color: "#8aa090" }}>Принят:</span>
                      <span>{new Date(s.lastPacket.receivedAt).toLocaleString()}</span>
                      <span style={{ color: "#8aa090" }}>Тип сообщ.:</span>
                      <span>AIS msg {s.lastPacket.msgType} (Pos.Report)</span>
                      <span style={{ color: "#8aa090" }}>NavStatus:</span>
                      <span>{s.lastPacket.navStatus}</span>
                      <span style={{ color: "#8aa090" }}>SOG / COG:</span>
                      <span>{s.lastPacket.sogKn} kn / {s.lastPacket.cogDeg}°</span>
                      <span style={{ color: "#8aa090" }}>HDG / ROT:</span>
                      <span>{s.lastPacket.headingDeg}° / {s.lastPacket.rotDegPerMin}°/min</span>
                      <span style={{ color: "#8aa090" }}>RSSI / SNR:</span>
                      <span>{s.lastPacket.rssi_dbm} dBm · {s.lastPacket.snr_db} dB</span>
                    </div>

                    <a
                      href={`https://www.marinetraffic.com/en/ais/details/ships/mmsi:${s.mmsi}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ display: "inline-block", marginTop: 8, color: "#f39768", textDecoration: "none", fontWeight: 600 }}
                    >
                      Открыть в MarineTraffic ↗
                    </a>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>

        <div style={{
          display: "flex", flexWrap: "wrap", gap: 12,
          marginTop: 10, padding: 10,
          fontSize: 11, color: "var(--text-muted)",
          background: "rgba(86,150,91,0.06)",
          borderRadius: 8,
          border: "1px solid var(--border)",
        }}>
          <strong style={{ color: "var(--orange)", letterSpacing: 0.5 }}>Легенда:</strong>
          {SHIP_TYPE_LIST.map(t => (
            <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 10, height: 10, borderRadius: "50%", background: SHIP_TYPES[t].color, display: "inline-block" }} />
              {SHIP_TYPES[t].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
