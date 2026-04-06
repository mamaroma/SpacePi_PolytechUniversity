import React, { useMemo, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  Circle,
  CircleMarker,
  AttributionControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ─── Fix default marker icons broken by Vite's asset pipeline ─
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon   from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl:       markerIcon,
  shadowUrl:     markerShadow,
});

// ─── 🛰 Satellite DivIcon ──────────────────────────────────────
const SAT_ICON = L.divIcon({
  html: `<div class="sat-div-icon">🛰</div>`,
  className: "",
  iconSize:   [34, 34],
  iconAnchor: [17, 17],
  popupAnchor:[0, -20],
});

const POLYTECH_COORDS = {
  lat: 60.01,
  lon: 30.38,
};

const POLYTECH_ICON = L.icon({
  iconUrl: "/spbpu-logo.png",
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -20],
  className: "polytech-logo-icon",
});

// ─── Helpers ───────────────────────────────────────────────────
function validLL(lat, lon) {
  if (lat == null || lon == null) return false;
  const la = Number(lat), lo = Number(lon);
  return Number.isFinite(la) && Number.isFinite(lo)
    && la >= -90 && la <= 90 && lo >= -180 && lo <= 180;
}

/** Split a [lat,lon][] polyline into segments at antimeridian crossings */
function splitDateline(pts) {
  const segs = [];
  let cur = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && Math.abs(pts[i][1] - pts[i - 1][1]) > 180) {
      if (cur.length >= 2) segs.push(cur);
      cur = [];
    }
    cur.push(pts[i]);
  }
  if (cur.length >= 2) segs.push(cur);
  return segs;
}

// ─── Coverage radius ───────────────────────────────────────────
// LEO ~500 km altitude, ~10° elevation mask → ~2 200 km ground radius
const COVERAGE_M = 2_200_000;

// ─── Component ────────────────────────────────────────────────
export default function MapCard({ receivedPoints, orbitTrack, orbitCurrent, multiOrbitData = {}, mapSats = new Set(), fleetColorMap = {} }) {
  const [showCoverage, setShowCoverage] = useState(true);

  // Received TinyGS points (sampled for perf)
  const rx = useMemo(() => {
    const cleaned = (receivedPoints ?? [])
      .filter(p => validLL(p.lat, p.lon))
      .map(p => ({ ...p, lat: Number(p.lat), lon: Number(p.lon) }));
    if (cleaned.length <= 400) return cleaned;
    const step = Math.ceil(cleaned.length / 400);
    return cleaned.filter((_, i) => i % step === 0);
  }, [receivedPoints]);

  // Current satellite position
  const current = useMemo(() => {
    if (!orbitCurrent || !validLL(orbitCurrent.lat, orbitCurrent.lon)) return null;
    return {
      lat:    Number(orbitCurrent.lat),
      lon:    Number(orbitCurrent.lon),
      ts_utc: orbitCurrent.ts_utc,
    };
  }, [orbitCurrent]);

  // Past (red) / Future (cyan dashed) orbit segments, split at antimeridian
  const { pastSegs, futureSegs } = useMemo(() => {
    const track = (orbitTrack ?? []).filter(p => validLL(p.lat, p.lon));
    if (!track.length) return { pastSegs: [], futureSegs: [] };

    // Find split index = point closest to current ts
    const curMs = current?.ts_utc ? new Date(current.ts_utc).getTime() : null;
    let splitIdx = track.length - 1;
    if (curMs !== null) {
      let minDt = Infinity;
      track.forEach((p, i) => {
        const dt = Math.abs(new Date(p.ts_utc).getTime() - curMs);
        if (dt < minDt) { minDt = dt; splitIdx = i; }
      });
    }

    const toLL = p => [Number(p.lat), Number(p.lon)];
    return {
      pastSegs:   splitDateline(track.slice(0, splitIdx + 1).map(toLL)),
      futureSegs: splitDateline(track.slice(splitIdx).map(toLL)),
    };
  }, [orbitTrack, current]);

  // Map initial center & zoom
  const center = useMemo(() => {
    if (current) return [current.lat, current.lon];
    const t = orbitTrack ?? [];
    if (t.length) {
      const mid = t[Math.floor(t.length / 2)];
      if (validLL(mid.lat, mid.lon)) return [Number(mid.lat), Number(mid.lon)];
    }
    return [20, 0];
  }, [current, orbitTrack]);

  const zoom = (current || (orbitTrack?.length ?? 0) > 0) ? 3 : 2;

  return (
    <div className="globe-card">
      {/* Inject satellite icon animation + leaflet dark override */}
      <style>{`
        .sat-div-icon {
          font-size: 26px;
          line-height: 1;
          filter: drop-shadow(0 0 6px #00ff88);
          animation: sat-glow 2s ease-in-out infinite;
          user-select: none;
        }
        .polytech-logo-icon {
          filter: drop-shadow(0 0 6px rgba(0, 255, 136, 0.5));
          border-radius: 6px;
        }
        @keyframes sat-glow {
          0%,100% { filter: drop-shadow(0 0 5px #00ff88); }
          50%      { filter: drop-shadow(0 0 14px #00ff88) drop-shadow(0 0 6px #00ff88); }
        }
        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
          background: #0d1526 !important;
          color: #dce8ff !important;
          border: 1px solid #2d4066 !important;
          border-radius: 8px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,.6) !important;
        }
        .leaflet-popup-content { margin: 10px 14px !important; }
        .leaflet-control-zoom a {
          background: #0d1526 !important;
          color: #7090b8 !important;
          border-color: #1e2d4a !important;
        }
        .leaflet-control-zoom a:hover { color: #dce8ff !important; }
        .leaflet-container { background: #060b18 !important; }
        .leaflet-control-attribution {
          background: rgba(13,21,38,.75) !important;
          color: #4a6080 !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: #5a8ab5 !important; }
      `}</style>

      <div className="card-header">
        <span className="card-title">🗺 Orbit Ground Track + Coverage</span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <label style={{
            fontSize: 11, color: "var(--text-dim)",
            display: "flex", alignItems: "center", gap: 5,
            cursor: "pointer", userSelect: "none",
          }}>
            <input
              type="checkbox"
              checked={showCoverage}
              onChange={e => setShowCoverage(e.target.checked)}
              style={{ accentColor: "var(--green)", cursor: "pointer" }}
            />
            Coverage radius
          </label>
          <span className="card-meta">
            {(pastSegs.reduce((s, g) => s + g.length, 0) +
              futureSegs.reduce((s, g) => s + g.length, 0))} orbit pts
            &nbsp;·&nbsp;{rx.length} rx pts
          </span>
        </div>
      </div>

      <div className="globe-inner" style={{ height: 540 }}>
        <MapContainer
          key={`${center[0].toFixed(2)},${center[1].toFixed(2)}`}
          center={center}
          zoom={zoom}
          style={{ width: "100%", height: "100%" }}
          zoomControl={true}
          attributionControl={false}
        >
          <AttributionControl position="bottomright" prefix={false} />

          {/* ── Dark base tiles ─────────────────────────────── */}
          <TileLayer
            attribution='&copy; <a href="https://carto.com/" target="_blank">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            maxZoom={19}
          />

          {/* ── SPbPU Polytech marker ───────────────────────────── */}
          <Marker position={[POLYTECH_COORDS.lat, POLYTECH_COORDS.lon]} icon={POLYTECH_ICON}>
            <Popup>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                <div style={{ fontWeight: 700, color: "#00ff88", marginBottom: 5 }}>
                  Pi SPbPU
                </div>
                <div>Technopolis Polytech</div>
                <div>Lat {POLYTECH_COORDS.lat.toFixed(2)}</div>
                <div>Lon {POLYTECH_COORDS.lon.toFixed(2)}</div>
              </div>
            </Popup>
          </Marker>

          {/* ── Past orbit — solid red ───────────────────────── */}
          {pastSegs.map((seg, i) => (
            <Polyline
              key={`past-${i}`}
              positions={seg}
              pathOptions={{ color: "#ff4d6a", weight: 2.2, opacity: 0.9 }}
            />
          ))}

          {/* ── Future orbit — dashed cyan ───────────────────── */}
          {futureSegs.map((seg, i) => (
            <Polyline
              key={`fut-${i}`}
              positions={seg}
              pathOptions={{
                color: "#00d4ff",
                weight: 1.5,
                opacity: 0.55,
                dashArray: "7 7",
              }}
            />
          ))}

          {/* ── Received TinyGS points ───────────────────────── */}
          {rx.map((p, idx) => (
            <CircleMarker
              key={`rx-${p.ts_utc ?? idx}`}
              center={[p.lat, p.lon]}
              radius={3.5}
              pathOptions={{
                color: "#00d4ff",
                fillColor: "#00d4ff",
                fillOpacity: 0.8,
                weight: 0,
              }}
            >
              <Popup>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                  <div style={{ fontWeight: 700, color: "#00d4ff", marginBottom: 4 }}>
                    📡 TinyGS received
                  </div>
                  <div>{new Date(p.ts_utc).toLocaleString()}</div>
                  <div>Lat {p.lat.toFixed(3)} · Lon {p.lon.toFixed(3)}</div>
                  {p.temp_c   != null && <div>Temp {p.temp_c} °C</div>}
                  {p.rssi_dbm != null && <div>RSSI {p.rssi_dbm} dBm</div>}
                  {p.snr_db   != null && <div>SNR {p.snr_db} dB</div>}
                </div>
              </Popup>
            </CircleMarker>
          ))}

          {/* ── Current satellite position ───────────────────── */}
          {current && (
            <>
              {/* Coverage circle */}
              {showCoverage && (
                <Circle
                  center={[current.lat, current.lon]}
                  radius={COVERAGE_M}
                  pathOptions={{
                    color:       "#00ff88",
                    fillColor:   "#00ff88",
                    fillOpacity: 0.06,
                    weight:      1.5,
                    opacity:     0.45,
                    dashArray:   "5 10",
                  }}
                />
              )}

              {/* 🛰 Satellite marker */}
              <Marker position={[current.lat, current.lon]} icon={SAT_ICON}>
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "#00ff88", marginBottom: 5 }}>
                      🛰 Current position
                    </div>
                    <div>{new Date(current.ts_utc).toLocaleString()}</div>
                    <div>Lat {current.lat.toFixed(3)}</div>
                    <div>Lon {current.lon.toFixed(3)}</div>
                    {showCoverage && (
                      <div style={{ marginTop: 6, color: "#7090b8" }}>
                        Coverage radius ≈ 2 200 km
                      </div>
                    )}
                  </div>
                </Popup>
              </Marker>
            </>
          )}

          {/* ── Other satellites from fleet ─────────────────────── */}
          {Object.entries(multiOrbitData).map(([satName, oData]) => {
            if (!mapSats.has(satName)) return null;
            const cur = oData?.current;
            if (!cur || !validLL(cur.lat, cur.lon)) return null;
            const color = fleetColorMap[satName] || "#aaa";
            const satTrack = (oData?.track ?? []).filter(p => validLL(p.lat, p.lon));
            const trackLL = satTrack.map(p => [Number(p.lat), Number(p.lon)]);
            const trackSegs = splitDateline(trackLL);
            const shortName = satName.replace("Polytech_Universe-", "PU-");
            const icon = L.divIcon({
              html: `<div style="font-size:20px;filter:drop-shadow(0 0 4px ${color});line-height:1;">🛰</div>`,
              className: "",
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              popupAnchor: [0, -16],
            });
            return (
              <React.Fragment key={satName}>
                {trackSegs.map((seg, i) => (
                  <Polyline
                    key={`multi-trk-${satName}-${i}`}
                    positions={seg}
                    pathOptions={{ color, weight: 1.8, opacity: 0.7 }}
                  />
                ))}
                <Marker position={[Number(cur.lat), Number(cur.lon)]} icon={icon}>
                  <Popup>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color, marginBottom: 5 }}>
                        🛰 {shortName}
                      </div>
                      <div>{new Date(cur.ts_utc).toLocaleString()}</div>
                      <div>Lat {Number(cur.lat).toFixed(3)}</div>
                      <div>Lon {Number(cur.lon).toFixed(3)}</div>
                    </div>
                  </Popup>
                </Marker>
              </React.Fragment>
            );
          })}

          {/* No data placeholder */}
          {!current && !(orbitTrack?.length) && Object.keys(multiOrbitData).length === 0 && (
            <div style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "center",
              zIndex: 500, pointerEvents: "none",
              color: "var(--text-muted)", fontSize: 13,
            }}>
              Click ⬆ Collect or wait for orbit data
            </div>
          )}
        </MapContainer>
      </div>

      {/* Legend */}
      <div style={{
        display: "flex", gap: 18, marginTop: 8,
        fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap", alignItems: "center",
      }}>
        {[...mapSats].map(s => (
          <span key={s} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: fleetColorMap[s] || "#aaa", display: "inline-block" }} />
            {s.replace("Polytech_Universe-", "PU-")}
          </span>
        ))}
        <span><span style={{ color: "#00d4ff" }}>●</span> TinyGS received</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><img src="/spbpu-logo.png" alt="SPbPU" style={{ width: 14, height: 14, borderRadius: 2 }} /> SPbPU</span>
        {showCoverage && (
          <span><span style={{ color: "#00ff88" }}>◯</span> Coverage ≈ 2 200 km</span>
        )}
      </div>
    </div>
  );
}
