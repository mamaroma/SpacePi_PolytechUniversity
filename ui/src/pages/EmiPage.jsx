import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, CircleMarker, Popup, Circle } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { fetchDemoEmiPackets, generateEmiDataset } from "../api";
import { GuideBanner } from "../components/Hint";

/* ─── Общая шкала интенсивности (согласована с SAT-MONITOR / ЭМИ-генератором) ─── */
function intensityFromDbm(dbm) {
  const t = Math.max(0, Math.min(1, (Number(dbm) + 110) / 88));
  return 23 + t * 7;
}
function intensityColor(v) {
  const n = (Number(v) - 23) / 7;
  if (n < 0.25) return "#5b8def";
  if (n < 0.45) return "#2ecc71";
  if (n < 0.65) return "#f1c40f";
  if (n < 0.85) return "#e67e22";
  return "#e74c3c";
}
function intensityLabel(v) {
  if (v < 24.8) return "Низкая";
  if (v < 26.2) return "Слабая";
  if (v < 27.6) return "Средняя";
  if (v < 29.0) return "Высокая";
  return "Критическая";
}
function fmtFreq(mhz) {
  if (mhz >= 1000) return `${(mhz / 1000).toFixed(3)} ГГц`;
  return `${mhz} МГц`;
}

/* Гражданские диапазоны без Wi-Fi и военных систем — те же, что у генератора. */
const BAND_RANGES = [
  { id: "all", label: "Весь спектр", from: 0, to: 100000, systems: "Все гражданские полосы ниже (без Wi-Fi и военных)" },
  { id: "vhf-air-mar", label: "VHF · 118–162 МГц", from: 118, to: 162, systems: "Авиация COM 118–137; морская УКВ / AIS 156–162" },
  { id: "vhf-ham", label: "VHF любительский · 144–146 МГц", from: 144, to: 146, systems: "Любительский 2 м, AMSAT downlink" },
  { id: "uhf-cubesat", label: "UHF CubeSat · 430–440 МГц", from: 430, to: 440, systems: "Любители 70 см; маяки CubeSat ~437 МГц; ISM 433" },
  { id: "lora-eu", label: "SRD/LoRa EU · 863–870 МГц", from: 863, to: 870, systems: "SRD868, LoRaWAN EU868, Sigfox RC1" },
  { id: "ism-915", label: "ISM · 902–928 МГц", from: 902, to: 928, systems: "LoRaWAN US915/AU915, гражданский RFID UHF" },
  { id: "gnss-l1", label: "GNSS L1 · 1550–1620 МГц", from: 1550, to: 1620, systems: "GPS L1, Galileo E1, ГЛОНАСС L1, BeiDou B1" },
];

function formatBandRange(b) {
  if (b.id === "all") return "—";
  const fmt = (mhz) => (mhz >= 1000 ? `${(mhz / 1000).toFixed(2)} ГГц` : `${mhz} МГц`);
  return `${fmt(b.from)} — ${fmt(b.to)}`;
}

function SatMonitorHeader({ subtitle, children }) {
  return (
    <div className="sat-monitor-header">
      <div className="sat-monitor-header-brand">
        <div className="sat-monitor-header-title">SAT-MONITOR</div>
        <div className="sat-monitor-header-sub">{subtitle}</div>
      </div>
      {children && <div className="sat-monitor-header-actions">{children}</div>}
    </div>
  );
}

export default function EmiPage() {
  const [tab, setTab] = useState("real");
  const [allPoints, setAllPoints] = useState([]);
  const [genZones, setGenZones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bandIdx, setBandIdx] = useState(0);
  const [minPower, setMinPower] = useState(-110);
  const [satMask, setSatMask] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [demo, gen] = await Promise.all([
          fetchDemoEmiPackets().catch(() => []),
          generateEmiDataset({ seed: 42, zones: 20, pointsPerZone: 8, days: 3 }).catch(() => null),
        ]);
        if (cancelled) return;
        setAllPoints(Array.isArray(demo) && demo.length ? demo : (gen?.packets || []));
        setGenZones(gen?.coverage_zones || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage({ type: "sat-monitor-set-mask", enabled: satMask }, "*");
  }, [satMask, tab]);

  const activeBand = BAND_RANGES[bandIdx] ?? BAND_RANGES[0];

  const filtered = useMemo(() => {
    if (!allPoints.length) return [];
    return allPoints.filter(
      (d) =>
        d.freq_mhz >= activeBand.from &&
        d.freq_mhz <= activeBand.to &&
        d.power_dbm >= minPower
    );
  }, [allPoints, activeBand, minPower]);

  const stats = useMemo(() => {
    if (!filtered.length) return { avg: 0, max: 0, critical: 0, avgInt: 0 };
    const powers = filtered.map((d) => d.power_dbm);
    const ints = filtered.map((d) => d.intensity ?? intensityFromDbm(d.power_dbm));
    return {
      avg: (powers.reduce((s, v) => s + v, 0) / powers.length).toFixed(1),
      max: Math.max(...powers),
      critical: ints.filter((v) => v >= 29).length,
      avgInt: (ints.reduce((s, v) => s + v, 0) / ints.length).toFixed(2),
    };
  }, [filtered]);

  const zoneCount = Math.max(genZones.length, 13); // архив SAT-MONITOR: 13 дней / много витков + зоны генератора

  return (
    <div className="app-body">
      <GuideBanner id="emi-intro-v3" icon={null}>
        <strong>Зачем эта страница.</strong> Карта электромагнитной обстановки по данным
        спутников Polytech Universe и ЭМИ-генератора: какие гражданские системы «светят»
        в каких полосах, где сильнее фон, как выглядит зона покрытия пролёта.
        Wi-Fi и военные диапазоны намеренно не показываем. Генератор и шкалу интенсивности
        можно разобрать в{" "}
        <Link to="/challenge" style={{ color: "var(--accent-2)" }}>Практических кейсах</Link>.
      </GuideBanner>

      <div className="emi-help-card">
        <div className="emi-help-title">Как пользоваться</div>
        <ol>
          <li><strong>Реальные данные</strong> — архивный SAT-MONITOR: теплокарта по дням и режим «Спутники + зоны».</li>
          <li>Слои дней <em>взаимоисключающие</em> с «Все дни»: нельзя накладывать сутки поверх суммы.</li>
          <li>Тумблер <em>«Маска спутников»</em> рисует контуры покрытия поверх теплокарты.</li>
          <li><strong>Демо-карта</strong> — те же полосы частот и шкала интенсивности (23…30 усл. ед.), что у генератора.</li>
        </ol>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <button className={tab === "real" ? "btn btn-primary" : "btn"} onClick={() => setTab("real")}>
          Реальные данные со спутника
        </button>
        <button className={tab === "demo" ? "btn btn-primary" : "btn"} onClick={() => setTab("demo")}>
          Демо-карта
        </button>
      </div>

      {tab === "real" && (
        <>
          <div className="metrics-row">
            <div className="metric-card col-cyan">
              <div className="metric-body">
                <div className="metric-label">Позиций спутника</div>
                <div className="metric-value">480</div>
                <div className="metric-sub">архив PU · 13 дней</div>
              </div>
            </div>
            <div className="metric-card col-yellow">
              <div className="metric-body">
                <div className="metric-label">Спектров записано</div>
                <div className="metric-value">480</div>
                <div className="metric-sub">по одной на позицию</div>
              </div>
            </div>
            <div className="metric-card col-green">
              <div className="metric-body">
                <div className="metric-label">Точек на карте</div>
                <div className="metric-value">480</div>
                <div className="metric-sub">теплокарта + контуры</div>
              </div>
            </div>
            <div className="metric-card col-red">
              <div className="metric-body">
                <div className="metric-label">Зон покрытия</div>
                <div className="metric-value">{zoneCount}</div>
                <div className="metric-sub">архив + генератор ({genZones.length || 20})</div>
              </div>
            </div>
          </div>

          <div className="globe-card sat-monitor-shell">
            <SatMonitorHeader subtitle="Спектральный анализ · ЭМ излучение · зоны покрытия">
              <label className="sat-mask-toggle">
                <input
                  type="checkbox"
                  checked={satMask}
                  onChange={(e) => setSatMask(e.target.checked)}
                />
                Маска спутников + зоны
              </label>
            </SatMonitorHeader>
            <div className="sat-monitor-frame-wrap">
              <iframe
                ref={iframeRef}
                src="/satellite_monitor.html"
                title="Satellite EMI Monitor"
                className="sat-monitor-frame"
                loading="lazy"
                onLoad={() => {
                  iframeRef.current?.contentWindow?.postMessage(
                    { type: "sat-monitor-set-mask", enabled: satMask },
                    "*"
                  );
                }}
              />
            </div>
            <div className="sat-monitor-legend-row">
              <span><span style={{ color: "#5b8def" }}>●</span> Низкая</span>
              <span><span style={{ color: "#2ecc71" }}>●</span> Слабая</span>
              <span><span style={{ color: "#f1c40f" }}>●</span> Средняя</span>
              <span><span style={{ color: "#e67e22" }}>●</span> Высокая</span>
              <span><span style={{ color: "#e74c3c" }}>●</span> Критическая</span>
              <span style={{ marginLeft: "auto" }}>Шкала 23…30 усл. ед. · источник: PU + ЭМИ-генератор</span>
            </div>
          </div>
        </>
      )}

      {tab === "demo" && (
        <>
          <div className="card emi-band-legend">
            <strong style={{ color: "var(--orange)" }}>Диапазоны и системы.</strong>{" "}
            Демо использует ту же гражданскую сетку, что и кейс «ЭМИ-генератор».
            Wi-Fi 2.4/5 ГГц и военные полосы исключены.
            <div className="emi-band-chips">
              {BAND_RANGES.filter((b) => b.id !== "all").map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`emi-band-chip${BAND_RANGES[bandIdx]?.id === b.id ? " emi-band-chip--active" : ""}`}
                  onClick={() => setBandIdx(BAND_RANGES.findIndex((x) => x.id === b.id))}
                  title={b.systems}
                >
                  {b.label}
                </button>
              ))}
            </div>
            <div className="emi-band-systems">{activeBand.systems}</div>
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
            <div className="metric-card col-green">
              <div className="metric-body">
                <div className="metric-label">Средняя интенсивность</div>
                <div className="metric-value">{stats.avgInt}</div>
                <div className="metric-sub">усл. ед. 23…30</div>
              </div>
            </div>
            <div className="metric-card col-red">
              <div className="metric-body">
                <div className="metric-label">Критических</div>
                <div className="metric-value">{stats.critical}</div>
                <div className="metric-sub">≥ 29 усл. ед.</div>
              </div>
            </div>
          </div>

          <div className="globe-card sat-monitor-shell">
            <SatMonitorHeader subtitle={`Демо-карта ЭМ-обстановки · ${filtered.length} точек`}>
              <span className="sat-monitor-header-meta">{formatBandRange(activeBand)}</span>
            </SatMonitorHeader>

            <div className="emi-demo-controls">
              <div className="emi-demo-controls-main">
                <div className="emi-demo-controls-top">
                  <span>Окно частот · {activeBand.label}</span>
                  <span>{formatBandRange(activeBand)}</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={BAND_RANGES.length - 1}
                  step={1}
                  value={bandIdx}
                  onChange={(e) => setBandIdx(Number(e.target.value))}
                  style={{ width: "100%", accentColor: "var(--orange)", height: 4 }}
                />
              </div>
              <label className="emi-demo-power">
                Мощность ≥
                <select value={minPower} onChange={(e) => setMinPower(Number(e.target.value))}>
                  <option value={-110}>все</option>
                  <option value={-90}>−90 дБм</option>
                  <option value={-70}>−70 дБм</option>
                  <option value={-50}>−50 дБм</option>
                  <option value={-30}>−30 дБм</option>
                </select>
              </label>
            </div>

            <div className="globe-inner" style={{ height: 600 }}>
              <style>{`
                .leaflet-popup-content-wrapper, .leaflet-popup-tip { background: #231c3e !important; color: #ede8f5 !important; border: 1px solid rgba(114,71,150,0.55) !important; border-radius: 8px !important; box-shadow: 0 8px 24px rgba(0,0,0,.6) !important; }
                .leaflet-popup-content { margin: 10px 14px !important; }
                .leaflet-control-zoom a { background: #1a3220 !important; color: #f1ead2 !important; border-color: #3a5e3f !important; }
                .leaflet-container { background: #0d0a18 !important; }
              `}</style>
              <MapContainer center={[30, 30]} zoom={2} style={{ width: "100%", height: "100%" }} attributionControl={false} preferCanvas={true}>
                <TileLayer
                  attribution=""
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={19}
                />
                {!loading && genZones.map((z) => (
                  <Circle
                    key={`zone-${z.id}`}
                    center={[z.lat, z.lon]}
                    radius={z.radius_km * 1000}
                    pathOptions={{
                      color: intensityColor(z.intensity),
                      weight: 1,
                      fill: false,
                      opacity: 0.35,
                    }}
                  />
                ))}
                {!loading && filtered.map((d) => {
                  const intens = d.intensity ?? intensityFromDbm(d.power_dbm);
                  const color = intensityColor(intens);
                  const r = Math.max(4, 3 + intens * 0.35);
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
                            {intensityLabel(intens)} ЭМИ · {intens.toFixed?.(2) ?? intens}
                          </div>
                          <div>Мощность: {d.power_dbm} дБм</div>
                          <div>Частота: {fmtFreq(d.freq_mhz)}</div>
                          <div>Источник: {d.source}</div>
                          {(d.systems || d.band_label) && (
                            <div style={{ marginTop: 4, color: "#cbb98c" }}>
                              {d.band_label || "Полоса"}: {d.systems || "—"}
                            </div>
                          )}
                          {d.region && <div>Регион: {d.region}</div>}
                          <div>Lat {d.lat.toFixed(3)} · Lon {d.lon.toFixed(3)}</div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
              </MapContainer>
            </div>
            <div className="sat-monitor-legend-row">
              <strong style={{ color: "var(--orange)" }}>Легенда:</strong>
              <span><span style={{ color: "#5b8def" }}>●</span> &lt; 24.8</span>
              <span><span style={{ color: "#2ecc71" }}>●</span> 24.8–26.2</span>
              <span><span style={{ color: "#f1c40f" }}>●</span> 26.2–27.6</span>
              <span><span style={{ color: "#e67e22" }}>●</span> 27.6–29.0</span>
              <span><span style={{ color: "#e74c3c" }}>●</span> ≥ 29.0</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
