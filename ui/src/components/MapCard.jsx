import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
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

// ─── 🛰 Satellite DivIcon (cubesat-фото вместо emoji) ──────────
const CUBESAT_ICON_URL = "/cubesat-icon-256.png";

function makeCubesatIcon({ glow = "#724796", size = 64, dead = false, opacity = 1 } = {}) {
  return L.divIcon({
    html: `<div class="sat-cubesat-icon" style="
      width:${size}px;height:${size}px;line-height:1;display:flex;
      align-items:center;justify-content:center;cursor:pointer;
      opacity:${opacity};
      filter:drop-shadow(0 0 8px ${glow}) drop-shadow(0 0 14px ${glow});
    ">
      <img src="${CUBESAT_ICON_URL}" alt="cubesat" style="
        width:${size}px;height:${size}px;
        object-fit:contain;display:block;pointer-events:none;
        ${dead ? "filter: grayscale(0.5) brightness(0.7);" : ""}
      "/>
    </div>`,
    className: "",
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor:[0, -size / 2 - 2],
  });
}

const SAT_ICON = makeCubesatIcon({ glow: "#724796", size: 60 });

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

// ─── Coverage radius (depends on orbital altitude) ─────────────
const ORBIT_ALT_KM = {
  "Polytech_Universe-1": 530,
  "Polytech_Universe-2": 540,
  "Polytech_Universe-3": 565,
  "Polytech_Universe-4": 575,
  "Polytech_Universe-5": 575,
  "Polytech_Universe-6": 580,
};
function coverageMetersFor(satName) {
  const alt = ORBIT_ALT_KM[satName] ?? 565;
  // 500 km → 1900 km, 600 km → 2400 km radius
  return (1700 + (alt - 500) * 7) * 1000;
}
const COVERAGE_M_DEFAULT = 2_200_000;

// ─── Component ────────────────────────────────────────────────
export default function MapCard({ receivedPoints, orbitTrack, orbitCurrent, multiOrbitData = {}, mapSats = new Set(), fleetColorMap = {}, deadSatellites = {}, onSatelliteClick }) {
  const [showCoverage, setShowCoverage] = useState(true);
  const [nikOverlayOpen, setNikOverlayOpen] = useState(false);

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
        .sat-cubesat-icon {
          animation: sat-cubesat-glow 2.4s ease-in-out infinite;
          user-select: none;
        }
        @keyframes sat-cubesat-glow {
          0%,100% { transform: translateY(0); }
          50%     { transform: translateY(-3px); }
        }
        .polytech-logo-icon {
          filter: drop-shadow(0 0 6px rgba(55, 179, 74, 0.6));
          border-radius: 6px;
        }
        .leaflet-popup-content-wrapper,
        .leaflet-popup-tip {
          background: #1b1530 !important;
          color: #f1ead2 !important;
          border: 1px solid #724796 !important;
          border-radius: 10px !important;
          box-shadow: 0 8px 24px rgba(0,0,0,.6) !important;
        }
        .leaflet-popup-content { margin: 10px 14px !important; }
        .leaflet-control-zoom a {
          background: #1a3220 !important;
          color: #f1ead2 !important;
          border-color: #3a5e3f !important;
        }
        .leaflet-control-zoom a:hover { color: #f39768 !important; }
        .leaflet-container { background: #0d0a18 !important; }
        .leaflet-control-attribution {
          background: rgba(26,50,32,.85) !important;
          color: #8aa090 !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: #f39768 !important; }
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

          {/* ── НИК СПбПУ — клик открывает модальный оверлей (рендерится в body) ── */}
          <Marker
            position={[POLYTECH_COORDS.lat, POLYTECH_COORDS.lon]}
            icon={POLYTECH_ICON}
            eventHandlers={{ click: () => setNikOverlayOpen(true) }}
          />


          {/* ── Past orbit — solid orange ────────────────────── */}
          {pastSegs.map((seg, i) => (
            <Polyline
              key={`past-${i}`}
              positions={seg}
              pathOptions={{ color: "#da4927", weight: 2.4, opacity: 0.9 }}
            />
          ))}

          {/* ── Future orbit — dashed light orange ───────────── */}
          {futureSegs.map((seg, i) => (
            <Polyline
              key={`fut-${i}`}
              positions={seg}
              pathOptions={{
                color: "#f39768",
                weight: 1.6,
                opacity: 0.65,
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
                color: "#f39768",
                fillColor: "#f39768",
                fillOpacity: 0.85,
                weight: 0,
              }}
            >
              <Popup>
                <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                  <div style={{ fontWeight: 700, color: "#f39768", marginBottom: 4 }}>
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
              {/* Coverage circle (radius depends on satellite altitude) */}
              {showCoverage && (
                <Circle
                  center={[current.lat, current.lon]}
                  radius={coverageMetersFor("Polytech_Universe-3")}
                  pathOptions={{
                    color:       "#724796",
                    fillColor:   "#724796",
                    fillOpacity: 0.07,
                    weight:      1.5,
                    opacity:     0.55,
                    dashArray:   "5 10",
                  }}
                />
              )}

              {/* 🛰 Satellite marker */}
              <Marker
                position={[current.lat, current.lon]}
                icon={SAT_ICON}
                eventHandlers={{ click: () => onSatelliteClick?.("Polytech_Universe-3") }}
              >
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: "#724796", marginBottom: 5 }}>
                      🛰 Текущая позиция
                    </div>
                    <div>{new Date(current.ts_utc).toLocaleString()}</div>
                    <div>Lat {current.lat.toFixed(3)}</div>
                    <div>Lon {current.lon.toFixed(3)}</div>
                    <div style={{ marginTop: 6, color: "#f39768", cursor: "pointer" }}>
                      Нажмите для подробностей
                    </div>
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
            const isDead = !!deadSatellites?.[satName];
            // PU-1, PU-2, PU-6 — особая «архивная» категория: им рисуем
            // мягкое рыжее свечение полупрозрачным кружком. Остальные —
            // обычный фиолетовый купол покрытия как у живых аппаратов.
            const isWarm =
              satName === "Polytech_Universe-1" ||
              satName === "Polytech_Universe-2" ||
              satName === "Polytech_Universe-6";
            const baseColor = fleetColorMap[satName] || "#724796";
            const color = isWarm ? "#f39768" : baseColor;
            const satTrack = (oData?.track ?? []).filter(p => validLL(p.lat, p.lon));
            const trackLL = satTrack.map(p => [Number(p.lat), Number(p.lon)]);
            const trackSegs = isDead && !isWarm ? [] : splitDateline(trackLL);
            const shortName = satName.replace("Polytech_Universe-", "PU-");
            const deadInfo = deadSatellites?.[satName];
            const icon = makeCubesatIcon({
              glow: color,
              size: 52,
              dead: isDead && !isWarm,
              opacity: isDead && !isWarm ? 0.7 : 1,
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
                {/* Зона покрытия:
                   - warm-категория (PU-1/2/6) — полупрозрачное рыжее кольцо;
                   - остальные — фиолетовый купол. */}
                {showCoverage && (
                  <Circle
                    center={[Number(cur.lat), Number(cur.lon)]}
                    radius={coverageMetersFor(satName)}
                    pathOptions={{
                      color:       color,
                      fillColor:   color,
                      fillOpacity: isWarm ? 0.10 : 0.06,
                      weight:      isWarm ? 1.4 : 1.2,
                      opacity:     isWarm ? 0.55 : 0.50,
                      dashArray:   isWarm ? "6 6" : "4 8",
                    }}
                  />
                )}
                <Marker
                  position={[Number(cur.lat), Number(cur.lon)]}
                  icon={icon}
                  eventHandlers={{ click: () => onSatelliteClick?.(satName) }}
                >
                  <Popup>
                    <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                      <div style={{ fontWeight: 700, color, marginBottom: 5 }}>
                        🛰 {shortName}
                        {isDead && !isWarm && (
                          <span style={{ color: "#da4927", fontSize: 9, marginLeft: 4 }}>INACTIVE</span>
                        )}
                      </div>
                      {isDead && !isWarm ? (
                        <div style={{ color: "#cbb98c" }}>Последний контакт: {deadInfo?.lastContact || "—"}</div>
                      ) : (
                        <>
                          {cur.ts_utc && <div>{new Date(cur.ts_utc).toLocaleString()}</div>}
                          <div>Lat {Number(cur.lat).toFixed(3)}</div>
                          <div>Lon {Number(cur.lon).toFixed(3)}</div>
                        </>
                      )}
                      <div style={{ marginTop: 6, color: "#f39768", cursor: "pointer" }}>
                        Нажмите для подробностей
                      </div>
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
        <span><span style={{ color: "#f39768" }}>●</span> TinyGS received</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><img src="/spbpu-logo.png" alt="SPbPU" style={{ width: 14, height: 14, borderRadius: 2 }} /> SPbPU</span>
        {showCoverage && (
          <span><span style={{ color: "#724796" }}>◯</span> Coverage ≈ 2 200 km</span>
        )}
      </div>

      {/* Модальный оверлей карточки приёмной станции НИК (поверх шапки) */}
      {nikOverlayOpen && createPortal(
        <div
          onClick={() => setNikOverlayOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(8,5,18,0.78)",
            backdropFilter: "blur(6px)", zIndex: 100000,
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(440px, 100%)", background: "#130e22",
              border: "1px solid #724796", borderRadius: 14, overflow: "hidden",
              boxShadow: "0 24px 64px rgba(0,0,0,.85)",
              fontFamily: "'Inter', system-ui, sans-serif", color: "#ede8f5",
              animation: "nik-card-in 0.18s ease",
            }}
          >
            <button
              onClick={() => setNikOverlayOpen(false)}
              style={{
                position: "absolute", top: 12, right: 12, zIndex: 2,
                background: "rgba(19,14,34,0.85)", border: "1px solid rgba(243,151,104,0.6)",
                color: "#f39768", borderRadius: 8, width: 30, height: 30,
                cursor: "pointer", fontSize: 16, lineHeight: 1,
              }}
              aria-label="Закрыть"
            >×</button>
            <img
              src="/nik-spbpu.png" alt="НИК СПбПУ"
              style={{
                display: "block", width: "100%", height: 220, objectFit: "cover",
                borderBottom: "1px solid rgba(114,71,150,0.45)",
              }}
            />
            <div style={{ padding: "14px 18px 18px" }}>
              <div style={{ fontWeight: 700, color: "#9460b8", fontSize: 16, marginBottom: 4, letterSpacing: 0.3 }}>
                Приёмная станция НИК СПбПУ
              </div>
              <div style={{ fontSize: 12, color: "#cbb98c", marginBottom: 12, fontStyle: "italic" }}>
                Научно-исследовательский корпус СПбПУ Петра&nbsp;Великого
              </div>
              <div style={{ fontSize: 13, color: "#ede8f5", lineHeight: 1.6, marginBottom: 12 }}>
                Здесь установлена наземная LoRa-станция, которая принимает
                телеметрию и AIS-пакеты со спутников программы&nbsp;
                <strong style={{ color: "#f39768" }}>Polytech Universe</strong> в моменты пролёта
                над Санкт-Петербургом.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 12, fontFamily: "'Space Mono', monospace", color: "#c2b5d4" }}>
                <span style={{ color: "#8aa090" }}>Адрес:</span>
                <span>ул. Политехническая, 29АФ</span>
                <span style={{ color: "#8aa090" }}>Координаты:</span>
                <span>{POLYTECH_COORDS.lat.toFixed(4)}° N · {POLYTECH_COORDS.lon.toFixed(4)}° E</span>
                <span style={{ color: "#8aa090" }}>Диапазон:</span>
                <span>437.0–437.5 МГц UHF</span>
              </div>
            </div>
          </div>
          <style>{`
            @keyframes nik-card-in {
              from { opacity: 0; transform: translateY(8px) scale(0.97); }
              to   { opacity: 1; transform: translateY(0) scale(1); }
            }
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
}
