import React, { useEffect, useMemo, useState, useCallback } from "react";
import {
  fetchSatellites,
  fetchTelemetry,
  isoDaysAgo,
  fetchOrbitTrack,
  runCollect
} from "./api";

import ChartCard from "./components/ChartCard";
import MapCard from "./components/MapCard";
import GlobeCard from "./components/GlobeCard";
import ErrorBoundary from "./components/ErrorBoundary";

function toNum(x) {
  if (x === null || x === undefined) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

// dd.mm.yyyy HH:MM UTC
function formatUtcNice(d) {
  const dd = pad2(d.getUTCDate());
  const mm = pad2(d.getUTCMonth() + 1);
  const yy = d.getUTCFullYear();
  const hh = pad2(d.getUTCHours());
  const mi = pad2(d.getUTCMinutes());
  return `${dd}.${mm}.${yy} ${hh}:${mi} UTC`;
}

export default function App() {
  const [satellites, setSatellites] = useState([]);
  const [sat, setSat] = useState("Polytech_Universe-3");

  // telemetry range
  const [rangeDays, setRangeDays] = useState(30);
  const [{ from, to }, setRange] = useState(isoDaysAgo(30));

  // orbit controls
  const [viewMode, setViewMode] = useState("globe"); // "map" | "globe"
  const [orbitMinutes, setOrbitMinutes] = useState(180);
  const [orbitStepSec, setOrbitStepSec] = useState(20);

  // selected time for orbit
  const [at, setAt] = useState(new Date());

  // data
  const [rows, setRows] = useState([]);
  const [orbitData, setOrbitData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [orbitLoading, setOrbitLoading] = useState(false);
  const [err, setErr] = useState("");
  const [orbitErr, setOrbitErr] = useState("");

  // update button state
  const [updating, setUpdating] = useState(false);

  // satellites list
  useEffect(() => {
    fetchSatellites()
      .then((list) => {
        setSatellites(list);
        if (list.length && !list.includes(sat)) setSat(list[0]);
      })
      .catch(() => setSatellites(["Polytech_Universe-3"]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // telemetry range
  useEffect(() => {
    setRange(isoDaysAgo(rangeDays));
  }, [rangeDays]);

  const loadTelemetry = useCallback(
    async (satName, fromDate, toDate) => {
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
    },
    []
  );

  const loadOrbit = useCallback(
    async (satName, atDate, minutes, stepSec) => {
      setOrbitLoading(true);
      setOrbitErr("");
      try {
        const data = await fetchOrbitTrack({
          sat: satName,
          at: atDate,
          minutes,
          step_sec: stepSec
        });
        setOrbitData(data);
      } catch (e) {
        setOrbitErr(String(e?.message ?? e));
      } finally {
        setOrbitLoading(false);
      }
    },
    []
  );

  // load telemetry (auto)
  useEffect(() => {
    loadTelemetry(sat, from, to);
  }, [sat, from, to, loadTelemetry]);

  // load orbit track (auto) — нужен только для MapCard, GlobeCard сам фетчит
  useEffect(() => {
    if (viewMode === "map") {
      loadOrbit(sat, at, orbitMinutes, orbitStepSec);
    }
  }, [sat, at, orbitMinutes, orbitStepSec, viewMode, loadOrbit]);

      const handleUpdateData = useCallback(async () => {
    setUpdating(true);
    setErr("");
    setOrbitErr("");

    try {
      // 1) запускаем сбор данных на бэке
      await runCollect({ sat });

      // 2) обновляем диапазон "до сейчас"
      const newTo = new Date();
      const newFrom = new Date(newTo.getTime() - rangeDays * 24 * 3600 * 1000);
      setRange({ from: newFrom, to: newTo });

      // 3) сразу руками перезагрузим telemetry
      await loadTelemetry(sat, newFrom, newTo);

      // 4) orbit (для map) тоже обновим
      if (viewMode === "map") {
        await loadOrbit(sat, at, orbitMinutes, orbitStepSec);
      }
    } catch (e) {
      setErr(String(e?.message ?? e));
    } finally {
      setUpdating(false);
    }
  }, [
    sat,
    rangeDays,
    viewMode,
    at,
    orbitMinutes,
    orbitStepSec,
    loadTelemetry,
    loadOrbit
  ]);

  const chartData = useMemo(() => {
    return rows.map((r) => {
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
        solar_total_mw: toNum(r.solar_total_mw),
        rssi_dbm: toNum(r.rssi_dbm),
        snr_db: toNum(r.snr_db),
        uptime_sec: toNum(r.uptime_sec),
        reset_count: toNum(r.reset_count)
      };
    });
  }, [rows]);

  const latest = useMemo(() => {
    if (!rows.length) return null;
    return rows[rows.length - 1];
  }, [rows]);

  // datetime-local wants local time; we keep "at" as Date
  const datetimeLocalValue = useMemo(() => {
    const d = at;
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 16);
  }, [at]);

  return (
    <div className="container">
      <h2 style={{ margin: "6px 0 12px" }}>Telemetry dashboard</h2>

      <div className="card" style={{ marginBottom: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div className="row" style={{ flexWrap: "wrap" }}>
            <label>
              Satellite:&nbsp;
              <select value={sat} onChange={(e) => setSat(e.target.value)}>
                {satellites.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Telemetry range:&nbsp;
              <select value={rangeDays} onChange={(e) => setRangeDays(Number(e.target.value))}>
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value={365}>365 days</option>
              </select>
            </label>

            <button onClick={handleUpdateData} disabled={updating}>
              {updating ? "Updating…" : "Update data"}
            </button>

            <label>
              View:&nbsp;
              <select value={viewMode} onChange={(e) => setViewMode(e.target.value)}>
                <option value="globe">3D Globe</option>
                <option value="map">2D Map</option>
              </select>
            </label>
          </div>

          <div className="small">
            {loading
              ? "Telemetry: loading…"
              : err
              ? `Telemetry error: ${err}`
              : `Telemetry: ${rows.length} packets`}
            <br />
            {viewMode === "map" && (
              <>
                {orbitLoading
                  ? "Orbit: loading…"
                  : orbitErr
                  ? `Orbit error: ${orbitErr}`
                  : `Orbit: ${orbitData?.track?.length ?? 0} pts`}
              </>
            )}
          </div>
        </div>

        {latest && (
          <div className="small" style={{ marginTop: 10 }}>
            Latest telemetry: {new Date(latest.ts_utc).toLocaleString()} • Temp{" "}
            {latest.temp_c ?? "—"} °C • Vbus {latest.vbus_mv ?? "—"} mV • Solar{" "}
            {latest.solar_total_mw ?? "—"} mW • RSSI {latest.rssi_dbm ?? "—"} dBm
          </div>
        )}

        <div className="row" style={{ marginTop: 12, flexWrap: "wrap" }}>
          <label>
            Date/Time:&nbsp;
            <input
              type="datetime-local"
              value={datetimeLocalValue}
              onChange={(e) => setAt(new Date(e.target.value))}
            />
          </label>

          <button onClick={() => setAt(new Date())}>Now</button>

          <div className="small">
            Selected: <b>{formatUtcNice(at)}</b>
          </div>

          <label>
            Orbit window (min):&nbsp;
            <select value={orbitMinutes} onChange={(e) => setOrbitMinutes(Number(e.target.value))}>
              <option value={60}>60</option>
              <option value={120}>120</option>
              <option value={180}>180</option>
              <option value={360}>360</option>
              <option value={720}>720</option>
            </select>
          </label>

          <label>
            Step (sec):&nbsp;
            <select value={orbitStepSec} onChange={(e) => setOrbitStepSec(Number(e.target.value))}>
              <option value={10}>10</option>
              <option value={20}>20</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </label>
        </div>
      </div>

      {/* ORBIT VISUAL */}
      {viewMode === "globe" ? (
        <ErrorBoundary>
          <GlobeCard
            title="Orbit ground track (TLE/SGP4) — 3D Globe"
            sat={sat}
            atIso={at.toISOString()}
            minutes={orbitMinutes}
            stepSec={orbitStepSec}
          />
        </ErrorBoundary>
      ) : (
        <MapCard
          title="Orbit ground track (TLE/SGP4) + Received points (TinyGS)"
          receivedPoints={chartData}
          orbitTrack={orbitData?.track ?? []}
          orbitCurrent={orbitData?.current ?? null}
        />
      )}

      <div style={{ height: 12 }} />

      <div className="grid" style={{ marginBottom: 12 }}>
        <ChartCard title="Temperature (°C)" data={chartData} lines={[{ key: "temp_c", name: "Temp °C" }]} />

        <ChartCard
          title="Power (mV / mA / mW)"
          data={chartData}
          lines={[
            { key: "vbus_mv", name: "Vbus (mV)" },
            { key: "ibus_ma", name: "Ibus (mA)" },
            { key: "solar_total_mw", name: "Solar total (mW)" }
          ]}
        />

        <ChartCard
          title="Link quality (dBm / dB)"
          data={chartData}
          lines={[
            { key: "rssi_dbm", name: "RSSI (dBm)" },
            { key: "snr_db", name: "SNR (dB)" }
          ]}
        />

        <ChartCard
          title="Uptime / Resets"
          data={chartData}
          lines={[
            { key: "uptime_sec", name: "Uptime (sec)" },
            { key: "reset_count", name: "Reset count" }
          ]}
        />
      </div>

      <div className="card">
        <h3 style={{ margin: "6px 0 10px" }}>Latest packets</h3>
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Time</th>
                <th>Lat</th>
                <th>Lon</th>
                <th>Temp</th>
                <th>Vbus</th>
                <th>Ibus</th>
                <th>Solar</th>
                <th>RSSI</th>
                <th>SNR</th>
                <th>Uptime</th>
                <th>Reset</th>
              </tr>
            </thead>
            <tbody>
              {[...rows].slice(-80).reverse().map((r) => (
                <tr key={r.id}>
                  <td>{new Date(r.ts_utc).toLocaleString()}</td>
                  <td>{r.tle_lat ?? ""}</td>
                  <td>{r.tle_lon ?? ""}</td>
                  <td>{r.temp_c ?? ""}</td>
                  <td>{r.vbus_mv ?? ""}</td>
                  <td>{r.ibus_ma ?? ""}</td>
                  <td>{r.solar_total_mw ?? ""}</td>
                  <td>{r.rssi_dbm ?? ""}</td>
                  <td>{r.snr_db ?? ""}</td>
                  <td>{r.uptime_sec ?? ""}</td>
                  <td>{r.reset_count ?? ""}</td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={11} className="small">
                    No data yet. Press “Update data”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="small" style={{ marginTop: 10 }}>
        Backend: http://127.0.0.1:8000 • Docs: /docs
      </div>
    </div>
  );
}