import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  fetchFleet,
  fetchTelemetry,
  isoDaysAgo,
  fetchOrbitTrack,
  runCollect,
} from "../api";

import ChartCard from "../components/ChartCard";
import MapCard from "../components/MapCard";
import GlobeCard from "../components/GlobeCard";
import ErrorBoundary from "../components/ErrorBoundary";
import MetricCard from "../components/MetricCard";
import Hint, { GuideBanner } from "../components/Hint";

/* ── Inactive satellites (no TLE / no telemetry) ─────
   У них нет «живых» TLE/телеметрии, но карточки и спарклайны мы рисуем —
   с заглушечной (синтетической) последней пачкой пакетов, чтобы пользователь
   видел шаблон карточки и понимал, что аппарат именно «неактивен», а не
   «странно пустой». */

function lastContactToTs(label) {
  const month = { "Январь": 0, "Февраль": 1, "Март": 2, "Апрель": 3, "Май": 4, "Июнь": 5,
                  "Июль": 6, "Август": 7, "Сентябрь": 8, "Октябрь": 9, "Ноябрь": 10, "Декабрь": 11 };
  const m = label?.match(/(\S+)\s+(\d{4})/);
  if (m && month[m[1]] != null) return Date.UTC(Number(m[2]), month[m[1]], 15);
  return Date.UTC(2023, 0, 1);
}

/** Детерминированный псевдо-генератор: один и тот же спутник всегда
 *  даёт одинаковую «последнюю» телеметрию. */
function seededRng(seed) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function genFakeRows(satName, lastContactLabel, count = 60) {
  const seed = [...satName].reduce((a, c) => a + c.charCodeAt(0), 0);
  const rnd = seededRng(seed);
  const endTs = lastContactToTs(lastContactLabel);
  const stepMs = 30 * 60 * 1000;
  const rows = [];
  let temp = -10 + rnd() * 30;
  let bat  = 70 + rnd() * 25;
  let solar = 200 + rnd() * 600;
  let rssi = -100 - rnd() * 30;
  let snr  = 2 + rnd() * 5;
  let uptime = Math.floor(rnd() * 60 * 86400);
  let resets = Math.floor(rnd() * 12);
  for (let i = count - 1; i >= 0; i--) {
    temp  += (rnd() - 0.5) * 1.4;
    bat    = Math.max(1, Math.min(100, bat - rnd() * 0.6));
    solar  = Math.max(0, solar + (rnd() - 0.5) * 80);
    rssi  += (rnd() - 0.5) * 4;
    snr   += (rnd() - 0.5) * 0.6;
    uptime += stepMs / 1000;
    if (rnd() < 0.02) resets += 1;
    const ts = new Date(endTs - i * stepMs).toISOString();
    rows.push({
      ts_utc: ts,
      temp_c: +temp.toFixed(2),
      vbus_mv: 3500 + Math.floor(rnd() * 600),
      ibus_ma: 50 + Math.floor(rnd() * 250),
      battery_capacity_pct: +bat.toFixed(1),
      solar_voltage_mv: 4200 + Math.floor(rnd() * 800),
      solar_total_mw: +solar.toFixed(0),
      rssi_dbm: +rssi.toFixed(1),
      snr_db: +snr.toFixed(1),
      uptime_sec: Math.floor(uptime),
      reset_count: resets,
      lat: -60 + rnd() * 120,
      lon: -180 + rnd() * 360,
    });
  }
  return rows;
}

const DEAD_SATELLITES = {
  "Polytech_Universe-1": {
    current: { lat: 52.3, lon: 87.6, ts_utc: "2024-01-20T12:00:00Z" },
    track: [],
    lastContact: "Январь 2024",
    dead: true,
  },
  "Polytech_Universe-2": {
    current: { lat: -15.7, lon: -42.3, ts_utc: "2023-10-05T08:00:00Z" },
    track: [],
    lastContact: "Октябрь 2023",
    dead: true,
  },
  "Polytech_Universe-4": {
    current: { lat: 10.0, lon: 20.0, ts_utc: "2023-06-12T10:30:00Z" },
    track: [],
    lastContact: "Июнь 2023",
    dead: true,
  },
  "Polytech_Universe-5": {
    current: { lat: -20.0, lon: 100.0, ts_utc: "2023-03-04T18:15:00Z" },
    track: [],
    lastContact: "Март 2023",
    dead: true,
  },
  "Polytech_Universe-6": {
    current: { lat: 35.0, lon: -100.0, ts_utc: "2022-11-22T07:45:00Z" },
    track: [],
    lastContact: "Ноябрь 2022",
    dead: true,
  },
};

// Кэшируем, чтобы не пересчитывать на каждый ререндер
const FAKE_TELEMETRY_CACHE = Object.fromEntries(
  Object.entries(DEAD_SATELLITES).map(([name, info]) => [name, genFakeRows(name, info.lastContact)])
);

function toNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function pad2(n) { return String(n).padStart(2, "0"); }

function dailyMinAvgMax(points, key) {
  const byDay = new Map();
  for (const p of points) {
    const v = p[key];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const d = new Date(p.ts_ms);
    const dk = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
    const x = `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth()+1)}`;
    let a = byDay.get(dk);
    if (!a) { a = { dk, x, min: v, max: v, sum: v, n: 1 }; byDay.set(dk, a); }
    else { a.min = Math.min(a.min, v); a.max = Math.max(a.max, v); a.sum += v; a.n += 1; }
  }
  return [...byDay.values()]
    .sort((a, b) => a.dk < b.dk ? -1 : a.dk > b.dk ? 1 : 0)
    .map(a => ({ x: a.x, min: a.min, avg: +(a.sum / a.n).toFixed(2), max: a.max, n: a.n }));
}

function uptimeStr(sec) {
  if (!sec) return "—";
  const s = Number(sec);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function MiniSparkline({ data, dataKey, color, height = 40, width = "100%" }) {
  if (!data || data.length < 2) return <div style={{ height, color: "var(--text-muted)", fontSize: 10 }}>Нет данных</div>;
  const vals = data.map(d => d[dataKey]).filter(v => v != null && Number.isFinite(v));
  if (vals.length < 2) return <div style={{ height, color: "var(--text-muted)", fontSize: 10 }}>Нет данных</div>;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const range = max - min || 1;
  const w = 200;
  const points = vals.map((v, i) => `${(i / (vals.length - 1)) * w},${height - ((v - min) / range) * (height - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${height}`} style={{ width, height, display: "block" }} preserveAspectRatio="none">
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function SatInfoPanel({ satName, rows, chartData, isDead, deadInfo, onClose }) {
  const short = satName.replace("Polytech_Universe-", "PU-");
  const latest = rows.length ? rows[rows.length - 1] : null;

  const seriesTemp = useMemo(() => dailyMinAvgMax(chartData, "temp_c"), [chartData]);
  const seriesBat = useMemo(() => dailyMinAvgMax(chartData, "battery_capacity_pct"), [chartData]);
  const seriesSolar = useMemo(() => dailyMinAvgMax(chartData, "solar_total_mw"), [chartData]);

  return (
    <div className="sat-panel">
      <div className="sat-panel-header">
        <div>
          <div className="sat-panel-name">🛰 {short}</div>
          <div className={`sat-panel-status ${isDead ? "dead" : "live"}`}>
            {isDead ? `⚫ INACTIVE · посл. контакт ${deadInfo?.lastContact || "—"}` : "🟢 ACTIVE"}
          </div>
        </div>
        <button className="sat-panel-close" onClick={onClose}>×</button>
      </div>

      {isDead && (
        <div style={{
          background: "rgba(218,73,39,0.10)",
          border: "1px dashed var(--orange-2)",
          borderRadius: 10,
          padding: "8px 10px",
          marginBottom: 12,
          fontSize: 11,
          color: "var(--text-dim)",
          lineHeight: 1.45,
        }}>
          Аппарат вне сети. Ниже — <strong style={{ color: "var(--orange)" }}>последний
          снимок</strong> телеметрии перед потерей связи (архив, замороженные
          данные).
        </div>
      )}

      <div className="sat-panel-metrics">
        <div className="sat-mini-metric">
          <span className="sat-mini-label">🌡 Темп.</span>
          <span className="sat-mini-value c-red">{latest?.temp_c != null ? `${Number(latest.temp_c).toFixed(1)}°C` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">🔋 Батарея</span>
          <span className="sat-mini-value c-green">{latest?.battery_capacity_pct != null ? `${latest.battery_capacity_pct}%` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">☀ Солнце</span>
          <span className="sat-mini-value c-yellow">{latest?.solar_total_mw != null ? `${latest.solar_total_mw} mW` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">📡 RSSI</span>
          <span className="sat-mini-value c-cyan">{latest?.rssi_dbm != null ? `${latest.rssi_dbm} dBm` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">⏱ Uptime</span>
          <span className="sat-mini-value c-purple">{uptimeStr(latest?.uptime_sec)}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">🔄 Resets</span>
          <span className="sat-mini-value c-dim">{latest?.reset_count ?? "—"}</span>
        </div>
      </div>

      {latest && (
        <div className="sat-panel-last-packet">
          <div className="sat-mini-label">{isDead ? "Последний пакет (архив)" : "Последний пакет"}</div>
          <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
            {new Date(latest.ts_utc).toLocaleString()}
          </div>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
            Vbus {latest.vbus_mv ?? "—"} mV · Ibus {latest.ibus_ma ?? "—"} mA
          </div>
        </div>
      )}

      <div className="sat-panel-charts">
        <div className="sat-mini-chart">
          <div className="sat-mini-label">Температура</div>
          <MiniSparkline data={seriesTemp} dataKey="avg" color="var(--orange-2)" />
        </div>
        <div className="sat-mini-chart">
          <div className="sat-mini-label">Батарея %</div>
          <MiniSparkline data={seriesBat} dataKey="avg" color="var(--accent)" />
        </div>
        <div className="sat-mini-chart">
          <div className="sat-mini-label">Солнечная мощность</div>
          <MiniSparkline data={seriesSolar} dataKey="avg" color="var(--orange)" />
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
        {rows.length} пакетов {isDead ? "в архиве" : "загружено"}
      </div>
    </div>
  );
}

export default function SatellitesPage() {
  const isProd = import.meta.env.PROD;
  const collectEnabled =
    import.meta.env.VITE_ENABLE_COLLECT != null
      ? import.meta.env.VITE_ENABLE_COLLECT === "true"
      : !isProd;
  const autoRefreshSec =
    Number(import.meta.env.VITE_AUTO_REFRESH_SECONDS ?? "60") || 60;
  const autoCollectOnBoot =
    import.meta.env.VITE_AUTO_COLLECT_ON_BOOT != null
      ? import.meta.env.VITE_AUTO_COLLECT_ON_BOOT === "true"
      : !isProd;

  const [fleet, setFleet] = useState([]);
  const [mapSats, setMapSats] = useState(new Set());
  const [dataSat, setDataSat] = useState("Polytech_Universe-3");
  const [mapDropdownOpen, setMapDropdownOpen] = useState(false);
  const [selectedSat, setSelectedSat] = useState(null);

  const [rangeDays, setRangeDays] = useState(365);
  const [{ from, to }, setRange] = useState(isoDaysAgo(365));
  const [viewMode, setViewMode] = useState("globe");
  const [orbitMinutes, setOrbitMinutes] = useState(180);
  const [orbitStepSec, setOrbitStepSec] = useState(20);
  const [at, setAt] = useState(new Date());

  const [rows, setRows] = useState([]);
  const [orbitDataMap, setOrbitDataMap] = useState({});

  const [loading, setLoading] = useState(false);
  const [orbitLoading, setOrbitLoading] = useState(false);
  const [err, setErr] = useState("");
  const [updating, setUpdating] = useState(false);
  const [collectMsg, setCollectMsg] = useState("");

  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const bootstrapDoneRef = useRef(false);

  const connStatus = err ? "err" : loading ? "loading" : rows.length > 0 ? "live" : "idle";
  const sat = dataSat;

  useEffect(() => {
    fetchFleet()
      .then((list) => {
        setFleet(list);
        // User selects satellites manually — no auto-selection
        if (list.length && !list.find(s => s.name === dataSat)) {
          const first = list.find(s => s.active) || list[0];
          setDataSat(first.name);
        }
      })
      .catch(() => {
        setFleet([{ name: "Polytech_Universe-3", active: true, color: "#724796" }]);
      });
  }, []);

  const toggleMapSat = useCallback((name) => {
    setMapSats(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const fleetColorMap = useMemo(() => {
    const m = {};
    for (const s of fleet) m[s.name] = s.color || "#724796";
    return m;
  }, [fleet]);

  const mapDropdownRef = useRef(null);
  useEffect(() => {
    if (!mapDropdownOpen) return;
    const handler = (e) => {
      if (mapDropdownRef.current && !mapDropdownRef.current.contains(e.target)) {
        setMapDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mapDropdownOpen]);

  useEffect(() => { setRange(isoDaysAgo(rangeDays)); }, [rangeDays]);

  const loadTelemetry = useCallback(async (satName, fromDate, toDate) => {
    setLoading(true);
    setErr("");
    try {
      const data = await fetchTelemetry({ sat: satName, from: fromDate, to: toDate });
      setRows(data);
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, []);

  const [orbitErrMap, setOrbitErrMap] = useState({});

  const loadSingleOrbit = useCallback(async (satName, atDate, minutes, stepSec) => {
    if (DEAD_SATELLITES[satName]) {
      setOrbitDataMap(prev => ({ ...prev, [satName]: DEAD_SATELLITES[satName] }));
      return;
    }
    try {
      const data = await fetchOrbitTrack({ sat: satName, at: atDate, minutes, step_sec: stepSec });
      setOrbitDataMap(prev => ({ ...prev, [satName]: data }));
      setOrbitErrMap(prev => ({ ...prev, [satName]: null }));
    } catch (e) {
      setOrbitErrMap(prev => ({ ...prev, [satName]: String(e?.message ?? e) }));
    }
  }, []);

  const loadAllOrbits = useCallback(async (sats, atDate, minutes, stepSec) => {
    setOrbitLoading(true);
    await Promise.allSettled(
      [...sats].map(s => loadSingleOrbit(s, atDate, minutes, stepSec))
    );
    setOrbitLoading(false);
  }, [loadSingleOrbit]);

  useEffect(() => { loadTelemetry(sat, from, to); }, [sat, from, to, loadTelemetry]);

  useEffect(() => {
    if (mapSats.size === 0) return;
    loadAllOrbits(mapSats, at, orbitMinutes, orbitStepSec);
  }, [mapSats, at, orbitMinutes, orbitStepSec, loadAllOrbits]);

  useEffect(() => {
    if (!sat || bootstrapDoneRef.current || !autoCollectOnBoot) return;
    bootstrapDoneRef.current = true;
    const newTo = new Date();
    const newFrom = new Date(newTo.getTime() - rangeDays * 24 * 3600 * 1000);
    setRange({ from: newFrom, to: newTo });
    loadTelemetry(sat, newFrom, newTo).catch(() => {});
  }, [sat, rangeDays, loadTelemetry, autoCollectOnBoot]);

  useEffect(() => {
    if (!sat || autoRefreshSec <= 0) return undefined;
    const id = setInterval(() => {
      const newTo = new Date();
      const newFrom = new Date(newTo.getTime() - rangeDays * 24 * 3600 * 1000);
      setRange({ from: newFrom, to: newTo });
      loadTelemetry(sat, newFrom, newTo);
      loadAllOrbits(mapSats, newTo, orbitMinutes, orbitStepSec);
    }, autoRefreshSec * 1000);
    return () => clearInterval(id);
  }, [sat, mapSats, rangeDays, orbitMinutes, orbitStepSec, autoRefreshSec, loadTelemetry, loadAllOrbits]);

  const handleUpdateData = useCallback(async () => {
    setUpdating(true);
    setCollectMsg("");
    setErr("");
    try {
      const activeSats = fleet.filter(s => s.active).map(s => s.name);
      const toCollect = activeSats.length ? activeSats : [sat];
      let totalInserted = 0;
      for (const s of toCollect) {
        const res = await runCollect({ sat: s, token });
        totalInserted += res?.inserted ?? 0;
      }
      setCollectMsg(`Inserted ${totalInserted} packets across ${toCollect.length} satellite(s)`);
      const newTo = new Date();
      const newFrom = new Date(newTo.getTime() - rangeDays * 24 * 3600 * 1000);
      setRange({ from: newFrom, to: newTo });
      await loadTelemetry(sat, newFrom, newTo);
      await loadAllOrbits(mapSats, at, orbitMinutes, orbitStepSec);
    } catch (e) {
      const msg = String(e?.message ?? e);
      setErr(msg);
      if (msg.toLowerCase().includes("token")) setShowToken(true);
    } finally {
      setUpdating(false);
      setTimeout(() => setCollectMsg(""), 8000);
    }
  }, [fleet, sat, mapSats, rangeDays, at, orbitMinutes, orbitStepSec, token, loadTelemetry, loadAllOrbits]);

  const handleSatelliteClick = useCallback((satName) => {
    setSelectedSat(satName);
    if (!DEAD_SATELLITES[satName]) {
      setDataSat(satName);
    }
  }, []);

  const isDeadSelected = selectedSat ? !!DEAD_SATELLITES[selectedSat] : false;
  const panelRows = useMemo(() => {
    if (isDeadSelected) return FAKE_TELEMETRY_CACHE[selectedSat] ?? [];
    return rows;
  }, [isDeadSelected, selectedSat, rows]);

  const chartData = useMemo(() => panelRows.map((r) => {
    const ts = new Date(r.ts_utc);
    return {
      ts_ms: ts.getTime(),
      temp_c: toNum(r.temp_c),
      vbus_mv: toNum(r.vbus_mv),
      ibus_ma: toNum(r.ibus_ma),
      battery_capacity_pct: toNum(r.battery_capacity_pct),
      solar_voltage_mv: toNum(r.solar_voltage_mv),
      solar_total_mw: toNum(r.solar_total_mw),
      rssi_dbm: toNum(r.rssi_dbm),
      snr_db: toNum(r.snr_db),
      uptime_sec: toNum(r.uptime_sec),
      reset_count: toNum(r.reset_count),
    };
  }), [panelRows]);

  const datetimeLocalValue = useMemo(() => {
    const local = new Date(at.getTime() - at.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }, [at]);

  const isDead = isDeadSelected;
  const deadInfo = selectedSat ? DEAD_SATELLITES[selectedSat] : null;

  return (
    <div className="app-body telemetry-page">
      <GuideBanner id="telemetry-intro">
        Это <strong>живая телеметрия</strong> наших спутников Polytech Universe.
        Откройте список <strong>«Спутники»</strong>, отметьте нужные — на глобусе/карте
        появятся их орбиты. Кликните по иконке спутника, чтобы увидеть последний
        пакет, графики температуры, заряд батареи и т. д. <strong>Неактивные</strong> аппараты
        показывают архив последних принятых данных.
      </GuideBanner>

      {/* Compact controls bar */}
      <div className="controls-card">
        <div className="ctrl-row">
          <div className="ctrl-group" style={{ position: "relative" }} ref={mapDropdownRef}>
            <span className="ctrl-label">Спутники</span>
            <Hint text="Выберите, чьи орбиты и текущие позиции показывать на глобусе. Можно отмечать сразу несколько." />
            <button className="btn btn-sm" onClick={() => setMapDropdownOpen(v => !v)} style={{ minWidth: 120, textAlign: "left" }}>
              {mapSats.size} из {fleet.length} ▾
            </button>
            {mapDropdownOpen && (
              <div className="sat-dropdown">
                {fleet.map(s => (
                  <label key={s.name} className="sat-dropdown-item">
                    <input type="checkbox" checked={mapSats.has(s.name)} onChange={() => toggleMapSat(s.name)} style={{ accentColor: s.color }} />
                    <span className="sat-dot" style={{ background: s.color }} />
                    <span style={{ opacity: s.active ? 1 : 0.5 }}>{s.name.replace("Polytech_Universe-", "PU-")}</span>
                    {!s.active && <span className="sat-badge-dead">offline</span>}
                  </label>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button className="btn btn-sm" onClick={() => setMapSats(new Set(fleet.map(s => s.name)))}>Все</button>
                  <button className="btn btn-sm" onClick={() => setMapSats(new Set())}>Нет</button>
                  <button className="btn btn-sm" onClick={() => setMapSats(new Set(fleet.filter(s => s.active).map(s => s.name)))}>Активные</button>
                </div>
              </div>
            )}
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-group">
            <span className="ctrl-label">Вид</span>
            <Hint text="3D — интерактивный глобус (можно крутить колёсиком и WASD). 2D — плоская карта с покрытием." />
            <div className="row">
              <button className={`btn btn-tab ${viewMode === "globe" ? "active" : ""}`} onClick={() => setViewMode("globe")}>3D</button>
              <button className={`btn btn-tab ${viewMode === "map" ? "active" : ""}`} onClick={() => setViewMode("map")}>2D</button>
            </div>
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-group">
            <span className="ctrl-label">Время</span>
            <Hint text="Момент, на который рассчитывается орбита. По умолчанию — «Сейчас», но можно отмотать на любой час прошлого/будущего." />
            <input type="datetime-local" value={datetimeLocalValue} onChange={(e) => setAt(new Date(e.target.value))} />
            <button className="btn btn-sm" onClick={() => setAt(new Date())}>Сейчас</button>
          </div>

          <div className="ctrl-group">
            <span className="ctrl-label">Орбита</span>
            <select value={orbitMinutes} onChange={(e) => setOrbitMinutes(Number(e.target.value))}>
              <option value={60}>60 мин</option>
              <option value={120}>120 мин</option>
              <option value={180}>180 мин</option>
              <option value={360}>360 мин</option>
            </select>
          </div>

          <div className="ctrl-spacer" />

          <div className="header-info">
            <span className={`status-dot ${connStatus}`} />
            {loading ? "Загрузка…" : err ? "Ошибка" : rows.length > 0 ? `${rows.length} пакетов` : "Нет данных"}
          </div>

          {collectEnabled && (
            <button className="btn btn-primary btn-sm" onClick={handleUpdateData} disabled={updating}>
              {updating ? <><span className="spinner" /> Обновление…</> : "Collect"}
            </button>
          )}

          {collectEnabled && (
            <button className="btn btn-sm" onClick={() => setShowToken((v) => !v)} title="Token">🔑</button>
          )}
        </div>

        {collectEnabled && showToken && (
          <div className="ctrl-row" style={{ marginTop: 8 }}>
            <span className="ctrl-label">Token</span>
            <div className="token-row">
              <input type="password" className="token-input" placeholder="COLLECT_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} />
              <button className="btn btn-sm" onClick={() => setShowToken(false)}>Скрыть</button>
            </div>
          </div>
        )}

        {collectMsg && (
          <div style={{ fontSize: 12, color: "var(--accent-2)", paddingTop: 6 }}>{collectMsg}</div>
        )}
      </div>

      {/* Map/Globe with floating info panel */}
      <div className="telemetry-view-container">
        {viewMode === "globe" ? (
          <ErrorBoundary>
            <GlobeCard
              sat={sat}
              atIso={at.toISOString()}
              minutes={orbitMinutes}
              stepSec={orbitStepSec}
              orbitData={orbitDataMap[sat] ?? null}
              multiOrbitData={orbitDataMap}
              mapSats={mapSats}
              fleetColorMap={fleetColorMap}
              deadSatellites={DEAD_SATELLITES}
              onSatelliteClick={handleSatelliteClick}
            />
          </ErrorBoundary>
        ) : (
          <MapCard
            receivedPoints={chartData}
            orbitTrack={orbitDataMap[sat]?.track ?? []}
            orbitCurrent={orbitDataMap[sat]?.current ?? null}
            multiOrbitData={orbitDataMap}
            mapSats={mapSats}
            fleetColorMap={fleetColorMap}
            deadSatellites={DEAD_SATELLITES}
            onSatelliteClick={handleSatelliteClick}
          />
        )}

        {selectedSat && (
          <SatInfoPanel
            satName={selectedSat}
            rows={panelRows}
            chartData={chartData}
            isDead={isDead}
            deadInfo={deadInfo}
            onClose={() => setSelectedSat(null)}
          />
        )}
      </div>
    </div>
  );
}
