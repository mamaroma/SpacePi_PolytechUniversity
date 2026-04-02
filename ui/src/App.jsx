import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  fetchSatellites,
  fetchTelemetry,
  isoDaysAgo,
  fetchOrbitTrack,
  runCollect,
} from "./api";

import ChartCard from "./components/ChartCard";
import MapCard from "./components/MapCard";
import GlobeCard from "./components/GlobeCard";
import ErrorBoundary from "./components/ErrorBoundary";
import MetricCard from "./components/MetricCard";

// ─── helpers ──────────────────────────────────────────────────
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

// ─── UTC clock ────────────────────────────────────────────────
function UtcClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>
      {fmtUtc(t)}
    </span>
  );
}

// ─── Main App ──────────────────────────────────────────────────
export default function App() {
  const isProd = import.meta.env.PROD;
  const collectEnabled =
    import.meta.env.VITE_ENABLE_COLLECT != null
      ? import.meta.env.VITE_ENABLE_COLLECT === "true"
      : !isProd;
  const autoCollectOnBoot =
    import.meta.env.VITE_AUTO_COLLECT_ON_BOOT != null
      ? import.meta.env.VITE_AUTO_COLLECT_ON_BOOT === "true"
      : !isProd;

  const [satellites, setSatellites] = useState([]);
  const [sat, setSat] = useState("Polytech_Universe-3");
  const [rangeDays, setRangeDays] = useState(30);
  const [{ from, to }, setRange] = useState(isoDaysAgo(30));
  const [viewMode, setViewMode] = useState("globe");
  const [orbitMinutes, setOrbitMinutes] = useState(180);
  const [orbitStepSec, setOrbitStepSec] = useState(20);
  const [at, setAt] = useState(new Date());

  const [rows, setRows] = useState([]);
  const [orbitData, setOrbitData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [orbitLoading, setOrbitLoading] = useState(false);
  const [err, setErr] = useState("");
  const [orbitErr, setOrbitErr] = useState("");
  const [updating, setUpdating] = useState(false);
  const [collectMsg, setCollectMsg] = useState("");

  // collect token
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const bootstrapDoneRef = useRef(false);

  // connection status for header
  const connStatus = err ? "err" : loading ? "loading" : rows.length > 0 ? "live" : "idle";

  useEffect(() => {
    fetchSatellites()
      .then((list) => {
        setSatellites(list);
        if (list.length && !list.includes(sat)) setSat(list[0]);
      })
      .catch(() => setSatellites(["Polytech_Universe-3"]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const loadOrbit = useCallback(async (satName, atDate, minutes, stepSec) => {
    setOrbitLoading(true);
    setOrbitErr("");
    try {
      const data = await fetchOrbitTrack({ sat: satName, at: atDate, minutes, step_sec: stepSec });
      setOrbitData(data);
      if (!Array.isArray(data?.track) || data.track.length === 0) {
        setOrbitErr("No orbit points returned by backend");
      }
    } catch (e) {
      setOrbitErr(String(e?.message ?? e));
    } finally {
      setOrbitLoading(false);
    }
  }, []);

  useEffect(() => { loadTelemetry(sat, from, to); }, [sat, from, to, loadTelemetry]);

  // Always load orbit regardless of view mode — both Globe and Map need it
  useEffect(() => {
    loadOrbit(sat, at, orbitMinutes, orbitStepSec);
  }, [sat, at, orbitMinutes, orbitStepSec, loadOrbit]);

  // Bootstrap the dashboard on first load:
  // 1) render cached/current DB data immediately via the effects above
  // 2) kick off one background collect to refresh from Telegram
  // 3) reload telemetry + orbit once fresh packets are inserted
  useEffect(() => {
    if (!sat || bootstrapDoneRef.current || !autoCollectOnBoot) return;
    bootstrapDoneRef.current = true;

    let alive = true;
    (async () => {
      setCollectMsg("Refreshing latest telemetry…");
      try {
        await runCollect({ sat, token });
        if (!alive) return;
        const newTo = new Date();
        const newFrom = new Date(newTo.getTime() - rangeDays * 24 * 3600 * 1000);
        setRange({ from: newFrom, to: newTo });
        await loadTelemetry(sat, newFrom, newTo);
        await loadOrbit(sat, at, orbitMinutes, orbitStepSec);
        if (alive) setCollectMsg("✓ Latest telemetry loaded");
      } catch (e) {
        if (!alive) return;
        const msg = String(e?.message ?? e);
        // Don't hard-fail page bootstrap on collect errors; existing DB/orbit data may still render.
        setCollectMsg(msg.toLowerCase().includes("token") ? "Manual collect requires token" : "");
      } finally {
        if (alive) setTimeout(() => setCollectMsg(""), 5000);
      }
    })();

    return () => { alive = false; };
  }, [sat, token, rangeDays, at, orbitMinutes, orbitStepSec, loadTelemetry, loadOrbit, autoCollectOnBoot]);

  const handleUpdateData = useCallback(async () => {
    if (!collectEnabled) {
      setCollectMsg("Hosted demo mode: automatic Telegram collect is disabled here.");
      setTimeout(() => setCollectMsg(""), 6000);
      return;
    }
    setUpdating(true);
    setCollectMsg("");
    setErr("");
    try {
      const res = await runCollect({ sat, token });
      setCollectMsg(`✓ Inserted ${res?.inserted ?? 0} packets`);
      const newTo = new Date();
      const newFrom = new Date(newTo.getTime() - rangeDays * 24 * 3600 * 1000);
      setRange({ from: newFrom, to: newTo });
      await loadTelemetry(sat, newFrom, newTo);
      await loadOrbit(sat, at, orbitMinutes, orbitStepSec);
    } catch (e) {
      const msg = String(e?.message ?? e);
      setErr(msg);
      // Auto-open token input if auth failed
      if (msg.toLowerCase().includes("token")) setShowToken(true);
    } finally {
      setUpdating(false);
      setTimeout(() => setCollectMsg(""), 8000);
    }
  }, [sat, rangeDays, viewMode, at, orbitMinutes, orbitStepSec, token, loadTelemetry, loadOrbit, collectEnabled]);

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
    <>
      {/* ── Header ── */}
      <header className="header">
        <a className="header-logo" href="/">
          <span className="header-logo-icon">🛰</span>
          PolySpace
          <span className="header-badge">GS</span>
        </a>

        <div className="header-sep" />

        <div className="ctrl-group">
          <span className="ctrl-label">Satellite</span>
          <select
            value={sat}
            onChange={(e) => setSat(e.target.value)}
            style={{ minWidth: 160 }}
          >
            {satellites.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        <div className="ctrl-group">
          <span className="ctrl-label">Range</span>
          <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
            <option value={7}>7 days</option>
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={365}>365 days</option>
          </select>
        </div>

        <div className="header-spacer" />

        <UtcClock />

        <div className="header-info">
          <span className={`status-dot ${connStatus}`} />
          {loading ? "Loading…" : err ? "Error" : rows.length > 0 ? `${rows.length} pkts` : "No data"}
        </div>

        {collectEnabled ? (
          <button
            className="btn btn-primary"
            onClick={handleUpdateData}
            disabled={updating}
          >
            {updating ? <><span className="spinner" /> Updating…</> : "⬆ Collect"}
          </button>
        ) : (
          <button
            className="btn"
            disabled
            title="Collect is disabled in hosted demo mode"
          >
            Demo mode
          </button>
        )}
      </header>

      {/* ── Body ── */}
      <div className="app-body">

        {/* Token row (show only when needed) */}
        {collectEnabled && showToken && (
          <div className="controls-card">
            <div className="ctrl-row">
              <span className="ctrl-label">Collect token</span>
              <div className="token-row">
                <input
                  type="password"
                  className="token-input"
                  placeholder="COLLECT_TOKEN"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
                <button className="btn btn-sm" onClick={() => setShowToken(false)}>
                  ✕ Hide
                </button>
              </div>
              {collectMsg && <span style={{ fontSize: 12, color: "var(--green)" }}>{collectMsg}</span>}
              {err && <span className="small c-red">{err}</span>}
            </div>
          </div>
        )}
        {!showToken && (err || collectMsg) && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            {err && <span className="small c-red">⚠ {err}</span>}
            {collectMsg && <span style={{ fontSize: 12, color: "var(--green)" }}>✓ {collectMsg}</span>}
          </div>
        )}

        {/* Controls */}
        <div className="controls-card">
          <div className="ctrl-row">
            <div className="ctrl-group">
              <span className="ctrl-label">View</span>
              <div className="row">
                <button
                  className={`btn btn-tab ${viewMode === "globe" ? "active" : ""}`}
                  onClick={() => setViewMode("globe")}
                >
                  🌍 3D Globe
                </button>
                <button
                  className={`btn btn-tab ${viewMode === "map" ? "active" : ""}`}
                  onClick={() => setViewMode("map")}
                >
                  🗺 2D Map
                </button>
              </div>
            </div>

            <div className="ctrl-divider" />

            <div className="ctrl-group">
              <span className="ctrl-label">Date/Time</span>
              <input
                type="datetime-local"
                value={datetimeLocalValue}
                onChange={(e) => setAt(new Date(e.target.value))}
              />
              <button className="btn btn-sm" onClick={() => setAt(new Date())}>Now</button>
              <span className="small mono">{fmtUtc(at)}</span>
            </div>

            <div className="ctrl-divider" />

            <div className="ctrl-group">
              <span className="ctrl-label">Orbit window</span>
              <select value={orbitMinutes} onChange={(e) => setOrbitMinutes(Number(e.target.value))}>
                <option value={60}>60 min</option>
                <option value={120}>120 min</option>
                <option value={180}>180 min</option>
                <option value={360}>360 min</option>
                <option value={720}>720 min</option>
              </select>
            </div>

            <div className="ctrl-group">
              <span className="ctrl-label">Step</span>
              <select value={orbitStepSec} onChange={(e) => setOrbitStepSec(Number(e.target.value))}>
                <option value={10}>10 s</option>
                <option value={20}>20 s</option>
                <option value={30}>30 s</option>
                <option value={60}>60 s</option>
              </select>
            </div>

            <div className="ctrl-spacer" />

            {collectEnabled && (
              <button
                className="btn btn-sm"
                onClick={() => setShowToken((v) => !v)}
                title="Configure collect token"
              >
                🔑
              </button>
            )}
          </div>

          {/* Status row */}
          <div className="status-row">
            <span className="status-item">
              <span className={`status-dot ${loading ? "loading" : err ? "err" : "live"}`} />
              <span className="lbl">Telemetry:</span>
              <span className="val">
                {loading ? "loading…" : err ? `error: ${err}` : `${rows.length} packets`}
              </span>
            </span>
            <span className="status-item">
              <span className={`status-dot ${orbitLoading ? "loading" : orbitErr ? "err" : (orbitData?.track?.length ?? 0) > 0 ? "live" : "idle"}`} />
              <span className="lbl">Orbit:</span>
              <span className="val">
                {orbitLoading ? "loading…" : orbitErr ? `error: ${orbitErr}` : `${orbitData?.track?.length ?? 0} pts`}
              </span>
            </span>
            {!collectEnabled && (
              <span className="status-item">
                <span className="lbl">Mode:</span>
                <span className="val">hosted demo, DB read-only</span>
              </span>
            )}
          </div>
        </div>

        {/* ── Metric Cards ── */}
        <div className="metrics-row">
          <MetricCard
            icon="🌡"
            label="Temperature"
            value={latest?.temp_c}
            unit="°C"
            color="col-red"
            decimals={1}
            sub={latest ? new Date(latest.ts_utc).toLocaleString() : "No data"}
          />
          <MetricCard
            icon="🔋"
            label="Battery"
            value={latest?.battery_capacity_pct}
            unit="%"
            color="col-green"
            decimals={0}
            sub={latest?.vbus_mv != null ? `${latest.vbus_mv} mV` : "—"}
          />
          <MetricCard
            icon="☀"
            label="Solar Power"
            value={latest?.solar_total_mw}
            unit="mW"
            color="col-yellow"
            decimals={0}
            sub={latest?.solar_voltage_mv != null ? `${latest.solar_voltage_mv} mV` : "—"}
          />
          <MetricCard
            icon="📡"
            label="RSSI"
            value={latest?.rssi_dbm}
            unit="dBm"
            color="col-cyan"
            decimals={1}
            rssi={latest?.rssi_dbm}
            sub={latest?.snr_db != null ? `SNR ${latest.snr_db} dB` : "—"}
          />
          <MetricCard
            icon="⏱"
            label="Uptime"
            value={latest?.uptime_sec != null ? Math.floor(latest.uptime_sec / 3600) : null}
            unit="h"
            color="col-purple"
            decimals={0}
            sub={latest?.reset_count != null ? `Resets: ${latest.reset_count}` : "—"}
          />
        </div>

        {/* Latest packet banner */}
        {latest && (
          <div className="latest-banner">
            <div className="lp-item">
              <div className="lp-label">Last packet</div>
              <div className="lp-val c-dim">{new Date(latest.ts_utc).toLocaleString()}</div>
            </div>
            <div className="lp-item">
              <div className="lp-label">Uptime</div>
              <div className="lp-val c-cyan">{uptimeStr(latest.uptime_sec)}</div>
            </div>
            <div className="lp-item">
              <div className="lp-label">Position</div>
              <div className="lp-val c-dim">
                {latest.tle_lat != null ? `${Number(latest.tle_lat).toFixed(2)}° / ${Number(latest.tle_lon).toFixed(2)}°` : "—"}
              </div>
            </div>
            <div className="lp-item">
              <div className="lp-label">Vbus / Ibus</div>
              <div className="lp-val c-yellow">
                {latest.vbus_mv ?? "—"} mV / {latest.ibus_ma ?? "—"} mA
              </div>
            </div>
            <div className="lp-item">
              <div className="lp-label">Resets</div>
              <div className="lp-val c-purple">{latest.reset_count ?? "—"}</div>
            </div>
          </div>
        )}

        {/* ── Globe / Map ── */}
        {viewMode === "globe" ? (
          <ErrorBoundary>
            <GlobeCard
              sat={sat}
              atIso={at.toISOString()}
              minutes={orbitMinutes}
              stepSec={orbitStepSec}
              orbitData={orbitData}
            />
          </ErrorBoundary>
        ) : (
          <MapCard
            receivedPoints={chartData}
            orbitTrack={orbitData?.track ?? []}
            orbitCurrent={orbitData?.current ?? null}
          />
        )}

        {/* ── Charts ── */}
        <div className="charts-grid">
          <ChartCard
            title="Temperature (°C)"
            data={seriesTemp}
            xKey="x"
            lines={[
              { key: "min", name: "Min", color: "#00b3ff" },
              { key: "avg", name: "Avg", color: "#00ff88" },
              { key: "max", name: "Max", color: "#ff4d6a" },
            ]}
          />
          <ChartCard
            title="Battery Capacity (%)"
            data={seriesBatCap}
            xKey="x"
            lines={[
              { key: "min", name: "Min", color: "#00b3ff" },
              { key: "avg", name: "Avg", color: "#00ff88" },
              { key: "max", name: "Max", color: "#ffa63a" },
            ]}
          />
          <ChartCard
            title="Battery Voltage (mV)"
            data={seriesBatV}
            xKey="x"
            lines={[
              { key: "min", name: "Min", color: "#00b3ff" },
              { key: "avg", name: "Avg", color: "#00ff88" },
              { key: "max", name: "Max", color: "#ff4d6a" },
            ]}
          />
          <ChartCard
            title="Solar Power (mW)"
            data={seriesSolarPow}
            xKey="x"
            lines={[
              { key: "min", name: "Min", color: "#00b3ff" },
              { key: "avg", name: "Avg", color: "#ffa63a" },
              { key: "max", name: "Max", color: "#ff4d6a" },
            ]}
          />
          <ChartCard
            title="Solar Voltage (mV)"
            data={seriesSolarV}
            xKey="x"
            lines={[
              { key: "min", name: "Min", color: "#00b3ff" },
              { key: "avg", name: "Avg", color: "#ffa63a" },
              { key: "max", name: "Max", color: "#ff4d6a" },
            ]}
          />
        </div>

        {/* ── Telemetry Table ── */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">📋 Latest Packets</span>
            <span className="card-meta">{tableRows.length} / {rows.length} shown</span>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Time UTC</th>
                  <th>Lat</th>
                  <th>Lon</th>
                  <th>Temp (°C)</th>
                  <th>Vbus (mV)</th>
                  <th>Ibus (mA)</th>
                  <th>Solar (mW)</th>
                  <th>RSSI (dBm)</th>
                  <th>SNR (dB)</th>
                  <th>Uptime</th>
                  <th>Resets</th>
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
                    <td style={r.rssi_dbm != null ? { color: Number(r.rssi_dbm) > -70 ? "var(--green)" : Number(r.rssi_dbm) > -90 ? "var(--yellow)" : "var(--red)", fontFamily: "'Space Mono', monospace" } : { color: "var(--text-muted)" }}>
                      {r.rssi_dbm ?? "—"}
                    </td>
                    <td className={r.snr_db == null ? "td-null" : ""}>{r.snr_db ?? "—"}</td>
                    <td className={r.uptime_sec == null ? "td-null" : ""}>{uptimeStr(r.uptime_sec)}</td>
                    <td className={r.reset_count == null ? "td-null" : ""}>{r.reset_count ?? "—"}</td>
                  </tr>
                ))}
                {!tableRows.length && (
                  <tr>
                    <td colSpan={11} style={{ textAlign: "center", padding: "24px", color: "var(--text-muted)" }}>
                      No data — press "⬆ Collect" to fetch from Telegram
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ── Footer ── */}
      <footer className="footer">
        <span>PolySpace Ground Station · Polytech University</span>
        <span>API: <a href="/docs" target="_blank" rel="noreferrer">/docs</a></span>
        <span style={{ marginLeft: "auto" }}>Backend: <a href="http://localhost:8000" target="_blank" rel="noreferrer">:8000</a></span>
      </footer>
    </>
  );
}
