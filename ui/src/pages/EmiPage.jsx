import React, { useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, AttributionControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";

function intensityColor(dbm) {
  if (dbm >= -30) return "#da4927";   // critical — deep orange
  if (dbm >= -50) return "#f39768";   // high — light orange
  if (dbm >= -70) return "#f3cb68";   // moderate — warm gold
  if (dbm >= -90) return "#724796";   // low — purple
  return "#9460b8";                   // minimal — light purple
}

function intensityLabel(dbm) {
  if (dbm >= -30) return "Critical";
  if (dbm >= -50) return "High";
  if (dbm >= -70) return "Moderate";
  if (dbm >= -90) return "Low";
  return "Minimal";
}

const DEMO_EMI_DATA = [
  // St. Petersburg area
  { id: 1,  lat: 59.934, lon: 30.306, freq_mhz: 145.8, power_dbm: -42, source: "Industrial RF", ts: "2026-03-28T14:22:00Z" },
  { id: 2,  lat: 59.957, lon: 30.315, freq_mhz: 433.0, power_dbm: -55, source: "ISM band interference", ts: "2026-03-28T14:35:00Z" },
  { id: 3,  lat: 60.007, lon: 30.372, freq_mhz: 437.5, power_dbm: -38, source: "UHF uplink noise (near SPbPU)", ts: "2026-03-28T15:10:00Z" },
  { id: 4,  lat: 59.940, lon: 30.260, freq_mhz: 868.0, power_dbm: -65, source: "LoRa interference", ts: "2026-03-28T15:44:00Z" },
  { id: 5,  lat: 59.870, lon: 30.380, freq_mhz: 2400, power_dbm: -28, source: "WiFi / microwave leak", ts: "2026-03-28T16:02:00Z" },
  // Moscow area
  { id: 6,  lat: 55.756, lon: 37.617, freq_mhz: 145.8, power_dbm: -35, source: "VHF broadcast interference", ts: "2026-03-27T10:15:00Z" },
  { id: 7,  lat: 55.770, lon: 37.580, freq_mhz: 437.5, power_dbm: -48, source: "Satellite downlink noise", ts: "2026-03-27T10:30:00Z" },
  { id: 8,  lat: 55.730, lon: 37.650, freq_mhz: 915.0, power_dbm: -72, source: "ISM band devices", ts: "2026-03-27T11:00:00Z" },
  // Europe
  { id: 9,  lat: 52.520, lon: 13.405, freq_mhz: 433.0, power_dbm: -58, source: "Berlin ISM band", ts: "2026-03-26T08:20:00Z" },
  { id: 10, lat: 48.857, lon: 2.352,  freq_mhz: 868.0, power_dbm: -44, source: "Paris LoRa interference", ts: "2026-03-26T09:00:00Z" },
  { id: 11, lat: 51.508, lon: -0.076, freq_mhz: 2400, power_dbm: -32, source: "London 2.4 GHz congestion", ts: "2026-03-26T09:30:00Z" },
  { id: 12, lat: 59.329, lon: 18.069, freq_mhz: 437.5, power_dbm: -61, source: "Stockholm UHF noise", ts: "2026-03-25T14:15:00Z" },
  { id: 13, lat: 60.169, lon: 24.938, freq_mhz: 145.8, power_dbm: -53, source: "Helsinki VHF", ts: "2026-03-25T15:00:00Z" },
  // Asia
  { id: 14, lat: 35.682, lon: 139.759, freq_mhz: 2400, power_dbm: -25, source: "Tokyo 2.4 GHz saturation", ts: "2026-03-24T06:00:00Z" },
  { id: 15, lat: 37.566, lon: 126.978, freq_mhz: 868.0, power_dbm: -40, source: "Seoul industrial EMI", ts: "2026-03-24T07:00:00Z" },
  // Americas
  { id: 16, lat: 40.713, lon: -74.006, freq_mhz: 915.0, power_dbm: -36, source: "NYC ISM band congestion", ts: "2026-03-23T18:00:00Z" },
  { id: 17, lat: 34.052, lon: -118.244, freq_mhz: 2400, power_dbm: -30, source: "LA WiFi interference", ts: "2026-03-23T19:00:00Z" },
  { id: 18, lat: -23.551, lon: -46.634, freq_mhz: 433.0, power_dbm: -50, source: "Sao Paulo ISM", ts: "2026-03-22T12:00:00Z" },
];

const FREQ_BANDS = [...new Set(DEMO_EMI_DATA.map(d => d.freq_mhz))].sort((a, b) => a - b);

export default function EmiPage() {
  const [tab, setTab] = useState("real");
  const [selectedBands, setSelectedBands] = useState(new Set(FREQ_BANDS));
  const [minPower, setMinPower] = useState(-100);

  const toggleBand = (f) => {
    setSelectedBands(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });
  };

  const filtered = useMemo(
    () => DEMO_EMI_DATA.filter(d => selectedBands.has(d.freq_mhz) && d.power_dbm >= minPower),
    [selectedBands, minPower]
  );

  const stats = useMemo(() => {
    if (!filtered.length) return { avg: 0, max: 0, critical: 0 };
    const powers = filtered.map(d => d.power_dbm);
    return {
      avg: (powers.reduce((s, v) => s + v, 0) / powers.length).toFixed(1),
      max: Math.max(...powers),
      critical: filtered.filter(d => d.power_dbm >= -30).length,
    };
  }, [filtered]);

  return (
    <div className="app-body">

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={tab === "real" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("real")}
        >
          🛰️ Реальные данные со спутника
        </button>
        <button
          className={tab === "demo" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("demo")}
        >
          📡 Демо-карта
        </button>
      </div>

      {/* ── REAL DATA TAB ──────────────────────────────────────────────── */}
      {tab === "real" && (
        <>
          {/* Stats from satellite_complete_analysis */}
          <div className="metrics-row">
            <div className="metric-card col-cyan">
              <div className="metric-icon">🛰️</div>
              <div className="metric-body">
                <div className="metric-label">Позиций спутника</div>
                <div className="metric-value">480</div>
              </div>
            </div>
            <div className="metric-card col-yellow">
              <div className="metric-icon">📊</div>
              <div className="metric-body">
                <div className="metric-label">Спектров записано</div>
                <div className="metric-value">619</div>
              </div>
            </div>
            <div className="metric-card col-green">
              <div className="metric-icon">📍</div>
              <div className="metric-body">
                <div className="metric-label">Точек на карте</div>
                <div className="metric-value">480</div>
              </div>
            </div>
            <div className="metric-card col-red">
              <div className="metric-icon">🌍</div>
              <div className="metric-body">
                <div className="metric-label">Зон покрытия</div>
                <div className="metric-value">3</div>
                <div className="metric-sub">282.38 млн км²</div>
              </div>
            </div>
          </div>

          <div className="globe-card">
            <div className="card-header">
              <span className="card-title">Комплексный анализ спутниковых данных — ЭМ излучение</span>
              <span className="card-meta">480 измерений · тепловая карта + зоны покрытия</span>
            </div>
            <div style={{ width: "100%", height: 680, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)" }}>
              <iframe
                src="/satellite_analysis.html"
                title="Satellite EMI Analysis"
                style={{ width: "100%", height: "100%", border: "none" }}
                loading="lazy"
              />
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap", alignItems: "center" }}>
              <span><span style={{ color: "#9460b8" }}>●</span> Низкое ЭМ излучение</span>
              <span><span style={{ color: "#724796" }}>●</span> Среднее ЭМ излучение</span>
              <span><span style={{ color: "#da4927" }}>●</span> Высокое ЭМ излучение</span>
              <span style={{ marginLeft: "auto" }}>Источник: спутник Polytech Universe · данные СПбПУ</span>
            </div>
          </div>
        </>
      )}

      {/* ── DEMO TAB ───────────────────────────────────────────────────── */}
      {tab === "demo" && (
        <>
          <div className="controls-card">
            <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
              <span className="ctrl-label" style={{ marginRight: 8 }}>Frequency bands</span>
              {FREQ_BANDS.map(f => (
                <label key={f} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, cursor: "pointer", marginRight: 12, userSelect: "none" }}>
                  <input type="checkbox" checked={selectedBands.has(f)} onChange={() => toggleBand(f)} style={{ accentColor: "var(--accent)" }} />
                  {f >= 1000 ? `${(f / 1000).toFixed(1)} GHz` : `${f} MHz`}
                </label>
              ))}
              <div className="ctrl-divider" />
              <span className="ctrl-label">Min power</span>
              <select value={minPower} onChange={e => setMinPower(Number(e.target.value))} style={{ width: 90 }}>
                <option value={-100}>All</option>
                <option value={-90}>&ge; -90 dBm</option>
                <option value={-70}>&ge; -70 dBm</option>
                <option value={-50}>&ge; -50 dBm</option>
                <option value={-30}>&ge; -30 dBm</option>
              </select>
              <div className="ctrl-spacer" />
              <span className="card-meta">{filtered.length} readings (demo data)</span>
            </div>
          </div>

          <div className="metrics-row">
            <div className="metric-card col-cyan">
              <div className="metric-icon">📡</div>
              <div className="metric-body">
                <div className="metric-label">Readings</div>
                <div className="metric-value">{filtered.length}</div>
              </div>
            </div>
            <div className="metric-card col-yellow">
              <div className="metric-icon">📊</div>
              <div className="metric-body">
                <div className="metric-label">Avg Power</div>
                <div className="metric-value">{stats.avg} <span className="metric-unit">dBm</span></div>
              </div>
            </div>
            <div className="metric-card col-red">
              <div className="metric-icon">⚠</div>
              <div className="metric-body">
                <div className="metric-label">Max Power</div>
                <div className="metric-value">{stats.max} <span className="metric-unit">dBm</span></div>
              </div>
            </div>
            <div className="metric-card col-red">
              <div className="metric-icon">🔴</div>
              <div className="metric-body">
                <div className="metric-label">Critical</div>
                <div className="metric-value">{stats.critical}</div>
                <div className="metric-sub">&ge; -30 dBm</div>
              </div>
            </div>
          </div>

          <div className="globe-card">
            <div className="card-header">
              <span className="card-title">EMI Heatmap — Electromagnetic Interference</span>
              <span className="card-meta">{filtered.length} readings</span>
            </div>
            <div className="globe-inner" style={{ height: 600 }}>
              <style>{`
                .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #231c3e !important; color: #ede8f5 !important; border: 1px solid rgba(114,71,150,0.55) !important; border-radius: 8px !important; box-shadow: 0 8px 24px rgba(0,0,0,.6) !important; }
                .leaflet-popup-content { margin: 10px 14px !important; }
                .leaflet-control-zoom a { background: #1a3220 !important; color: #f1ead2 !important; border-color: #3a5e3f !important; }
                .leaflet-container { background: #0d0a18 !important; }
                .leaflet-control-attribution { background: rgba(26,50,32,.85) !important; color: #8aa090 !important; font-size: 10px !important; }
                .leaflet-control-attribution a { color: #f39768 !important; }
              `}</style>
              <MapContainer center={[50, 20]} zoom={3} style={{ width: "100%", height: "100%" }} attributionControl={false}>
                <AttributionControl position="bottomright" prefix={false} />
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={19}
                />
                {filtered.map(d => {
                  const color = intensityColor(d.power_dbm);
                  const r = Math.max(6, 18 + d.power_dbm * 0.15);
                  return (
                    <CircleMarker
                      key={d.id}
                      center={[d.lat, d.lon]}
                      radius={r}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.4, weight: 1.5, opacity: 0.8 }}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color, marginBottom: 5 }}>{intensityLabel(d.power_dbm)} EMI</div>
                          <div>Power: {d.power_dbm} dBm</div>
                          <div>Freq: {d.freq_mhz >= 1000 ? `${(d.freq_mhz / 1000).toFixed(1)} GHz` : `${d.freq_mhz} MHz`}</div>
                          <div>Source: {d.source}</div>
                          <div>Lat {d.lat.toFixed(3)} · Lon {d.lon.toFixed(3)}</div>
                          <div style={{ color: "#cbb98c", marginTop: 4 }}>{new Date(d.ts).toLocaleString()}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap", alignItems: "center" }}>
              <span><span style={{ color: "#da4927" }}>●</span> Critical (&ge; -30 dBm)</span>
              <span><span style={{ color: "#f39768" }}>●</span> High (-50…-30)</span>
              <span><span style={{ color: "#f3cb68" }}>●</span> Moderate (-70…-50)</span>
              <span><span style={{ color: "#724796" }}>●</span> Low (-90…-70)</span>
              <span><span style={{ color: "#9460b8" }}>●</span> Minimal (&lt; -90)</span>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">EMI Readings</span>
              <span className="card-meta">{filtered.length} readings</span>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Time</th><th>Lat</th><th>Lon</th><th>Freq</th><th>Power (dBm)</th><th>Level</th><th>Source</th></tr>
                </thead>
                <tbody>
                  {filtered.map(d => (
                    <tr key={d.id}>
                      <td>{new Date(d.ts).toLocaleString()}</td>
                      <td>{d.lat.toFixed(3)}</td>
                      <td>{d.lon.toFixed(3)}</td>
                      <td>{d.freq_mhz >= 1000 ? `${(d.freq_mhz / 1000).toFixed(1)} GHz` : `${d.freq_mhz} MHz`}</td>
                      <td style={{ color: intensityColor(d.power_dbm), fontFamily: "'Space Mono', monospace", fontWeight: 600 }}>{d.power_dbm}</td>
                      <td style={{ color: intensityColor(d.power_dbm) }}>{intensityLabel(d.power_dbm)}</td>
                      <td>{d.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
