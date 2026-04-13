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

function toNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}
function pad2(n) { return String(n).padStart(2, "0"); }

function fmtUtc(d) {
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth()+1)}.${d.getUTCFullYear()} `
       + `${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())} UTC`;
}
function fmtDayMonth(tsMs) {
  const d = new Date(tsMs);
  return `${pad2(d.getUTCDate())}.${pad2(d.getUTCMonth()+1)}`;
}

function dailyMinAvgMax(points, key) {
  const byDay = new Map();
  for (const p of points) {
    const v = p[key];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const d = new Date(p.ts_ms);
    const dk = `${d.getUTCFullYear()}-${pad2(d.getUTCMonth()+1)}-${pad2(d.getUTCDate())}`;
    let a = byDay.get(dk);
    if (!a) { a = { dk, x: fmtDayMonth(p.ts_ms), min: v, max: v, sum: v, n: 1 }; byDay.set(dk, a); }
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
  const [mapSats, setMapSats] = useState(new Set(["Polytech_Universe-3"]));
  const [dataSat, setDataSat] = useState("Polytech_Universe-3");
  const [mapDropdownOpen, setMapDropdownOpen] = useState(false);

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
  const [orbitErr, setOrbitErr] = useState("");
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
        const activeNames = new Set(list.filter(s => s.active).map(s => s.name));
        setMapSats(activeNames);
        if (list.length && !list.find(s => s.name === dataSat)) {
          const first = list.find(s => s.active) || list[0];
          setDataSat(first.name);
        }
      })
      .catch(() => {
        setFleet([{ name: "Polytech_Universe-3", active: true, color: "#00ff88" }]);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    for (const s of fleet) m[s.name] = s.color || "#00ff88";
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
    setOrbitErr("");
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

  const chartData = useMemo(() => rows.map((r) => {
    const ts = new Date(r.ts_utc);
    return {
      t: ts.toLocaleString(),
      ts_ms: ts.getTime(),
      ts_utc: r.ts_utc,
      lat: toNum(r.tle_lat),
      lon: toNum(r.tle_lon),
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
  }), [rows]);

  const seriesTemp     = useMemo(() => dailyMinAvgMax(chartData, "temp_c"), [chartData]);
  const seriesBatCap   = useMemo(() => dailyMinAvgMax(chartData, "battery_capacity_pct"), [chartData]);
  const seriesBatV     = useMemo(() => dailyMinAvgMax(chartData, "vbus_mv"), [chartData]);
  const seriesSolarPow = useMemo(() => dailyMinAvgMax(chartData, "solar_total_mw"), [chartData]);
  const seriesSolarV   = useMemo(() => dailyMinAvgMax(chartData, "solar_voltage_mv"), [chartData]);

  const latest = useMemo(() => (rows.length ? rows[rows.length - 1] : null), [rows]);

  const datetimeLocalValue = useMemo(() => {
    const local = new Date(at.getTime() - at.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }, [at]);

  const tableRows = useMemo(() => [...rows].slice(-80).reverse(), [rows]);

  return (
    <div className="app-body">
      {/* Satellite controls bar */}
      <div className="controls-card">
        <div className="ctrl-row">
          <div className="ctrl-group" style={{ position: "relative" }} ref={mapDropdownRef}>
            <span className="ctrl-label">Map satellites</span>
            <button className="btn btn-sm" onClick={() => setMapDropdownOpen(v => !v)} style={{ minWidth: 130, textAlign: "left" }}>
              {mapSats.size} of {fleet.length} ▾
            </button>
            {mapDropdownOpen && (
              <div className="sat-dropdown">
                {fleet.map(s => (
                  <label key={s.name} className="sat-dropdown-item">
                    <input type="checkbox" checked={mapSats.has(s.name)} onChange={() => toggleMapSat(s.name)} style={{ accentColor: s.color }} />
                    <span className="sat-dot" style={{ background: s.color }} />
                    <span style={{ opacity: s.active ? 1 : 0.5 }}>{s.name.replace("Polytech_Universe-", "PU-")}</span>
                    {!s.active && <span className="sat-badge-dead">inactive</span>}
                  </label>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <button className="btn btn-sm" onClick={() => setMapSats(new Set(fleet.map(s => s.name)))}>All</button>
                  <button className="btn btn-sm" onClick={() => setMapSats(new Set())}>None</button>
                  <button className="btn btn-sm" onClick={() => setMapSats(new Set(fleet.filter(s => s.active).map(s => s.name)))}>Active</button>
                </div>
              </div>
            )}
          </div>

          <div className="ctrl-group">
            <span className="ctrl-label">Data</span>
            <select value={dataSat} onChange={(e) => setDataSat(e.target.value)} style={{ minWidth: 140 }}>
              {fleet.map(s => (
                <option key={s.name} value={s.name}>{s.name.replace("Polytech_Universe-", "PU-")}{s.active ? "" : " (inactive)"}</option>
              ))}
            </select>
          </div>

          <div className="ctrl-group">
            <span className="ctrl-label">Range</span>
            <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={180}>180 days</option>
              <option value={365}>All time</option>
            </select>
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-group">
            <span className="ctrl-label">View</span>
            <div className="row">
              <button className={`btn btn-tab ${viewMode === "globe" ? "active" : ""}`} onClick={() => setViewMode("globe")}>3D Globe</button>
              <button className={`btn btn-tab ${viewMode === "map" ? "active" : ""}`} onClick={() => setViewMode("map")}>2D Map</button>
            </div>
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-group">
            <span className="ctrl-label">Date/Time</span>
            <input type="datetime-local" value={datetimeLocalValue} onChange={(e) => setAt(new Date(e.target.value))} />
            <button className="btn btn-sm" onClick={() => setAt(new Date())}>Now</button>
          </div>

          <div className="ctrl-group">
            <span className="ctrl-label">Orbit</span>
            <select value={orbitMinutes} onChange={(e) => setOrbitMinutes(Number(e.target.value))}>
              <option value={60}>60 min</option>
              <option value={120}>120 min</option>
              <option value={180}>180 min</option>
              <option value={360}>360 min</option>
            </select>
          </div>

          <div className="ctrl-spacer" />

          <div className="header-info">
            <span className={`status-dot ${connStatus}`} />
            {loading ? "Loading…" : err ? "Error" : rows.length > 0 ? `${rows.length} pkts` : "No data"}
          </div>

          {collectEnabled && (
            <button className="btn btn-primary" onClick={handleUpdateData} disabled={updating}>
              {updating ? <><span className="spinner" /> Updating…</> : "Collect"}
            </button>
          )}

          {collectEnabled && (
            <button className="btn btn-sm" onClick={() => setShowToken((v) => !v)} title="Configure collect token">🔑</button>
          )}
        </div>

        {collectEnabled && showToken && (
          <div className="ctrl-row" style={{ marginTop: 8 }}>
            <span className="ctrl-label">Token</span>
            <div className="token-row">
              <input type="password" className="token-input" placeholder="COLLECT_TOKEN" value={token} onChange={(e) => setToken(e.target.value)} />
              <button className="btn btn-sm" onClick={() => setShowToken(false)}>Hide</button>
            </div>
          </div>
        )}

        <div className="status-row">
          <span className="status-item">
            <span className={`status-dot ${loading ? "loading" : err ? "err" : "live"}`} />
            <span className="lbl">Telemetry:</span>
            <span className="val">{loading ? "loading…" : err ? `error: ${err}` : `${rows.length} packets`}</span>
          </span>
          <span className="status-item">
            <span className={`status-dot ${orbitLoading ? "loading" : Object.values(orbitDataMap).some(d => d?.track?.length) ? "live" : "idle"}`} />
            <span className="lbl">Orbit:</span>
            <span className="val">
              {orbitLoading ? "loading…" : `${Object.values(orbitDataMap).filter(d => d?.track?.length).length}/${mapSats.size} sat(s)`}
            </span>
          </span>
          {collectMsg && <span style={{ fontSize: 12, color: "var(--green)" }}>{collectMsg}</span>}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="metrics-row">
        <MetricCard icon="🌡" label="Temperature" value={latest?.temp_c} unit="°C" color="col-red" decimals={1} sub={latest ? new Date(latest.ts_utc).toLocaleString() : "No data"} />
        <MetricCard icon="🔋" label="Battery" value={latest?.battery_capacity_pct} unit="%" color="col-green" decimals={0} sub={latest?.vbus_mv != null ? `${latest.vbus_mv} mV` : "—"} />
        <MetricCard icon="☀" label="Solar Power" value={latest?.solar_total_mw} unit="mW" color="col-yellow" decimals={0} sub={latest?.solar_voltage_mv != null ? `${latest.solar_voltage_mv} mV` : "—"} />
        <MetricCard icon="📡" label="RSSI" value={latest?.rssi_dbm} unit="dBm" color="col-cyan" decimals={1} rssi={latest?.rssi_dbm} sub={latest?.snr_db != null ? `SNR ${latest.snr_db} dB` : "—"} />
        <MetricCard icon="⏱" label="Uptime" value={latest?.uptime_sec != null ? Math.floor(latest.uptime_sec / 3600) : null} unit="h" color="col-purple" decimals={0} sub={latest?.reset_count != null ? `Resets: ${latest.reset_count}` : "—"} />
      </div>

      {/* Latest packet banner */}
      {latest && (
        <div className="latest-banner">
          <div className="lp-item"><div className="lp-label">Last packet</div><div className="lp-val c-dim">{new Date(latest.ts_utc).toLocaleString()}</div></div>
          <div className="lp-item"><div className="lp-label">Uptime</div><div className="lp-val c-cyan">{uptimeStr(latest.uptime_sec)}</div></div>
          <div className="lp-item"><div className="lp-label">Position</div><div className="lp-val c-dim">{latest.tle_lat != null ? `${Number(latest.tle_lat).toFixed(2)}° / ${Number(latest.tle_lon).toFixed(2)}°` : "—"}</div></div>
          <div className="lp-item"><div className="lp-label">Vbus / Ibus</div><div className="lp-val c-yellow">{latest.vbus_mv ?? "—"} mV / {latest.ibus_ma ?? "—"} mA</div></div>
          <div className="lp-item"><div className="lp-label">Resets</div><div className="lp-val c-purple">{latest.reset_count ?? "—"}</div></div>
        </div>
      )}

      {/* Globe / Map */}
      {viewMode === "globe" ? (
        <ErrorBoundary>
          <GlobeCard sat={sat} atIso={at.toISOString()} minutes={orbitMinutes} stepSec={orbitStepSec} orbitData={orbitDataMap[sat] ?? null} multiOrbitData={orbitDataMap} mapSats={mapSats} fleetColorMap={fleetColorMap} />
        </ErrorBoundary>
      ) : (
        <MapCard receivedPoints={chartData} orbitTrack={orbitDataMap[sat]?.track ?? []} orbitCurrent={orbitDataMap[sat]?.current ?? null} multiOrbitData={orbitDataMap} mapSats={mapSats} fleetColorMap={fleetColorMap} />
      )}

      {/* Charts */}
      <div className="charts-grid">
        <ChartCard title="Temperature (°C)" data={seriesTemp} xKey="x" lines={[{ key: "min", name: "Min", color: "#00b3ff" }, { key: "avg", name: "Avg", color: "#00ff88" }, { key: "max", name: "Max", color: "#ff4d6a" }]} />
        <ChartCard title="Battery Capacity (%)" data={seriesBatCap} xKey="x" lines={[{ key: "min", name: "Min", color: "#00b3ff" }, { key: "avg", name: "Avg", color: "#00ff88" }, { key: "max", name: "Max", color: "#ffa63a" }]} />
        <ChartCard title="Battery Voltage (mV)" data={seriesBatV} xKey="x" lines={[{ key: "min", name: "Min", color: "#00b3ff" }, { key: "avg", name: "Avg", color: "#00ff88" }, { key: "max", name: "Max", color: "#ff4d6a" }]} />
        <ChartCard title="Solar Power (mW)" data={seriesSolarPow} xKey="x" lines={[{ key: "min", name: "Min", color: "#00b3ff" }, { key: "avg", name: "Avg", color: "#ffa63a" }, { key: "max", name: "Max", color: "#ff4d6a" }]} />
        <ChartCard title="Solar Voltage (mV)" data={seriesSolarV} xKey="x" lines={[{ key: "min", name: "Min", color: "#00b3ff" }, { key: "avg", name: "Avg", color: "#ffa63a" }, { key: "max", name: "Max", color: "#ff4d6a" }]} />
      </div>

      {/* Telemetry Table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Latest Packets</span>
          <span className="card-meta">{tableRows.length} / {rows.length} shown</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Time UTC</th><th>Lat</th><th>Lon</th><th>Temp (°C)</th><th>Vbus (mV)</th>
                <th>Ibus (mA)</th><th>Solar (mW)</th><th>RSSI (dBm)</th><th>SNR (dB)</th><th>Uptime</th><th>Resets</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.ts_utc).toLocaleString()}</td>
                  <td className={r.tle_lat == null ? "td-null" : ""}>{r.tle_lat ?? "—"}</td>
                  <td className={r.tle_lon == null ? "td-null" : ""}>{r.tle_lon ?? "—"}</td>
                  <td style={{ color: r.temp_c != null ? (r.temp_c > 40 ? "var(--red)" : r.temp_c < 0 ? "var(--accent)" : "var(--text)") : undefined }} className={r.temp_c == null ? "td-null" : ""}>{r.temp_c ?? "—"}</td>
                  <td className={r.vbus_mv == null ? "td-null" : ""}>{r.vbus_mv ?? "—"}</td>
                  <td className={r.ibus_ma == null ? "td-null" : ""}>{r.ibus_ma ?? "—"}</td>
                  <td className={r.solar_total_mw == null ? "td-null" : ""}>{r.solar_total_mw ?? "—"}</td>
                  <td style={r.rssi_dbm != null ? { color: Number(r.rssi_dbm) > -70 ? "var(--green)" : Number(r.rssi_dbm) > -90 ? "var(--yellow)" : "var(--red)", fontFamily: "'Space Mono', monospace" } : { color: "var(--text-muted)" }}>{r.rssi_dbm ?? "—"}</td>
                  <td className={r.snr_db == null ? "td-null" : ""}>{r.snr_db ?? "—"}</td>
                  <td className={r.uptime_sec == null ? "td-null" : ""}>{uptimeStr(r.uptime_sec)}</td>
                  <td className={r.reset_count == null ? "td-null" : ""}>{r.reset_count ?? "—"}</td>
                </tr>
              ))}
              {!tableRows.length && (
                <tr><td colSpan={11} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>No data in the selected time range yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
