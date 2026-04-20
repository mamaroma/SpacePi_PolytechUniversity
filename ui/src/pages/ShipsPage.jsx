import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, AttributionControl } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const SHIP_TYPES = {
  cargo:     { color: "#ffa63a", label: "Cargo" },
  tanker:    { color: "#ff4d6a", label: "Tanker" },
  passenger: { color: "#00d4ff", label: "Passenger" },
  fishing:   { color: "#00ff88", label: "Fishing" },
  tug:       { color: "#c084fc", label: "Tug" },
  military:  { color: "#ef4444", label: "Military" },
  sailing:   { color: "#38bdf8", label: "Sailing" },
  other:     { color: "#9ca3af", label: "Other" },
};

function typeFromCode(code) {
  const c = Number(code);
  if (c >= 70 && c <= 79) return "cargo";
  if (c >= 80 && c <= 89) return "tanker";
  if (c >= 60 && c <= 69) return "passenger";
  if (c === 30) return "fishing";
  if ([21, 22, 31, 32, 52].includes(c)) return "tug";
  if (c === 35) return "military";
  if (c === 36 || c === 37) return "sailing";
  return "other";
}

function makeShipIcon(type, course = 0) {
  const color = SHIP_TYPES[type]?.color || "#9ca3af";
  return L.divIcon({
    html: `<div style="transform:rotate(${Math.round(course)}deg);font-size:18px;filter:drop-shadow(0 0 3px ${color});line-height:1;text-align:center;">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 20h16L12 2z"/>
      </svg>
    </div>`,
    className: "",
    iconSize: [18, 18],
    iconAnchor: [9, 9],
    popupAnchor: [0, -12],
  });
}

const DEMO_SHIPS = [
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
  // Baltic / SPb area ships
  { mmsi: 273456780, name: "NEVA TRADER", type: "cargo", lat: 59.94, lon: 29.80, course: 270, speed: 8.2 },
  { mmsi: 273456781, name: "BALTIC FERRY", type: "passenger", lat: 59.85, lon: 28.50, course: 90, speed: 14.0 },
  { mmsi: 273456782, name: "KRONSTADT TUG", type: "tug", lat: 59.99, lon: 29.75, course: 180, speed: 5.5 },
  { mmsi: 273456783, name: "PETERHOF FISHER", type: "fishing", lat: 59.88, lon: 29.90, course: 45, speed: 4.2 },
  { mmsi: 273456784, name: "LADOGA TANKER", type: "tanker", lat: 60.05, lon: 29.50, course: 310, speed: 10.1 },
  { mmsi: 273456785, name: "AURORA SAILING", type: "sailing", lat: 59.92, lon: 30.15, course: 200, speed: 6.8 },
  { mmsi: 211456001, name: "HAMBURG EXPRESS", type: "cargo", lat: 54.15, lon: 12.10, course: 85, speed: 16.3 },
  { mmsi: 211456002, name: "KIEL PATROL", type: "military", lat: 54.33, lon: 10.15, course: 350, speed: 22.0 },
  { mmsi: 265456001, name: "STOCKHOLM LINK", type: "passenger", lat: 59.32, lon: 18.08, course: 210, speed: 18.5 },
  { mmsi: 230456001, name: "HELSINKI CARGO", type: "cargo", lat: 60.15, lon: 24.95, course: 180, speed: 12.0 },
];

const SHIP_TYPE_LIST = Object.keys(SHIP_TYPES);

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
    () => DEMO_SHIPS.filter(s => visibleTypes.has(s.type)),
    [visibleTypes]
  );

  return (
    <div className="app-body">
      <div className="controls-card">
        <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
          <span className="ctrl-label" style={{ marginRight: 8 }}>Ship types</span>
          {SHIP_TYPE_LIST.map(t => (
            <label key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginRight: 12, userSelect: "none" }}>
              <input type="checkbox" checked={visibleTypes.has(t)} onChange={() => toggleType(t)} style={{ accentColor: SHIP_TYPES[t].color }} />
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: SHIP_TYPES[t].color, display: "inline-block" }} />
              {SHIP_TYPES[t].label}
            </label>
          ))}
          <div className="ctrl-spacer" />
          <span className="card-meta">{filtered.length} vessels (AIS demo data)</span>
        </div>
      </div>

      <div className="globe-card">
        <div className="card-header">
          <span className="card-title">AIS Vessel Tracking — 2D Map</span>
          <span className="card-meta">{filtered.length} vessels shown</span>
        </div>
        <div className="globe-inner" style={{ height: 600 }}>
          <style>{`
            .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #0d1526 !important; color: #dce8ff !important; border: 1px solid #2d4066 !important; border-radius: 8px !important; box-shadow: 0 8px 24px rgba(0,0,0,.6) !important; }
            .leaflet-popup-content { margin: 10px 14px !important; }
            .leaflet-control-zoom a { background: #0d1526 !important; color: #7090b8 !important; border-color: #1e2d4a !important; }
            .leaflet-container { background: #060b18 !important; }
            .leaflet-control-attribution { background: rgba(13,21,38,.75) !important; color: #4a6080 !important; font-size: 10px !important; }
            .leaflet-control-attribution a { color: #5a8ab5 !important; }
          `}</style>
          <MapContainer center={[10, 15]} zoom={3} style={{ width: "100%", height: "100%" }} attributionControl={false}>
            <AttributionControl position="bottomright" prefix={false} />
            <TileLayer
              attribution='&copy; <a href="https://carto.com/">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
            {filtered.map(s => (
              <Marker key={s.mmsi} position={[s.lat, s.lon]} icon={makeShipIcon(s.type, s.course)}>
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: SHIP_TYPES[s.type]?.color || "#fff", marginBottom: 5 }}>{s.name}</div>
                    <div>MMSI: {s.mmsi}</div>
                    <div>Type: {SHIP_TYPES[s.type]?.label}</div>
                    <div>Speed: {s.speed} kn</div>
                    <div>Course: {s.course}°</div>
                    <div>Lat {s.lat.toFixed(3)} · Lon {s.lon.toFixed(3)}</div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </div>

      {/* Ships table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Vessel List</span>
          <span className="card-meta">{filtered.length} vessels</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>MMSI</th><th>Name</th><th>Type</th><th>Lat</th><th>Lon</th><th>Speed (kn)</th><th>Course</th></tr>
            </thead>
            <tbody>
              {filtered.map(s => (
                <tr key={s.mmsi}>
                  <td className="mono">{s.mmsi}</td>
                  <td style={{ color: SHIP_TYPES[s.type]?.color, fontWeight: 600 }}>{s.name}</td>
                  <td>{SHIP_TYPES[s.type]?.label}</td>
                  <td>{s.lat.toFixed(3)}</td>
                  <td>{s.lon.toFixed(3)}</td>
                  <td>{s.speed}</td>
                  <td>{s.course}°</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
