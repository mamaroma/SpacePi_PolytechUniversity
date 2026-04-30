import React, { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, AttributionControl } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fetchDemoEmiPackets } from "../api";
import { GuideBanner } from "../components/Hint";

function intensityColor(dbm) {
  if (dbm >= -30) return "#da4927";
  if (dbm >= -50) return "#f39768";
  if (dbm >= -70) return "#f3cb68";
  if (dbm >= -90) return "#724796";
  return "#9460b8";
}
function intensityLabel(dbm) {
  if (dbm >= -30) return "Критический";
  if (dbm >= -50) return "Высокий";
  if (dbm >= -70) return "Средний";
  if (dbm >= -90) return "Низкий";
  return "Минимальный";
}
function fmtFreq(mhz) {
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(1)} ГГц`;
  return `${mhz} МГц`;
}

const BAND_LABELS = {
  145.8:  "VHF · 145.8 МГц (любительский)",
  433.0:  "UHF · 433 МГц (ISM)",
  437.5:  "UHF · 437.5 МГц (CubeSat)",
  868.0:  "UHF · 868 МГц (LoRa EU)",
  915.0:  "UHF · 915 МГц (LoRa US)",
  2400.0: "SHF · 2.4 ГГц (Wi-Fi / ISM)",
  5800.0: "SHF · 5.8 ГГц (Wi-Fi / Drones)",
};

export default function EmiPage() {
  const [tab, setTab] = useState("real");

  const [allPoints, setAllPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bandIdx, setBandIdx] = useState(0); // индекс активного диапазона в slider
  const [minPower, setMinPower] = useState(-110);

  useEffect(() => {
    fetchDemoEmiPackets()
      .then((d) => setAllPoints(Array.isArray(d) ? d : []))
      .catch(() => setAllPoints([]))
      .finally(() => setLoading(false));
  }, []);

  const bandsAvailable = useMemo(() => {
    const set = new Set(allPoints.map((p) => p.freq_mhz));
    return [...set].sort((a, b) => a - b);
  }, [allPoints]);

  const activeBand = bandsAvailable[bandIdx] ?? null;

  const filtered = useMemo(() => {
    if (!activeBand) return [];
    return allPoints.filter(
      (d) => d.freq_mhz === activeBand && d.power_dbm >= minPower
    );
  }, [allPoints, activeBand, minPower]);

  const stats = useMemo(() => {
    if (!filtered.length) return { avg: 0, max: 0, critical: 0 };
    const powers = filtered.map((d) => d.power_dbm);
    return {
      avg: (powers.reduce((s, v) => s + v, 0) / powers.length).toFixed(1),
      max: Math.max(...powers),
      critical: filtered.filter((d) => d.power_dbm >= -30).length,
    };
  }, [filtered]);

  return (
    <div className="app-body">
      <GuideBanner id="emi-intro">
        <strong>Электромагнитная обстановка.</strong>{" "}
        В разделе показана карта сильных источников ЭМИ и зоны радиочастотной
        активности. Реальные данные собирает спутник Polytech Universe-3,
        демо-точки лежат в разделе <em>«Хранилище → демоЭМИ»</em>.
      </GuideBanner>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          className={tab === "real" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("real")}
        >
          Реальные данные со спутника
        </button>
        <button
          className={tab === "demo" ? "btn btn-primary" : "btn"}
          onClick={() => setTab("demo")}
        >
          Демо-карта
        </button>
      </div>

      {/* ── REAL DATA TAB ──────────────────────────────────────────── */}
      {tab === "real" && (
        <>
          <div className="metrics-row">
            <div className="metric-card col-cyan">
              <div className="metric-body">
                <div className="metric-label">Позиций спутника</div>
                <div className="metric-value">480</div>
                <div className="metric-sub">архивные данные</div>
              </div>
            </div>
            <div className="metric-card col-yellow">
              <div className="metric-body">
                <div className="metric-label">Спектров записано</div>
                <div className="metric-value">619</div>
                <div className="metric-sub">архивные данные</div>
              </div>
            </div>
            <div className="metric-card col-green">
              <div className="metric-body">
                <div className="metric-label">Точек на карте</div>
                <div className="metric-value">480</div>
                <div className="metric-sub">архивные данные</div>
              </div>
            </div>
            <div className="metric-card col-red">
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
              <span className="card-meta">архивные данные · тепловая карта + зоны покрытия</span>
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
              <span><span style={{ color: "#9460b8" }}>●</span> Низкий уровень ЭМИ</span>
              <span><span style={{ color: "#724796" }}>●</span> Средний уровень ЭМИ</span>
              <span><span style={{ color: "#da4927" }}>●</span> Высокий уровень ЭМИ</span>
              <span style={{ marginLeft: "auto" }}>Источник: спутник Polytech Universe · СПбПУ · архивные данные</span>
            </div>
          </div>
        </>
      )}

      {/* ── DEMO TAB ───────────────────────────────────────────────── */}
      {tab === "demo" && (
        <>
          <div className="card" style={{ marginBottom: 12, padding: "12px 16px", borderColor: "rgba(243,151,104,0.45)" }}>
            <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>
              <strong style={{ color: "var(--orange)" }}>О демо-карте.</strong>{" "}
              Это синтетический набор точек, имитирующий карту электромагнитной
              обстановки по миру. Используется для отладки UI и образовательных
              задач. Реальные пакеты данных лежат в разделе{" "}
              <a href="/storage" style={{ color: "var(--accent-2)" }}>«Хранилище → демоЭМИ»</a>{" "}
              в формате <code style={{ background: "var(--surface-2)", padding: "1px 6px", borderRadius: 4 }}>
                demo_emi_packets.json
              </code>. Каждая точка несёт частоту, мощность приёма (дБм),
              предполагаемый источник, координаты и метку времени.
            </div>
          </div>

          <div className="controls-card">
            <div className="ctrl-row" style={{ alignItems: "center", flexWrap: "wrap" }}>
              <span className="ctrl-label">Диапазон</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, bandsAvailable.length - 1)}
                value={bandIdx}
                onChange={(e) => setBandIdx(Number(e.target.value))}
                style={{ flex: 1, minWidth: 240, accentColor: "var(--orange)" }}
              />
              <span style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "var(--orange)" }}>
                {activeBand ? (BAND_LABELS[activeBand] || `${activeBand} МГц`) : "—"}
              </span>
            </div>
            <div className="ctrl-row" style={{ flexWrap: "wrap" }}>
              <span className="ctrl-label">Минимальная мощность приёма</span>
              <select value={minPower} onChange={(e) => setMinPower(Number(e.target.value))} style={{ width: 120 }}>
                <option value={-110}>Все</option>
                <option value={-90}>≥ −90 дБм</option>
                <option value={-70}>≥ −70 дБм</option>
                <option value={-50}>≥ −50 дБм</option>
                <option value={-30}>≥ −30 дБм</option>
              </select>
              <div className="ctrl-spacer" />
              <span className="card-meta">{filtered.length} точек · демо-данные</span>
            </div>
          </div>

          <div className="metrics-row">
            <div className="metric-card col-cyan">
              <div className="metric-body">
                <div className="metric-label">Точек на диапазоне</div>
                <div className="metric-value">{filtered.length}</div>
              </div>
            </div>
            <div className="metric-card col-yellow">
              <div className="metric-body">
                <div className="metric-label">Средняя мощность</div>
                <div className="metric-value">{stats.avg} <span className="metric-unit">дБм</span></div>
              </div>
            </div>
            <div className="metric-card col-red">
              <div className="metric-body">
                <div className="metric-label">Максимальная мощность</div>
                <div className="metric-value">{stats.max} <span className="metric-unit">дБм</span></div>
              </div>
            </div>
            <div className="metric-card col-red">
              <div className="metric-body">
                <div className="metric-label">Критических зон</div>
                <div className="metric-value">{stats.critical}</div>
                <div className="metric-sub">≥ −30 дБм</div>
              </div>
            </div>
          </div>

          <div className="globe-card">
            <div className="card-header">
              <span className="card-title">Карта ЭМ-обстановки — тепловая карта</span>
              <span className="card-meta">{filtered.length} точек</span>
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
              <MapContainer center={[30, 30]} zoom={2} style={{ width: "100%", height: "100%" }} attributionControl={false} preferCanvas={true}>
                <AttributionControl position="bottomright" prefix={false} />
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a> &amp; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={19}
                />
                {!loading && filtered.map((d) => {
                  const color = intensityColor(d.power_dbm);
                  const r = Math.max(4, 14 + d.power_dbm * 0.12);
                  return (
                    <CircleMarker
                      key={d.id}
                      center={[d.lat, d.lon]}
                      radius={r}
                      pathOptions={{ color, fillColor: color, fillOpacity: 0.45, weight: 1, opacity: 0.85 }}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11 }}>
                          <div style={{ fontWeight: 700, color, marginBottom: 5 }}>
                            {intensityLabel(d.power_dbm)} ЭМИ
                          </div>
                          <div>Мощность: {d.power_dbm} дБм</div>
                          <div>Частота: {fmtFreq(d.freq_mhz)}</div>
                          <div>Источник: {d.source}</div>
                          {d.region && <div>Регион: {d.region}</div>}
                          <div>Lat {d.lat.toFixed(3)} · Lon {d.lon.toFixed(3)}</div>
                          <div style={{ color: "#cbb98c", marginTop: 4 }}>{new Date(d.ts).toLocaleString("ru")}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>
            <div style={{ display: "flex", gap: 18, marginTop: 8, fontSize: 11, color: "var(--text-muted)", flexWrap: "wrap", alignItems: "center" }}>
              <strong style={{ color: "var(--orange)", letterSpacing: 0.5 }}>Легенда:</strong>
              <span><span style={{ color: "#da4927" }}>●</span> Критический (≥ −30 дБм)</span>
              <span><span style={{ color: "#f39768" }}>●</span> Высокий (от −50 до −30)</span>
              <span><span style={{ color: "#f3cb68" }}>●</span> Средний (от −70 до −50)</span>
              <span><span style={{ color: "#724796" }}>●</span> Низкий (от −90 до −70)</span>
              <span><span style={{ color: "#9460b8" }}>●</span> Минимальный (&lt; −90)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
