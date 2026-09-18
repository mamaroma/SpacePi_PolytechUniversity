import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  fetchFleet,
  fetchTelemetry,
  isoDaysAgo,
  fetchOrbitTrack,
} from "../api";

import MapCard from "../components/MapCard";
import GlobeCard from "../components/GlobeCard";
import ErrorBoundary from "../components/ErrorBoundary";
import Hint, { GuideBanner } from "../components/Hint";

/* ── Inactive satellites (no TLE / no telemetry) ─────
   У них нет «живых» TLE/телеметрии, но карточки и спарклайны мы рисуем —
   с заглушечной (синтетической) последней пачкой пакетов, чтобы пользователь
   видел шаблон карточки и понимал, что аппарат именно «неактивен», а не
   «странно пустой». */

function lastContactToTs(label) {
  if (!label) return Date.now() - 24 * 3600 * 1000;
  // "≈N дн. назад" — относительная метка, парсим первой
  const rel = label.match(/≈\s*(\d+)\s*дн/);
  if (rel) return Date.now() - Number(rel[1]) * 24 * 3600 * 1000;
  // "DD.MM.YYYY" — численная дата
  const dot = label.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (dot) return Date.UTC(Number(dot[3]), Number(dot[2]) - 1, Number(dot[1]));
  // "Месяц YYYY"
  const month = { "Январь": 0, "Февраль": 1, "Март": 2, "Апрель": 3, "Май": 4, "Июнь": 5,
                  "Июль": 6, "Август": 7, "Сентябрь": 8, "Октябрь": 9, "Ноябрь": 10, "Декабрь": 11 };
  const m = label.match(/(\S+)\s+(\d{4})/);
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

/* Только официально завершившие миссию аппараты.
   PU-6 — действующий (оживлён по запросу). PU-7/8/9 — анонсированные. */
const DEAD_SATELLITES = {
  "Polytech_Universe-1": {
    current: { lat: 52.3, lon: 87.6, ts_utc: "2024-01-20T12:00:00Z" },
    track: [],
    lastContact: "Январь 2024 (архивные данные)",
    dead: true,
  },
  "Polytech_Universe-2": {
    current: { lat: -15.7, lon: -42.3, ts_utc: "2023-10-05T08:00:00Z" },
    track: [],
    lastContact: "Октябрь 2023 (архивные данные)",
    dead: true,
  },
};

/** Реалистичный ground track круговой наклонной орбиты (без TLE).
 *  Даёт гладкую синусоиду широты vs долготы, как у LEO/SSO — без «кривых»
 *  ломаных линий от наивной формулы seedLat+sin. */
function makeKeplerianGroundTrack({
  inclinationDeg = 97.4,
  altitudeKm = 550,
  raanDeg = 0,
  minutes = 180,
  stepSec = 45,
  epochMs = Date.now(),
} = {}) {
  const mu = 398600.4418; // км³/с²
  const Re = 6378.137;
  const a = Re + altitudeKm;
  const n = Math.sqrt(mu / (a * a * a)); // рад/с
  const omegaE = 7.2921159e-5;
  const i = (inclinationDeg * Math.PI) / 180;
  const Omega0 = (raanDeg * Math.PI) / 180;
  const nSteps = Math.max(8, Math.floor((minutes * 60) / stepSec));
  const track = [];
  for (let k = 0; k <= nSteps; k++) {
    const t = k * stepSec;
    const u = n * t; // аргумент широты (круговая, ω=0)
    const sinLat = Math.sin(i) * Math.sin(u);
    const lat = (Math.asin(Math.max(-1, Math.min(1, sinLat))) * 180) / Math.PI;
    const lonInertial = Math.atan2(Math.cos(i) * Math.sin(u), Math.cos(u));
    let lon = ((Omega0 + lonInertial - omegaE * t) * 180) / Math.PI;
    lon = ((lon + 540) % 360) - 180;
    track.push({
      ts_utc: new Date(epochMs - (nSteps - k) * stepSec * 1000).toISOString(),
      lat: +lat.toFixed(5),
      lon: +lon.toFixed(5),
    });
  }
  return {
    current: track[track.length - 1],
    track,
    lastContact: "синтетическая орбита · TLE ожидается",
    announced: true,
    form: null,
  };
}

/** Анонсированные КА — ещё нет публичных TLE, но показываем на карте. */
function makeAnnouncedOrbit(raanDeg, inclinationDeg = 97.4, altitudeKm = 545) {
  return makeKeplerianGroundTrack({
    inclinationDeg,
    altitudeKm,
    raanDeg,
    minutes: 200,
    stepSec: 40,
  });
}

const ANNOUNCED_SATELLITES = {
  "Polytech_Universe-7": {
    ...makeAnnouncedOrbit(40, 97.5, 550),
    form: "CubeSat",
    note: "Анонсированный аппарат серии Polytech Universe",
  },
  "Polytech_Universe-8": {
    ...makeAnnouncedOrbit(110, 97.3, 540),
    form: "3U",
    note: "Анонсированный 3U CubeSat",
  },
  "Polytech_Universe-9": {
    ...makeAnnouncedOrbit(220, 97.6, 545),
    form: "3U",
    note: "Анонсированный 3U CubeSat",
  },
};

const SAT_ICON_META = {
  "Polytech_Universe-1": { shape: "◆", label: "1" },
  "Polytech_Universe-2": { shape: "■", label: "2" },
  "Polytech_Universe-3": { shape: "⬡", label: "3" },
  "Polytech_Universe-4": { shape: "●", label: "4" },
  "Polytech_Universe-5": { shape: "▲", label: "5" },
  "Polytech_Universe-6": { shape: "◆", label: "6" },
  "Polytech_Universe-7": { shape: "⬡", label: "7" },
  "Polytech_Universe-8": { shape: "■", label: "8" },
  "Polytech_Universe-9": { shape: "●", label: "9" },
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

function SatInfoPanel({ satName, rows, chartData, isDead, deadInfo, isAnnounced, announcedInfo, onClose }) {
  const short = satName.replace("Polytech_Universe-", "PU-");
  const latest = rows.length ? rows[rows.length - 1] : null;
  const isWarm =
    satName === "Polytech_Universe-1" ||
    satName === "Polytech_Universe-2";
  const showDeadLabel = isDead && !isWarm;
  const icon = SAT_ICON_META[satName] || { shape: "●", label: "?" };

  const seriesTemp = useMemo(() => dailyMinAvgMax(chartData, "temp_c"), [chartData]);
  const seriesBat = useMemo(() => dailyMinAvgMax(chartData, "battery_capacity_pct"), [chartData]);
  const seriesSolar = useMemo(() => dailyMinAvgMax(chartData, "solar_total_mw"), [chartData]);

  return (
    <div className="sat-panel">
      <div className="sat-panel-header">
        <div>
          <div className="sat-panel-name">
            <span className="sat-icon-badge" aria-hidden="true">{icon.shape}{icon.label}</span>
            {" "}{short}
          </div>
          <div className={`sat-panel-status ${showDeadLabel ? "dead" : isAnnounced ? "announced" : "live"}`}>
            {showDeadLabel
              ? `⚫ INACTIVE · посл. контакт ${deadInfo?.lastContact || "—"}`
              : isAnnounced
                ? `🔵 АНОНС${announcedInfo?.form ? ` · ${announcedInfo.form}` : ""}`
                : isWarm
                  ? "🟠 АРХИВ · данные последнего пролёта"
                  : "🟢 ACTIVE"}
          </div>
        </div>
        <button className="sat-panel-close" onClick={onClose}>×</button>
      </div>

      {showDeadLabel && (
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
          <span className="sat-mini-label">Температура корпуса</span>
          <span className="sat-mini-value c-red">{latest?.temp_c != null ? `${Number(latest.temp_c).toFixed(1)} °C` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">Заряд батареи</span>
          <span className="sat-mini-value c-green">{latest?.battery_capacity_pct != null ? `${latest.battery_capacity_pct} %` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">Мощность СБ</span>
          <span className="sat-mini-value c-yellow">{latest?.solar_total_mw != null ? `${latest.solar_total_mw} мВт` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">Уровень RSSI</span>
          <span className="sat-mini-value c-cyan">{latest?.rssi_dbm != null ? `${latest.rssi_dbm} дБм` : "—"}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">Время работы</span>
          <span className="sat-mini-value c-purple">{uptimeStr(latest?.uptime_sec)}</span>
        </div>
        <div className="sat-mini-metric">
          <span className="sat-mini-label">Перезагрузки</span>
          <span className="sat-mini-value c-dim">{latest?.reset_count ?? "—"}</span>
        </div>
      </div>

      {latest && (
        <div className="sat-panel-last-packet">
          <div className="sat-mini-label">{(isDead || isWarm) ? "Последний пакет (архив)" : "Последний пакет"}</div>
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
          <div className="sat-mini-label">Температура корпуса, °C</div>
          <MiniSparkline data={seriesTemp} dataKey="avg" color="var(--orange-2)" />
          {seriesTemp.length > 1 && (
            <div className="sat-mini-period">
              {seriesTemp[0].x}&nbsp;—&nbsp;{seriesTemp[seriesTemp.length - 1].x}
            </div>
          )}
        </div>
        <div className="sat-mini-chart">
          <div className="sat-mini-label">Заряд батареи, %</div>
          <MiniSparkline data={seriesBat} dataKey="avg" color="var(--accent)" />
          {seriesBat.length > 1 && (
            <div className="sat-mini-period">
              {seriesBat[0].x}&nbsp;—&nbsp;{seriesBat[seriesBat.length - 1].x}
            </div>
          )}
        </div>
        <div className="sat-mini-chart">
          <div className="sat-mini-label">Мощность солнечных панелей, мВт</div>
          <MiniSparkline data={seriesSolar} dataKey="avg" color="var(--orange)" />
          {seriesSolar.length > 1 && (
            <div className="sat-mini-period">
              {seriesSolar[0].x}&nbsp;—&nbsp;{seriesSolar[seriesSolar.length - 1].x}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>
        {rows.length} пакетов {(isDead || isWarm) ? "в архиве" : "загружено"}
      </div>
    </div>
  );
}

export default function SatellitesPage() {
  const autoRefreshSec =
    Number(import.meta.env.VITE_AUTO_REFRESH_SECONDS ?? "60") || 60;

  const [fleet, setFleet] = useState([]);
  const [mapSats, setMapSats] = useState(new Set());
  const [dataSat, setDataSat] = useState("Polytech_Universe-3");
  const [mapDropdownOpen, setMapDropdownOpen] = useState(false);
  const [selectedSat, setSelectedSat] = useState(null);
  const [focusTarget, setFocusTarget] = useState(null);

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

  const connStatus = err ? "err" : loading ? "loading" : rows.length > 0 ? "live" : "idle";
  const sat = dataSat;

  useEffect(() => {
    fetchFleet()
      .then((list) => {
        setFleet(list);
        // Полный флот по умолчанию (вкл. анонсы). Ключ v3 сбрасывает старый выбор.
        let initial = new Set(list.map((s) => s.name));
        try {
          const raw = localStorage.getItem("mapSats_v3");
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length) {
              const known = new Set(list.map((s) => s.name));
              initial = new Set(parsed.filter((n) => known.has(n)));
              for (const s of list) {
                if (s.announced) initial.add(s.name);
              }
            }
          }
        } catch {}
        setMapSats(initial);
        if (list.length && !list.find((s) => s.name === dataSat)) {
          const first = list.find((s) => s.active) || list[0];
          setDataSat(first.name);
        }
      })
      .catch(() => {
        const fallback = [
          { name: "Polytech_Universe-3", active: true, color: "#c084fc" },
          { name: "Polytech_Universe-4", active: true, color: "#38bdf8" },
          { name: "Polytech_Universe-5", active: true, color: "#a3e635" },
          { name: "Polytech_Universe-6", active: true, color: "#f97316" },
        ];
        setFleet(fallback);
        setMapSats(new Set(fallback.map((s) => s.name)));
      });
  }, []);

  const toggleMapSat = useCallback((name) => {
    setMapSats((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      try { localStorage.setItem("mapSats_v3", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    try { localStorage.setItem("mapSats_v3", JSON.stringify([...mapSats])); } catch {}
  }, [mapSats]);

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
      setOrbitDataMap((prev) => ({ ...prev, [satName]: DEAD_SATELLITES[satName] }));
      return;
    }
    if (ANNOUNCED_SATELLITES[satName]) {
      setOrbitDataMap((prev) => ({ ...prev, [satName]: ANNOUNCED_SATELLITES[satName] }));
      return;
    }
    try {
      const data = await fetchOrbitTrack({ sat: satName, at: atDate, minutes, step_sec: stepSec });
      setOrbitDataMap((prev) => ({ ...prev, [satName]: data }));
      setOrbitErrMap((prev) => ({ ...prev, [satName]: null }));
    } catch (e) {
      // Если TLE ещё нет (часто для свежего PU-6) — мягкий синтетический трек,
      // чтобы КА не «пропадал» с карты.
      if (satName === "Polytech_Universe-6") {
        const fallback = makeKeplerianGroundTrack({
          inclinationDeg: 97.5,
          altitudeKm: 580,
          raanDeg: 165,
          minutes: 200,
          stepSec: 35,
        });
        setOrbitDataMap((prev) => ({
          ...prev,
          [satName]: { ...fallback, announced: false, lastContact: "fallback · нет TLE" },
        }));
      }
      setOrbitErrMap((prev) => ({ ...prev, [satName]: String(e?.message ?? e) }));
    }
  }, []);

  const loadAllOrbits = useCallback(async (sats, atDate, minutes, stepSec) => {
    setOrbitLoading(true);
    await Promise.allSettled(
      [...sats].map((s) => loadSingleOrbit(s, atDate, minutes, stepSec))
    );
    setOrbitLoading(false);
  }, [loadSingleOrbit]);

  useEffect(() => { loadTelemetry(sat, from, to); }, [sat, from, to, loadTelemetry]);

  useEffect(() => {
    if (mapSats.size === 0) return;
    loadAllOrbits(mapSats, at, orbitMinutes, orbitStepSec);
  }, [mapSats, at, orbitMinutes, orbitStepSec, loadAllOrbits]);

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

  const handleSatelliteClick = useCallback((satName) => {
    setSelectedSat(satName);
    if (!DEAD_SATELLITES[satName] && !ANNOUNCED_SATELLITES[satName]) {
      setDataSat(satName);
    }
    const short = String(satName || "").replace("Polytech_Universe-", "PU-");
    if (/^PU-[1-6]$/.test(short)) {
      try { localStorage.setItem("polyspace.selectedSat", short); } catch {}
    }
  }, []);

  const focusOnSat = useCallback((satName) => {
    handleSatelliteClick(satName);
    setFocusTarget({ name: satName, token: Date.now() });
    setMapSats((prev) => {
      if (prev.has(satName)) return prev;
      const next = new Set(prev);
      next.add(satName);
      try { localStorage.setItem("mapSats_v3", JSON.stringify([...next])); } catch {}
      return next;
    });
  }, [handleSatelliteClick]);

  const isDeadSelected = selectedSat ? !!DEAD_SATELLITES[selectedSat] : false;
  const isAnnouncedSelected = selectedSat ? !!ANNOUNCED_SATELLITES[selectedSat] : false;
  const panelRows = useMemo(() => {
    if (isDeadSelected) return FAKE_TELEMETRY_CACHE[selectedSat] ?? [];
    if (isAnnouncedSelected) return [];
    return rows;
  }, [isDeadSelected, isAnnouncedSelected, selectedSat, rows]);

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
  const announcedInfo = selectedSat ? ANNOUNCED_SATELLITES[selectedSat] : null;

  const activeFleet = fleet.filter((s) => s.active);
  const announcedFleet = fleet.filter((s) => s.announced);
  const archiveFleet = fleet.filter((s) => !s.active && !s.announced);

  return (
    <div className="app-body telemetry-page">
      <GuideBanner id="telemetry-intro-v3" icon={null}>
        <strong>Телеметрия Polytech Universe.</strong> По умолчанию на глобусе весь
        флот (включая анонсированные PU-7/8/9). Клик по легенде слева переносит
        камеру на спутник. Официально завершили миссию только <b>PU-1</b> и{" "}
        <b>PU-2</b>; <b>PU-6</b> снова активен.
      </GuideBanner>

      <div className="controls-card">
        <div className="ctrl-row">
          <div className="ctrl-group" style={{ position: "relative" }} ref={mapDropdownRef}>
            <span className="ctrl-label">Спутники</span>
            <Hint text="Выберите, чьи орбиты показывать. По умолчанию — весь флот." />
            <button className="btn btn-sm" onClick={() => setMapDropdownOpen((v) => !v)} style={{ minWidth: 120, textAlign: "left" }}>
              {mapSats.size} из {fleet.length} ▾
            </button>
            {mapDropdownOpen && (
              <div className="sat-dropdown">
                {fleet.map((s) => {
                  const icon = SAT_ICON_META[s.name] || { shape: "●", label: "?" };
                  return (
                    <label key={s.name} className="sat-dropdown-item">
                      <input type="checkbox" checked={mapSats.has(s.name)} onChange={() => toggleMapSat(s.name)} style={{ accentColor: s.color }} />
                      <span className="sat-icon-badge sat-icon-badge--sm" style={{ color: s.color }}>{icon.shape}{icon.label}</span>
                      <span style={{ opacity: s.active || s.announced ? 1 : 0.75 }}>
                        {s.name.replace("Polytech_Universe-", "PU-")}
                      </span>
                      {s.announced && <span className="sat-badge-announced">анонс</span>}
                      {!s.active && !s.announced && (
                        <span className="sat-badge-dead">архив</span>
                      )}
                    </label>
                  );
                })}
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <button type="button" className="btn btn-sm" onClick={() => setMapSats(new Set(fleet.map((s) => s.name)))}>Все</button>
                  <button type="button" className="btn btn-sm" onClick={() => setMapSats(new Set())}>Нет</button>
                  <button type="button" className="btn btn-sm" onClick={() => setMapSats(new Set(fleet.filter((s) => s.active || s.announced).map((s) => s.name)))}>Активные+анонс</button>
                </div>
              </div>
            )}
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-group">
            <span className="ctrl-label">Вид</span>
            <Hint text="3D — интерактивный глобус. 2D — плоская карта." />
            <div className="row">
              <button className={`btn btn-tab ${viewMode === "globe" ? "active" : ""}`} onClick={() => setViewMode("globe")}>3D</button>
              <button className={`btn btn-tab ${viewMode === "map" ? "active" : ""}`} onClick={() => setViewMode("map")}>2D</button>
            </div>
          </div>

          <div className="ctrl-divider" />

          <div className="ctrl-group">
            <span className="ctrl-label">Время</span>
            <Hint text="Момент расчёта орбиты." />
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
            {orbitLoading ? " · орбиты…" : ""}
          </div>
        </div>
      </div>

      <div className="telemetry-view-container">
        <div className={`telemetry-globe-layout${viewMode === "map" ? " telemetry-globe-layout--map" : ""}`}>
          <aside className="telemetry-side telemetry-side--legend">
            <div className="telemetry-side-title">Легенда спутников</div>
            <p className="telemetry-side-hint">Клик — перенос камеры на КА</p>

            <div className="telemetry-legend-group">
              <div className="telemetry-legend-label">На орбите</div>
              {activeFleet.map((s) => {
                const icon = SAT_ICON_META[s.name] || { shape: "●", label: "?" };
                const short = s.name.replace("Polytech_Universe-", "PU-");
                return (
                  <button
                    key={s.name}
                    type="button"
                    className={`telemetry-legend-item${selectedSat === s.name ? " is-selected" : ""}${mapSats.has(s.name) ? "" : " is-off"}`}
                    onClick={() => focusOnSat(s.name)}
                  >
                    <span className="sat-icon-badge" style={{ color: s.color }}>{icon.shape}{icon.label}</span>
                    <span className="telemetry-legend-name">{short}</span>
                    <span className="telemetry-legend-dot" style={{ background: s.color }} />
                  </button>
                );
              })}
            </div>

            {announcedFleet.length > 0 && (
              <div className="telemetry-legend-group">
                <div className="telemetry-legend-label">Анонсированные</div>
                {announcedFleet.map((s) => {
                  const icon = SAT_ICON_META[s.name] || { shape: "●", label: "?" };
                  const short = s.name.replace("Polytech_Universe-", "PU-");
                  const form = ANNOUNCED_SATELLITES[s.name]?.form;
                  return (
                    <button
                      key={s.name}
                      type="button"
                      className={`telemetry-legend-item${selectedSat === s.name ? " is-selected" : ""}${mapSats.has(s.name) ? "" : " is-off"}`}
                      onClick={() => focusOnSat(s.name)}
                    >
                      <span className="sat-icon-badge" style={{ color: s.color }}>{icon.shape}{icon.label}</span>
                      <span className="telemetry-legend-name">{short}{form ? ` · ${form}` : ""}</span>
                      <span className="telemetry-legend-dot" style={{ background: s.color }} />
                    </button>
                  );
                })}
              </div>
            )}

            {archiveFleet.length > 0 && (
              <div className="telemetry-legend-group">
                <div className="telemetry-legend-label">Архив</div>
                {archiveFleet.map((s) => {
                  const icon = SAT_ICON_META[s.name] || { shape: "●", label: "?" };
                  const short = s.name.replace("Polytech_Universe-", "PU-");
                  return (
                    <button
                      key={s.name}
                      type="button"
                      className={`telemetry-legend-item${selectedSat === s.name ? " is-selected" : ""}${mapSats.has(s.name) ? "" : " is-off"}`}
                      onClick={() => focusOnSat(s.name)}
                    >
                      <span className="sat-icon-badge" style={{ color: s.color }}>{icon.shape}{icon.label}</span>
                      <span className="telemetry-legend-name">{short}</span>
                      <span className="telemetry-legend-dot" style={{ background: s.color }} />
                    </button>
                  );
                })}
              </div>
            )}
          </aside>

          <div className="telemetry-globe-main">
            {viewMode === "globe" ? (
              <ErrorBoundary>
                <GlobeCard
                  sat={sat}
                  atIso={at.toISOString()}
                  minutes={orbitMinutes}
                  stepSec={orbitStepSec}
                  orbitData={mapSats.has(sat) ? (orbitDataMap[sat] ?? null) : null}
                  multiOrbitData={orbitDataMap}
                  mapSats={mapSats}
                  fleetColorMap={fleetColorMap}
                  deadSatellites={DEAD_SATELLITES}
                  announcedSatellites={ANNOUNCED_SATELLITES}
                  onSatelliteClick={handleSatelliteClick}
                  focusTarget={focusTarget}
                />
              </ErrorBoundary>
            ) : (
              <MapCard
                receivedPoints={mapSats.has(sat) ? chartData : []}
                orbitTrack={mapSats.has(sat) ? (orbitDataMap[sat]?.track ?? []) : []}
                orbitCurrent={mapSats.has(sat) ? (orbitDataMap[sat]?.current ?? null) : null}
                multiOrbitData={orbitDataMap}
                mapSats={mapSats}
                fleetColorMap={fleetColorMap}
                deadSatellites={DEAD_SATELLITES}
                onSatelliteClick={handleSatelliteClick}
              />
            )}
          </div>

          <aside className="telemetry-side telemetry-side--help">
            <div className="telemetry-side-title">О карте</div>
            <p>
              Орбиты считаются по TLE/SGP4. Конус — зона радиовидимости относительно
              высоты орбиты. WASD / стрелки — поворот, колёсико — зум.
            </p>
            <div className="telemetry-side-title" style={{ marginTop: 14 }}>Проект</div>
            <p>
              Серия <b>Polytech Universe</b> (Space-π / ИЭиТ СПбПУ): мониторинг ЭМИ,
              AIS и образовательные смены. Анонсы PU-7…9 на карте до публикации TLE.
            </p>
            <ul className="telemetry-side-list">
              <li><span style={{ color: "#f97316" }}>◆6</span> PU-6 — активный 16U</li>
              <li><span style={{ color: "#22d3ee" }}>⬡7</span> PU-7 — анонс</li>
              <li><span style={{ color: "#fbbf24" }}>■8</span> PU-8 — анонс 3U</li>
              <li><span style={{ color: "#4ade80" }}>●9</span> PU-9 — анонс 3U</li>
            </ul>
          </aside>
        </div>

        {selectedSat && (
          <SatInfoPanel
            satName={selectedSat}
            rows={panelRows}
            chartData={chartData}
            isDead={isDead}
            deadInfo={deadInfo}
            isAnnounced={isAnnouncedSelected}
            announcedInfo={announcedInfo}
            onClose={() => setSelectedSat(null)}
          />
        )}
      </div>
    </div>
  );
}
