import React, { useState, useRef, useCallback, useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, BarChart, Bar,
} from "recharts";
import { MapContainer, TileLayer, CircleMarker, Popup, Polyline } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import {
  fetchTelemetry, isoDaysAgo,
  decodeAisFile, decodeTelemetryFile, demodulateIqFile, decodeBinaryFile,
} from "../api";

// ─── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  select: {
    background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 12px", color: "var(--text)", fontSize: 13, cursor: "pointer",
  },
  btnPrim: {
    background: "var(--grad-warm)", border: "1px solid var(--orange)", borderRadius: 8,
    padding: "8px 18px", color: "#1a3220", fontSize: 13, fontWeight: 700, cursor: "pointer",
    boxShadow: "0 4px 14px rgba(243,151,104,0.22)",
  },
  btnSec: {
    background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 14px", color: "var(--text)", fontSize: 13, cursor: "pointer",
  },
  btnDanger: {
    background: "rgba(218,73,39,0.16)", border: "1px solid rgba(218,73,39,0.35)",
    borderRadius: 6, width: 24, height: 24, cursor: "pointer",
    color: "#da4927", fontWeight: 700, fontSize: 14, lineHeight: "22px", textAlign: "center",
  },
  btnAdd: {
    background: "rgba(114,71,150,0.18)", border: "1px solid rgba(114,71,150,0.40)",
    borderRadius: 6, width: 24, height: 24, cursor: "pointer",
    color: "#9460b8", fontWeight: 700, fontSize: 16, lineHeight: "22px", textAlign: "center",
  },
  th: {
    padding: "8px 10px", fontSize: 10, color: "var(--text-muted)", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.6px", textAlign: "left",
    borderBottom: "1px solid var(--border)",
  },
  td: { padding: "5px 10px", borderBottom: "1px solid rgba(114,71,150,0.12)", color: "var(--text)", fontSize: 12 },
  card: {
    background: "var(--surface-1)", borderRadius: 12,
    border: "1px solid var(--border)", overflow: "hidden",
  },
  input: {
    width: "100%", boxSizing: "border-box",
    background: "var(--surface-2)", border: "1px solid var(--border)",
    borderRadius: 8, padding: "8px 12px", color: "var(--text)", fontSize: 14, outline: "none",
  },
};

// ─── Synthetic telemetry generator ────────────────────────────────────────────
const DEMO_SATS = ["Polytech_Universe-3", "Polytech_Universe-4"];

function genDemo(sat) {
  const seed = sat.includes("3") ? 42 : 137;
  const rng = (n) => { const x = Math.sin(n * seed * 9301 + 49297) * 233280; return x - Math.floor(x); };
  const now = Date.now();
  let temp = 15 + rng(0) * 20;
  let bat = 70 + rng(1) * 25;        // %
  let rssi = -95 + rng(2) * 18;      // dBm
  return Array.from({ length: 50 }, (_, i) => {
    const ts_ms = now - (49 - i) * 15 * 60 * 1000;
    temp += (rng(i + 1) - 0.48) * 6;
    temp = Math.max(-25, Math.min(55, temp));
    bat = Math.max(5, Math.min(100, bat + (rng(i + 30) - 0.55) * 1.2));
    rssi = Math.max(-120, Math.min(-55, rssi + (rng(i + 70) - 0.5) * 4));
    const d = new Date(ts_ms);
    return {
      id: i, ts_ms,
      label: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
      date: d.toLocaleDateString("ru-RU"),
      temp:    +temp.toFixed(2),
      volt:    +(3.5 + rng(i + 100) * 0.9).toFixed(3),
      battery: +bat.toFixed(1),
      rssi:    +rssi.toFixed(1),
    };
  });
}

// ─── Activity 1: Graph Builder ─────────────────────────────────────────────────
const PARAM_OPTIONS = [
  { key: "temp",    label: "Температура корпуса", unit: "°C", color: "#f39768" },
  { key: "volt",    label: "Напряжение шины",      unit: "В",  color: "#9460b8" },
  { key: "battery", label: "Заряд батареи",         unit: "%", color: "#6cc77b" },
  { key: "rssi",    label: "Уровень RSSI",          unit: "дБм", color: "#cbb98c" },
];

function GraphActivity() {
  const [selectedSat, setSelectedSat] = useState(DEMO_SATS[0]);
  const [allPoints, setAllPoints] = useState(() => genDemo(DEMO_SATS[0]));
  const [plotted, setPlotted] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [paramKey, setParamKey] = useState("temp");
  const chartRef = useRef(null);

  const param = PARAM_OPTIONS.find((p) => p.key === paramKey) || PARAM_OPTIONS[0];

  const loadReal = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const { from, to } = isoDaysAgo(7);
      const data = await fetchTelemetry({ sat: selectedSat, from, to, limit: 100 });
      // API возвращает массив TelemetryPacket с полем ts_utc (ISO string),
      // также могут встречаться ts_ms (миллисекунды) или ts (UNIX seconds).
      // Поэтому разбираем все три варианта аккуратно.
      const list = Array.isArray(data) ? data : (data.points || []);
      const pts = list
        .filter((p) => p.temp_c != null || p.battery_capacity_pct != null)
        .slice(0, 50)
        .map((p, i) => {
          const ts = p.ts_utc ? new Date(p.ts_utc) :
                     p.ts_ms  ? new Date(p.ts_ms) :
                     p.ts     ? new Date(p.ts * 1000) : new Date();
          return {
            id: i,
            ts_ms: ts.getTime(),
            label: `${String(ts.getUTCHours()).padStart(2, "0")}:${String(ts.getUTCMinutes()).padStart(2, "0")}`,
            date: ts.toLocaleDateString("ru-RU"),
            temp:    p.temp_c   != null ? +Number(p.temp_c).toFixed(2) : null,
            volt:    p.vbus_mv  != null ? +(Number(p.vbus_mv) / 1000).toFixed(3) : (p.volt ? +Number(p.volt).toFixed(3) : 3.7),
            battery: p.battery_capacity_pct != null ? +Number(p.battery_capacity_pct).toFixed(1) : null,
            rssi:    p.rssi_dbm != null ? Number(p.rssi_dbm) : null,
          };
        });
      if (pts.length > 0) { setAllPoints(pts); setPlotted([]); setNotice(`Загружено ${pts.length} реальных точек`); setUploadAis([]); }
      else { setNotice("Реальных данных нет — используются демо-данные"); }
    } catch { setNotice("Нет подключения к API — используются демо-данные"); }
    setLoading(false);
  }, [selectedSat]);

  // Загрузка пользовательского пакета — телеметрия (.bin) или AIS (.txt)
  const [uploadAis, setUploadAis] = useState([]);   // декодированные AIS-точки для карты
  const handleUserFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLoading(true); setNotice("");
    const isAis = /\.(txt|aivdm|log)$/i.test(file.name);
    try {
      if (isAis) {
        const res = await decodeAisFile(file);
        const pts = (res.decoded || []).filter(p => p.lat != null && p.lon != null).map((p, i) => ({
          id: i, mmsi: p.mmsi, lat: p.lat, lon: p.lon,
          speed: p.speed, course: p.course, heading: p.heading,
          status: p.status, msg_type: p.msg_type,
        }));
        setUploadAis(pts); setPlotted([]); setAllPoints([]);
        setNotice(`AIS: декодировано ${res.count} сообщений (${res.errors} ошибок)`);
      } else {
        const res = await decodeTelemetryFile(file);
        const pts = (res.packets || [])
          .filter(p => p.crc_ok || p.sync_ok)
          .map((p, i) => ({
            id: i,
            ts_ms: (p.ts_unix || Math.floor(Date.now() / 1000)) * 1000,
            label: p.ts_iso ? p.ts_iso.slice(11, 16) : `#${i}`,
            date: p.ts_iso ? p.ts_iso.slice(0, 10) : "",
            temp: +(p.temp_c ?? 0).toFixed(2),
            volt: +((p.vbus_mv ?? 0) / 1000).toFixed(3),
            battery: p.battery_pct,
            rssi: p.rssi_dbm,
          }));
        if (pts.length === 0) {
          setNotice(`В файле не найдено валидных пакетов (всего ${res.count}). Проверь формат.`);
        } else {
          setAllPoints(pts); setPlotted([]); setUploadAis([]);
          setNotice(`Декодировано ${pts.length} телеметрия-пакетов из «${file.name}»`);
        }
      }
    } catch (err) {
      setNotice("Ошибка: " + (err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const addPoint = (pt) => {
    if (plotted.find(p => p.id === pt.id)) return;
    setPlotted(prev => [...prev, pt].sort((a, b) => a.ts_ms - b.ts_ms));
  };
  const removePoint = (id) => setPlotted(prev => prev.filter(p => p.id !== id));
  const addAll = () => setPlotted([...allPoints]);
  const clearAll = () => setPlotted([]);

  const downloadCSV = () => {
    const header = "Время,Дата,Температура (°C),Напряжение (В),Заряд батареи (%),RSSI (дБм)";
    const rows = [header,
      ...plotted.map((p) =>
        `${p.label},${p.date},${p.temp ?? ""},${p.volt ?? ""},${p.battery ?? ""},${p.rssi ?? ""}`
      )];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" }));
    a.download = `${paramKey}_${selectedSat.replace(/\s/g, "_")}.csv`;
    a.click();
  };

  const downloadPNG = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg || plotted.length === 0) return;
    const clone = svg.cloneNode(true);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#0d0a18");
    clone.insertBefore(bg, clone.firstChild);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = svg.clientWidth || 700; c.height = svg.clientHeight || 300;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0d0a18"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `temp_${selectedSat.replace(/\s/g,"_")}.png`; a.click(); }, "image/png");
    };
    img.src = url;
  };

  const stats = plotted.length > 0 ? (() => {
    const vals = plotted.map((p) => p[paramKey]).filter((v) => v != null && Number.isFinite(v));
    if (!vals.length) return null;
    return {
      count: vals.length,
      min: +Math.min(...vals).toFixed(2),
      max: +Math.max(...vals).toFixed(2),
      avg: +(vals.reduce((s, v) => s + v, 0) / vals.length).toFixed(2),
    };
  })() : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Controls row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selectedSat}
          onChange={e => { setSelectedSat(e.target.value); setAllPoints(genDemo(e.target.value)); setPlotted([]); setUploadAis([]); setNotice(""); }}
          style={S.select}
        >
          {DEMO_SATS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={paramKey} onChange={(e) => setParamKey(e.target.value)} style={S.select} title="Параметр для графика">
          {PARAM_OPTIONS.map((p) => (
            <option key={p.key} value={p.key}>{p.label} ({p.unit})</option>
          ))}
        </select>
        <button onClick={loadReal} disabled={loading} style={S.btnSec}>
          {loading ? "Загрузка..." : "Загрузить с сервера"}
        </button>
        <label style={{ ...S.btnPrim, cursor: "pointer", display: "inline-block" }}>
          {loading ? "..." : "↑ Загрузить свой пакет"}
          <input
            type="file"
            accept=".bin,.dat,.tlm,.txt,.aivdm,.log"
            style={{ display: "none" }}
            onChange={handleUserFile}
            disabled={loading}
          />
        </label>
        <span style={{ fontSize: 11, color: "var(--text-muted)", maxWidth: 240 }}>
          .bin/.dat — телеметрия · .txt/.aivdm — AIS
        </span>
        {notice && <span style={{ fontSize: 12, color: "var(--accent-2)", flex: "1 0 100%" }}>{notice}</span>}
      </div>

      {/* Если загружен AIS — рисуем карту с точками */}
      {uploadAis.length > 0 && (
        <div style={{ ...S.card, padding: 0, height: 360, overflow: "hidden" }}>
          <MapContainer
            center={[uploadAis[0].lat, uploadAis[0].lon]}
            zoom={4}
            style={{ height: "100%", width: "100%" }}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
              attribution="&copy; CARTO"
            />
            {uploadAis.map(p => (
              <CircleMarker
                key={p.id}
                center={[p.lat, p.lon]}
                radius={6}
                pathOptions={{ color: "#f39768", fillColor: "#f39768", fillOpacity: 0.85, weight: 1 }}
              >
                <Popup>
                  <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, color: "#ede8f5" }}>
                    <div style={{ color: "#f39768", fontWeight: 700, marginBottom: 4 }}>MMSI {p.mmsi}</div>
                    Скорость: {p.speed} уз<br />
                    Курс: {p.course}°<br />
                    Тип msg: {p.msg_type}
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(260px,1fr) minmax(340px,1.6fr)", gap: 16 }}>
        {/* Left: data table */}
        <div style={S.card}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
              Доступные точки ({allPoints.length})
            </span>
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={addAll} style={{ ...S.btnSec, padding: "3px 8px", fontSize: 11 }}>Все +</button>
              <button onClick={clearAll} style={{ ...S.btnSec, padding: "3px 8px", fontSize: 11 }}>Сбросить</button>
            </div>
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)" }}>
                <tr>
                  <th style={S.th}>Время</th>
                  <th style={S.th}>Дата</th>
                  <th style={S.th}>{param.unit}</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {allPoints.map(pt => {
                  const added = !!plotted.find(p => p.id === pt.id);
                  const v = pt[paramKey];
                  return (
                    <tr key={pt.id} style={{ background: added ? "rgba(114,71,150,0.12)" : "transparent", transition: "background 0.15s" }}>
                      <td style={S.td}>{pt.label}</td>
                      <td style={{ ...S.td, color: "var(--text-muted)", fontSize: 11 }}>{pt.date}</td>
                      <td style={{ ...S.td, color: param.color, fontWeight: 600 }}>
                        {v != null && Number.isFinite(v) ? v : "—"}
                      </td>
                      <td style={S.td}>
                        <button
                          onClick={() => added ? removePoint(pt.id) : addPoint(pt)}
                          style={added ? S.btnDanger : S.btnAdd}
                          title={added ? "Убрать с графика" : "Добавить на график"}
                        >
                          {added ? "−" : "+"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: chart */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Stats */}
          {stats && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {[
                ["Точек", stats.count],
                [`Мин ${param.unit}`, stats.min],
                [`Макс ${param.unit}`, stats.max],
                [`Среднее ${param.unit}`, stats.avg],
              ].map(([label, val]) => (
                <div key={label} style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 10, padding: "8px 10px", textAlign: "center" }}>
                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: "var(--accent)" }}>{val}</div>
                </div>
              ))}
            </div>
          )}

          {/* Chart */}
          <div ref={chartRef} style={{ ...S.card, padding: "14px 14px 6px", minHeight: 270, flexGrow: 1 }}>
            {plotted.length === 0 ? (
              <div style={{ height: 250, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Нажимай <strong style={{ color: "var(--accent)" }}>+</strong> рядом с точками, чтобы построить график
                </span>
              </div>
            ) : plotted.filter(p => p[paramKey] != null && Number.isFinite(p[paramKey])).length === 0 ? (
              <div style={{ height: 250, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  В выбранных пакетах нет значений для «{param.label}». Попробуй другой параметр или другой источник данных.
                </span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={plotted} margin={{ top: 5, right: 8, left: -22, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(86,150,91,0.18)" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "#8aa090" }}
                    label={{ value: "Время (UTC)", position: "insideBottom", offset: -2, fill: "#8aa090", fontSize: 10 }}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#8aa090" }} unit={` ${param.unit}`} />
                  <Tooltip
                    contentStyle={{ background: "#231c3e", border: "1px solid rgba(114,71,150,0.55)", borderRadius: 8, fontSize: 12, color: "#ede8f5" }}
                    formatter={(v) => [`${v} ${param.unit}`, param.label]}
                    labelFormatter={(label, items) => {
                      const it = items?.[0]?.payload;
                      return it ? `${it.date} ${it.label} UTC` : label;
                    }}
                  />
                  <ReferenceLine y={0} stroke="rgba(114,71,150,0.55)" strokeDasharray="4 2" />
                  <Line
                    type="monotone" dataKey={paramKey} stroke={param.color} strokeWidth={2}
                    dot={{ fill: param.color, r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5 }} animationDuration={250}
                    isAnimationActive={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Downloads */}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={downloadCSV} disabled={plotted.length === 0} style={{ ...S.btnPrim, opacity: plotted.length === 0 ? 0.5 : 1 }}>
              ⬇ Скачать CSV
            </button>
            <button onClick={downloadPNG} disabled={plotted.length === 0} style={{ ...S.btnSec, opacity: plotted.length === 0 ? 0.5 : 1 }}>
              🖼 Скачать PNG
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Packet format & utilities ─────────────────────────────────────────────────
// Byte 0:     sync1       0xAA
// Byte 1:     sync2       0x55
// Byte 2:     sat_id      uint8   (1=PU-3, 2=PU-4)
// Byte 3:     pkt_type    uint8   (0x01 = telemetry)
// Byte 4–7:   timestamp   uint32  LE (Unix seconds)
// Byte 8–9:   temperature int16   LE (°C × 100)
// Byte 10–11: voltage     uint16  LE (millivolts)
// Byte 12:    checksum    uint8   XOR of bytes 0..11
function buildPacket(satId, tempC, voltV, unixTs) {
  const buf = new ArrayBuffer(13);
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  u8[0] = 0xAA; u8[1] = 0x55; u8[2] = satId; u8[3] = 0x01;
  dv.setUint32(4, unixTs >>> 0, true);
  dv.setInt16(8, Math.round(tempC * 100), true);
  dv.setUint16(10, Math.round(voltV * 1000), true);
  let cs = 0; for (let i = 0; i < 12; i++) cs ^= u8[i];
  u8[12] = cs;
  return u8;
}

function toHexArr(u8) {
  return Array.from(u8).map(b => b.toString(16).toUpperCase().padStart(2, "0"));
}

const FIELD_COLOR = {
  sync: "#f3cb68", sat: "#9460b8", type: "#724796",
  ts: "#8878a4", temp: "#da4927", volt: "#f39768", cs: "#c2b5d4",
};

function byteField(i) {
  if (i <= 1) return "sync";
  if (i === 2) return "sat";
  if (i === 3) return "type";
  if (i >= 4 && i <= 7) return "ts";
  if (i >= 8 && i <= 9) return "temp";
  if (i >= 10 && i <= 11) return "volt";
  return "cs";
}

const FORMAT_ROWS = [
  { field: "sync",  offset: "0–1",   fmt: "2 байта",   desc: "Синхрослово — маркер начала пакета (AA 55)" },
  { field: "sat",   offset: "2",     fmt: "uint8",     desc: "ID спутника: 1 = PU-3, 2 = PU-4" },
  { field: "type",  offset: "3",     fmt: "uint8",     desc: "Тип пакета: 01 = телеметрия" },
  { field: "ts",    offset: "4–7",   fmt: "uint32 LE", desc: "Метка времени Unix (little-endian, секунды)" },
  { field: "temp",  offset: "8–9",   fmt: "int16 LE",  desc: "Температура × 100 (знаковый, little-endian). Пример: 2345 → 23.45 °C" },
  { field: "volt",  offset: "10–11", fmt: "uint16 LE", desc: "Напряжение в мВ (little-endian). Пример: 3750 → 3.750 В" },
  { field: "cs",    offset: "12",    fmt: "uint8",     desc: "Контрольная сумма: XOR всех байт 0..11" },
];

const PACKETS = [
  { id: 1, label: "PU-3 · Телеметрия #1", sat: "PU-3", satId: 1, tempC:  23.45, voltV: 3.750, unixTs: 1700000000 },
  { id: 2, label: "PU-3 · Телеметрия #2", sat: "PU-3", satId: 1, tempC: -12.30, voltV: 3.620, unixTs: 1700003600 },
  { id: 3, label: "PU-4 · Телеметрия #1", sat: "PU-4", satId: 2, tempC:  35.12, voltV: 4.100, unixTs: 1700007200 },
  { id: 4, label: "PU-4 · Телеметрия #2", sat: "PU-4", satId: 2, tempC:  -5.00, voltV: 3.850, unixTs: 1700010800 },
].map(p => ({ ...p, bytes: buildPacket(p.satId, p.tempC, p.voltV, p.unixTs) }));

// ─── Activity 2: Packet Decoder ─────────────────────────────────────────────────

// Built-in field types for custom format
const FIELD_TYPES = [
  { key: "uint8",   label: "uint8  (1 байт, 8 бит)",    bytes: 1, signed: false },
  { key: "int8",    label: "int8   (1 байт, 8 бит)",    bytes: 1, signed: true  },
  { key: "uint16",  label: "uint16 (2 байта, 16 бит)",  bytes: 2, signed: false },
  { key: "int16",   label: "int16  (2 байта, 16 бит)",  bytes: 2, signed: true  },
  { key: "uint32",  label: "uint32 (4 байта, 32 бит)",  bytes: 4, signed: false },
  { key: "int32",   label: "int32  (4 байта, 32 бит)",  bytes: 4, signed: true  },
  { key: "uint64",  label: "uint64 (8 байт, 64 бит)",   bytes: 8, signed: false },
  { key: "float32", label: "float  (4 байта, 32 бит)",  bytes: 4, signed: false },
  { key: "bytes1",  label: "raw 1 байт",                bytes: 1, signed: false },
  { key: "bytes2",  label: "raw 2 байта",               bytes: 2, signed: false },
  { key: "bytes4",  label: "raw 4 байта",               bytes: 4, signed: false },
];

const ENDIAN_OPTS = [
  { key: "LE", label: "LE (little-endian)" },
  { key: "BE", label: "BE (big-endian)" },
];

const FIELD_PALETTE = [
  "#f3cb68","#9460b8","#f39768","#da4927","#6cc77b","#cbb98c",
  "#56965b","#8878a4","#b05c24","#5b8ab0","#c2b5d4","#7ac8b0",
];

function parseFieldValue(dv, offset, typeKey, endian) {
  const le = endian === "LE";
  try {
    switch (typeKey) {
      case "uint8":   return dv.getUint8(offset);
      case "int8":    return dv.getInt8(offset);
      case "uint16":  return dv.getUint16(offset, le);
      case "int16":   return dv.getInt16(offset, le);
      case "uint32":  return dv.getUint32(offset, le);
      case "int32":   return dv.getInt32(offset, le);
      case "uint64":  {
        const hi = dv.getUint32(le ? offset + 4 : offset, le);
        const lo = dv.getUint32(le ? offset : offset + 4, le);
        return (BigInt(hi) << 32n | BigInt(lo)).toString();
      }
      case "float32": return dv.getFloat32(offset, le).toFixed(4);
      case "bytes1":
      case "bytes2":
      case "bytes4": {
        const ft = FIELD_TYPES.find(f => f.key === typeKey);
        const arr = [];
        for (let i = 0; i < ft.bytes; i++) arr.push(dv.getUint8(offset + i).toString(16).toUpperCase().padStart(2, "0"));
        return arr.join(" ");
      }
      default: return "?";
    }
  } catch {
    return "—";
  }
}

function parseCustomPacket(hexStr, fields) {
  const clean = hexStr.replace(/\s+/g, "").replace(/^0x/i, "");
  if (!/^[0-9a-fA-F]*$/.test(clean) || clean.length % 2 !== 0) return { error: "Неверный HEX (нечётное количество символов или недопустимые символы)" };
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  const dv = new DataView(bytes.buffer);
  let offset = 0;
  const parsed = [];
  for (const f of fields) {
    const ft = FIELD_TYPES.find(t => t.key === f.type) || FIELD_TYPES[0];
    if (offset + ft.bytes > bytes.length) {
      parsed.push({ ...f, value: "— (за пределами пакета)", offset, bytes: ft.bytes, outOfRange: true });
      offset += ft.bytes;
      continue;
    }
    const rawBytes = Array.from(bytes.slice(offset, offset + ft.bytes)).map(b => b.toString(16).toUpperCase().padStart(2, "0"));
    const value = parseFieldValue(dv, offset, f.type, f.endian);
    parsed.push({ ...f, value, offset, bytes: ft.bytes, rawBytes, outOfRange: false });
    offset += ft.bytes;
  }
  return { parsed, totalBytes: bytes.length, usedBytes: offset, rawBytes: Array.from(bytes) };
}

const DEFAULT_CUSTOM_FIELDS = [
  { id: 1, name: "sync",   type: "uint16",  endian: "LE" },
  { id: 2, name: "sat_id", type: "uint8",   endian: "LE" },
  { id: 3, name: "temp",   type: "int16",   endian: "LE" },
  { id: 4, name: "volt",   type: "uint16",  endian: "LE" },
  { id: 5, name: "crc",    type: "uint8",   endian: "LE" },
];

// ─── AIS sub-decoder (inside Packet Decoder) ───────────────────────────────────
function AisDecodeSubTab() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError(""); setResult(null);
    try {
      const r = await decodeAisFile(file);
      setResult(r);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  // Точки с координатами — для карты-траектории
  const geoPoints = useMemo(
    () => (result?.decoded || []).filter(p => p.lat != null && p.lon != null),
    [result]
  );

  // Гистограмма по типам сообщений (msg_type 1/2/3/5/...)
  const msgTypeChart = useMemo(() => {
    const counts = {};
    for (const p of (result?.decoded || [])) {
      const k = `msg ${p.msg_type ?? "?"}`;
      counts[k] = (counts[k] || 0) + 1;
    }
    return Object.entries(counts)
      .map(([k, v]) => ({ type: k, count: v }))
      .sort((a, b) => b.count - a.count);
  }, [result]);

  // Распределение скоростей — для второго чарта
  const speedChart = useMemo(() => {
    const bins = [0, 0, 0, 0, 0, 0, 0]; // 0-5,5-10,10-15,15-20,20-25,25-30,30+
    for (const p of (result?.decoded || [])) {
      const v = Number(p.speed);
      if (!Number.isFinite(v)) continue;
      const i = Math.min(6, Math.floor(v / 5));
      bins[i]++;
    }
    const labels = ["0–5", "5–10", "10–15", "15–20", "20–25", "25–30", "30+"];
    return labels.map((label, i) => ({ label, count: bins[i] }));
  }, [result]);

  // Группируем подряд идущие точки по MMSI в треки (для Polyline)
  const tracksByMmsi = useMemo(() => {
    const map = new Map();
    for (const p of geoPoints) {
      if (p.mmsi == null) continue;
      if (!map.has(p.mmsi)) map.set(p.mmsi, []);
      map.get(p.mmsi).push([p.lat, p.lon]);
    }
    return [...map.entries()].filter(([, pts]) => pts.length >= 2);
  }, [geoPoints]);

  const center = geoPoints.length
    ? [geoPoints[0].lat, geoPoints[0].lon]
    : [55.0, 30.0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.card, padding: 18 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-dim)", marginBottom: 12 }}>
          <strong style={{ color: "var(--orange)" }}>AIS-парсер.</strong>{" "}
          Загрузите файл с пакетами NMEA-AIVDM (по строке на пакет).
          Декодированные позиции автоматически появятся на карте-траектории,
          а распределение типов сообщений и скоростей — на графиках ниже.
        </div>
        <pre style={{ padding: 10, background: "#130e22", borderRadius: 6, fontSize: 11, color: "var(--accent-2)", overflow: "auto", marginBottom: 12 }}>
{`!AIVDM,1,1,,A,13lq2>002f0V3scdr8ATr40p8L07,0*6A
!AIVDM,1,1,,B,15?dU2h0j710dfifFDumRTHr0<0=,0*33`}
        </pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ ...S.btnPrim, cursor: "pointer", display: "inline-block" }}>
            {busy ? "Декодирую…" : "↑ Загрузить AIS-файл"}
            <input type="file" accept=".txt,.aivdm,.log" style={{ display: "none" }} onChange={handle} disabled={busy} />
          </label>
          {result && (
            <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
              <strong style={{ color: "var(--accent)" }}>{result.count}</strong> декодировано
              {" · "}
              <strong style={{ color: "var(--orange-2)" }}>{result.errors}</strong> ошибок
              {" · "}
              <strong style={{ color: "var(--accent-2)" }}>{geoPoints.length}</strong> с координатами
            </span>
          )}
        </div>
        {error && <div style={{ marginTop: 10, color: "var(--orange-2)", fontSize: 13 }}>Ошибка: {error}</div>}
      </div>

      {result && (
        <>
          {/* Карта-траектория с MMSI-треками */}
          {geoPoints.length > 0 && (
            <div style={{ ...S.card, padding: 0, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                  Траектории · {tracksByMmsi.length} судов с маршрутом
                </span>
                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Точки — отдельные AIS-репорты, линии — последовательные позиции одного MMSI
                </span>
              </div>
              <div style={{ height: 380 }}>
                <MapContainer center={center} zoom={4} style={{ height: "100%", width: "100%" }} preferCanvas>
                  <TileLayer
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png"
                    attribution="&copy; CARTO"
                  />
                  {tracksByMmsi.map(([mmsi, pts]) => (
                    <Polyline
                      key={`trk-${mmsi}`}
                      positions={pts}
                      pathOptions={{ color: "#f39768", weight: 2, opacity: 0.55, dashArray: "4 4" }}
                    />
                  ))}
                  {geoPoints.map((p, i) => (
                    <CircleMarker
                      key={`pt-${i}`}
                      center={[p.lat, p.lon]}
                      radius={5}
                      pathOptions={{ color: "#9460b8", fillColor: "#9460b8", fillOpacity: 0.85, weight: 1 }}
                    >
                      <Popup>
                        <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 11, color: "#ede8f5" }}>
                          <div style={{ color: "#f39768", fontWeight: 700, marginBottom: 4 }}>MMSI {p.mmsi}</div>
                          msg {p.msg_type} · {typeof p.lat === "number" ? p.lat.toFixed(4) : "—"} / {typeof p.lon === "number" ? p.lon.toFixed(4) : "—"}<br />
                          {p.speed != null && <>SOG: {p.speed} уз<br /></>}
                          {p.course != null && <>COG: {p.course}°<br /></>}
                          {p.heading != null && <>HDG: {p.heading}°<br /></>}
                          {p.status != null && <span style={{ color: "var(--text-muted)" }}>{String(p.status)}</span>}
                        </div>
                      </Popup>
                    </CircleMarker>
                  ))}
                </MapContainer>
              </div>
            </div>
          )}

          {/* Чарт: типы сообщений + распределение скоростей */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div style={{ ...S.card, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Типы AIS-сообщений
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={msgTypeChart} margin={{ top: 5, right: 8, left: -22, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(114,71,150,0.18)" />
                  <XAxis dataKey="type" tick={{ fontSize: 10, fill: "#8aa090" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#8aa090" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#231c3e", border: "1px solid rgba(114,71,150,0.55)", borderRadius: 8, fontSize: 12, color: "#ede8f5" }} />
                  <Bar dataKey="count" fill="#9460b8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div style={{ ...S.card, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Распределение скоростей (узлы)
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={speedChart} margin={{ top: 5, right: 8, left: -22, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(114,71,150,0.18)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#8aa090" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#8aa090" }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: "#231c3e", border: "1px solid rgba(114,71,150,0.55)", borderRadius: 8, fontSize: 12, color: "#ede8f5" }} />
                  <Bar dataKey="count" fill="#f39768" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Таблица с декодированными полями */}
          <div style={{ ...S.card, padding: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text)", fontWeight: 600 }}>Файл: {result.filename}</span>
              <span style={{ color: "var(--accent-2)", fontFamily: "'Space Mono', monospace" }}>
                ✓ {result.count} · ✗ {result.errors}
              </span>
            </div>
            <div style={{ maxHeight: 380, overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)" }}>
                  <tr>
                    {["MMSI", "msg", "lat", "lon", "speed", "course", "heading", "status"].map(h => (
                      <th key={h} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.decoded.map((p, i) => (
                    <tr key={i} style={{ background: i % 2 ? "transparent" : "rgba(114,71,150,0.06)" }}>
                      <td style={{ ...S.td, color: "var(--orange)", fontWeight: 600 }}>{p.mmsi}</td>
                      <td style={S.td}>{p.msg_type}</td>
                      <td style={S.td}>{typeof p.lat === "number" ? p.lat.toFixed(4) : "—"}</td>
                      <td style={S.td}>{typeof p.lon === "number" ? p.lon.toFixed(4) : "—"}</td>
                      <td style={S.td}>{p.speed ?? "—"}</td>
                      <td style={S.td}>{p.course ?? "—"}</td>
                      <td style={S.td}>{p.heading ?? "—"}</td>
                      <td style={{ ...S.td, color: "var(--text-muted)" }}>{String(p.status ?? "")}</td>
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

function PacketDecodeActivity() {
  // ── Tab: preset vs custom vs ais ────────────────────────────────────
  const [tab, setTab] = useState("preset"); // "preset" | "custom" | "ais"

  // ── Preset mode ──────────────────────────────────────────────────────
  const [packetId, setPacketId] = useState(1);
  const [form, setForm] = useState({ sat_id: "", temp: "", volt: "", cs: "" });
  const [submitted, setSubmitted] = useState(false);
  const [showFormat, setShowFormat] = useState(true);
  const [highlightField, setHighlightField] = useState(null);

  const pkt = PACKETS.find(p => p.id === packetId);
  const hexArr = toHexArr(pkt.bytes);

  const changePacket = (id) => {
    setPacketId(Number(id));
    setForm({ sat_id: "", temp: "", volt: "", cs: "" });
    setSubmitted(false);
  };

  const results = submitted
    ? {
        sat_id: Number(form.sat_id) === pkt.satId,
        temp: Math.abs(parseFloat(form.temp) - pkt.tempC) < 0.01,
        volt: Math.abs(parseFloat(form.volt) - pkt.voltV) < 0.005,
        cs: form.cs.trim().toUpperCase().replace(/^0X/, "") === pkt.bytes[12].toString(16).toUpperCase().padStart(2, "0"),
      }
    : null;
  const score = results ? Object.values(results).filter(Boolean).length : 0;
  const tsDate = new Date(pkt.unixTs * 1000).toUTCString();

  // ── Custom mode ──────────────────────────────────────────────────────
  const [customHex, setCustomHex] = useState("AA 55 01 91 09 48 65 00 BD 09 A6 0E C4");
  const [customFields, setCustomFields] = useState(DEFAULT_CUSTOM_FIELDS);
  const [nextId, setNextId] = useState(DEFAULT_CUSTOM_FIELDS.length + 1);
  const [customResult, setCustomResult] = useState(null);
  const [customError, setCustomError] = useState("");

  const addField = () => {
    setCustomFields(prev => [...prev, { id: nextId, name: `field_${nextId}`, type: "uint8", endian: "LE" }]);
    setNextId(n => n + 1);
    setCustomResult(null);
  };

  const removeField = (id) => {
    setCustomFields(prev => prev.filter(f => f.id !== id));
    setCustomResult(null);
  };

  const updateField = (id, key, val) => {
    setCustomFields(prev => prev.map(f => f.id === id ? { ...f, [key]: val } : f));
    setCustomResult(null);
  };

  const runDecode = () => {
    setCustomError("");
    if (!customHex.trim()) { setCustomError("Введите HEX-строку пакета"); return; }
    if (customFields.length === 0) { setCustomError("Добавьте хотя бы одно поле"); return; }
    const res = parseCustomPacket(customHex, customFields);
    if (res.error) { setCustomError(res.error); setCustomResult(null); return; }
    setCustomResult(res);
  };

  const tabStyle = (active) => ({
    padding: "8px 20px", borderRadius: "8px 8px 0 0", cursor: "pointer", fontSize: 13,
    fontWeight: active ? 700 : 400,
    background: active ? "var(--surface-1)" : "transparent",
    border: active ? "1px solid var(--border)" : "1px solid transparent",
    borderBottom: active ? "1px solid var(--surface-1)" : "1px solid var(--border)",
    color: active ? "var(--accent)" : "var(--text-muted)",
    marginBottom: -1,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        <button onClick={() => setTab("preset")} style={tabStyle(tab === "preset")}>Встроенные пакеты</button>
        <button onClick={() => setTab("custom")} style={tabStyle(tab === "custom")}>Свой пакет и формат</button>
        <button onClick={() => setTab("ais")}    style={tabStyle(tab === "ais")}>AIS · парсер + траектории</button>
      </div>

      {/* ════════════════════ PRESET TAB ════════════════════ */}
      {tab === "preset" && (
        <>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <select value={packetId} onChange={e => changePacket(e.target.value)} style={S.select}>
              {PACKETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
            <button onClick={() => setShowFormat(v => !v)} style={S.btnSec}>
              {showFormat ? "Скрыть" : "Показать"} формат пакета
            </button>
          </div>

          {showFormat && (
            <div style={S.card}>
              <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span>Формат телеметрического пакета · 13 байт</span>
                <a href="https://spacepi.space/satellites/politeh-yunivers-3/" target="_blank" rel="noreferrer"
                  style={{ fontSize: 11, color: "var(--orange)", textDecoration: "none", padding: "3px 10px", border: "1px solid var(--orange)", borderRadius: 6 }}>
                  ↗ Документация
                </a>
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      {["Поле", "Смещение", "Формат", "Описание"].map(h => (
                        <th key={h} style={{ ...S.th, textAlign: "left" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {FORMAT_ROWS.map(row => (
                      <tr key={row.field}
                        style={{ background: highlightField === row.field ? `${FIELD_COLOR[row.field]}18` : "transparent", transition: "background 0.15s" }}
                        onMouseEnter={() => setHighlightField(row.field)} onMouseLeave={() => setHighlightField(null)}>
                        <td style={{ ...S.td, color: FIELD_COLOR[row.field], fontWeight: 700, whiteSpace: "nowrap" }}>■ {row.field.toUpperCase()}</td>
                        <td style={{ ...S.td, fontFamily: "monospace" }}>{row.offset}</td>
                        <td style={{ ...S.td, fontFamily: "monospace", whiteSpace: "nowrap" }}>{row.fmt}</td>
                        <td style={{ ...S.td, color: "var(--text-muted)" }}>{row.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{ background: "#130e22", borderRadius: 12, border: "1px solid var(--border)", padding: "14px 18px" }}>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, letterSpacing: "0.5px" }}>
              HEX DUMP &nbsp;·&nbsp; {hexArr.length} байт &nbsp;·&nbsp; наведи мышь на байт
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {hexArr.map((hex, i) => {
                const f = byteField(i);
                const isHl = highlightField === f;
                return (
                  <span key={i} title={`[${i}] ${f.toUpperCase()}`}
                    onMouseEnter={() => setHighlightField(f)} onMouseLeave={() => setHighlightField(null)}
                    style={{
                      fontFamily: "monospace", fontSize: 14, fontWeight: 600,
                      padding: "3px 8px", borderRadius: 6,
                      background: isHl ? `${FIELD_COLOR[f]}33` : `${FIELD_COLOR[f]}16`,
                      color: FIELD_COLOR[f],
                      border: `1px solid ${isHl ? FIELD_COLOR[f] : FIELD_COLOR[f] + "44"}`,
                      transition: "all 0.12s", cursor: "default",
                      boxShadow: isHl ? `0 0 8px ${FIELD_COLOR[f]}55` : "none",
                    }}>{hex}</span>
                );
              })}
            </div>
            <div style={{ marginTop: 12, fontSize: 11, color: "#8aa090" }}>TS (справка): {tsDate}</div>
          </div>

          <div style={{ ...S.card, padding: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16, color: "var(--text)" }}>Декодируй поля пакета</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              {[
                { key: "sat_id",  label: "ID спутника",            field: "sat",  hint: "Число 1 или 2",           placeholder: "1" },
                { key: "temp",    label: "Температура (°C)",        field: "temp", hint: "Пример: 23.45 или -12.30", placeholder: "0.00" },
                { key: "volt",    label: "Напряжение (В)",          field: "volt", hint: "Пример: 3.750",            placeholder: "0.000" },
                { key: "cs",      label: "Контрольная сумма (hex)", field: "cs",   hint: "Пример: A3 или 0xa3",      placeholder: "XX" },
              ].map(f => {
                const ok = results ? results[f.key] : null;
                return (
                  <div key={f.key} onMouseEnter={() => setHighlightField(f.field)} onMouseLeave={() => setHighlightField(null)}>
                    <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                      <span style={{ color: FIELD_COLOR[f.field], marginRight: 5 }}>■</span>{f.label}
                    </label>
                    <input type="text" value={form[f.key]}
                      onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                      placeholder={f.placeholder} disabled={submitted}
                      style={{ ...S.input, borderColor: ok === true ? "#724796" : ok === false ? "#da4927" : "var(--border)" }} />
                    <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{f.hint}</div>
                  </div>
                );
              })}
            </div>

            {!submitted ? (
              <button onClick={() => setSubmitted(true)} style={{ ...S.btnPrim, marginTop: 18, padding: "10px 24px" }}>
                ✅ Проверить
              </button>
            ) : (
              <div style={{
                marginTop: 18, padding: 16, borderRadius: 12,
                background: score === 4 ? "rgba(114,71,150,0.12)" : "rgba(218,73,39,0.10)",
                border: `1px solid ${score === 4 ? "rgba(114,71,150,0.45)" : "rgba(218,73,39,0.45)"}`,
              }}>
                <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: score === 4 ? "#9460b8" : "#f39768" }}>
                  {score === 4 ? "Пакет полностью декодирован!" : `Верно ${score} из 4 полей`}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: results.sat_id ? "var(--accent)" : "var(--orange-2)" }}>{results.sat_id ? "✓" : "✗"}</span> ID спутника:&nbsp;
                    <span style={{ color: FIELD_COLOR.sat, fontWeight: 600 }}>{pkt.satId} ({pkt.sat})</span>
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: results.temp ? "var(--accent)" : "var(--orange-2)" }}>{results.temp ? "✓" : "✗"}</span> Температура:&nbsp;
                    <span style={{ color: FIELD_COLOR.temp, fontWeight: 600 }}>{pkt.tempC.toFixed(2)} °C</span>
                    {!results.temp && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                        Подсказка: байты 8–9 = {toHexArr(pkt.bytes).slice(8,10).join(" ")} → int16 LE = {Math.round(pkt.tempC * 100)} → делим на 100
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: results.volt ? "var(--accent)" : "var(--orange-2)" }}>{results.volt ? "✓" : "✗"}</span> Напряжение:&nbsp;
                    <span style={{ color: FIELD_COLOR.volt, fontWeight: 600 }}>{pkt.voltV.toFixed(3)} В</span>
                    {!results.volt && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                        Подсказка: байты 10–11 = {toHexArr(pkt.bytes).slice(10,12).join(" ")} → uint16 LE = {Math.round(pkt.voltV * 1000)} → делим на 1000
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    <span style={{ color: results.cs ? "var(--accent)" : "var(--orange-2)" }}>{results.cs ? "✓" : "✗"}</span> Контрольная сумма:&nbsp;
                    <span style={{ color: FIELD_COLOR.cs, fontWeight: 600 }}>{pkt.bytes[12].toString(16).toUpperCase().padStart(2, "0")}</span>
                    {!results.cs && (
                      <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                        Подсказка: XOR всех 12 байт = {pkt.bytes[12].toString(16).toUpperCase().padStart(2, "0")}
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => { setSubmitted(false); setForm({ sat_id: "", temp: "", volt: "", cs: "" }); }}
                  style={{ ...S.btnSec, marginTop: 14 }}>Попробовать снова</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* ════════════════════ CUSTOM TAB ════════════════════ */}
      {tab === "custom" && (
        <>
          {/* HEX input */}
          <div style={S.card}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
              Введите HEX-пакет
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 8 }}>
                Байты разделяются пробелами или без — например: <code style={{ color: "var(--accent-2)" }}>AA 55 01 91 09 48 65 00 BD 09 A6 0E C4</code>
              </div>
              <textarea
                value={customHex}
                onChange={e => { setCustomHex(e.target.value); setCustomResult(null); setCustomError(""); }}
                placeholder="AA 55 01 ..."
                rows={3}
                style={{
                  ...S.input, fontFamily: "'Space Mono', 'Courier New', monospace",
                  fontSize: 13, resize: "vertical", lineHeight: 1.6,
                }}
              />
              {customError && (
                <div style={{ marginTop: 8, fontSize: 12, color: "#da4927" }}>{customError}</div>
              )}
            </div>
          </div>

          {/* Format builder */}
          <div style={S.card}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Формат пакета</span>
              <button onClick={addField} style={{ ...S.btnAdd, width: "auto", padding: "4px 12px", fontSize: 12, lineHeight: 1.4 }}>
                + Добавить поле
              </button>
            </div>
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {customFields.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
                  Нет полей — нажмите «+ Добавить поле»
                </div>
              )}
              {customFields.map((f, idx) => {
                const color = FIELD_PALETTE[idx % FIELD_PALETTE.length];
                return (
                  <div key={f.id} style={{
                    display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap",
                    padding: "10px 12px", borderRadius: 8,
                    background: `${color}0d`, border: `1px solid ${color}33`,
                  }}>
                    <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)", minWidth: 26, textAlign: "right" }}>
                      {idx + 1}.
                    </span>
                    <input
                      type="text"
                      value={f.name}
                      onChange={e => updateField(f.id, "name", e.target.value)}
                      placeholder="имя поля"
                      style={{ ...S.input, width: 130, fontSize: 12, color }}
                    />
                    <select
                      value={f.type}
                      onChange={e => updateField(f.id, "type", e.target.value)}
                      style={{ ...S.select, fontSize: 12, minWidth: 200 }}
                    >
                      {FIELD_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                    </select>
                    <select
                      value={f.endian}
                      onChange={e => updateField(f.id, "endian", e.target.value)}
                      style={{ ...S.select, fontSize: 12, minWidth: 120 }}
                    >
                      {ENDIAN_OPTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                    </select>
                    <button onClick={() => removeField(f.id)} style={S.btnDanger} title="Удалить поле">−</button>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "0 16px 16px", display: "flex", gap: 10, alignItems: "center" }}>
              <button onClick={runDecode} style={{ ...S.btnPrim, padding: "9px 22px" }}>
                ⚡ Декодировать
              </button>
              <button onClick={() => { setCustomFields(DEFAULT_CUSTOM_FIELDS); setNextId(DEFAULT_CUSTOM_FIELDS.length + 1); setCustomResult(null); setCustomError(""); }}
                style={S.btnSec}>
                Сброс формата
              </button>
            </div>
          </div>

          {/* Result */}
          {customResult && (
            <div style={S.card}>
              <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>Результат декодирования</span>
                <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                  {customResult.totalBytes} байт в пакете · использовано {customResult.usedBytes} байт
                </span>
                {customResult.usedBytes > customResult.totalBytes && (
                  <span style={{ fontSize: 12, color: "#da4927" }}>⚠ Формат шире пакета</span>
                )}
                {customResult.usedBytes < customResult.totalBytes && (
                  <span style={{ fontSize: 12, color: "#cbb98c" }}>ℹ {customResult.totalBytes - customResult.usedBytes} байт не описаны форматом</span>
                )}
              </div>

              {/* Hex dump with field coloring */}
              <div style={{ padding: "14px 18px", background: "#0d0a18", borderBottom: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, letterSpacing: "0.5px" }}>HEX DUMP</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {customResult.rawBytes.map((b, i) => {
                    const fieldIdx = customResult.parsed.findIndex(f => i >= f.offset && i < f.offset + f.bytes);
                    const color = fieldIdx >= 0 ? FIELD_PALETTE[fieldIdx % FIELD_PALETTE.length] : "#666";
                    const fieldName = fieldIdx >= 0 ? customResult.parsed[fieldIdx].name : "?";
                    return (
                      <span key={i} title={`[${i}] ${fieldName}`} style={{
                        fontFamily: "monospace", fontSize: 13, fontWeight: 600,
                        padding: "2px 6px", borderRadius: 5,
                        background: `${color}1a`, color,
                        border: `1px solid ${color}44`,
                      }}>
                        {b.toString(16).toUpperCase().padStart(2, "0")}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Fields table */}
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "var(--surface-2)" }}>
                      {["#", "Поле", "Тип", "Порядок", "Смещение", "Байты (hex)", "Значение"].map(h => (
                        <th key={h} style={S.th}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {customResult.parsed.map((f, idx) => {
                      const color = FIELD_PALETTE[idx % FIELD_PALETTE.length];
                      return (
                        <tr key={f.id} style={{ background: idx % 2 ? "transparent" : `${color}08` }}>
                          <td style={{ ...S.td, color: "var(--text-muted)" }}>{idx + 1}</td>
                          <td style={{ ...S.td, color, fontWeight: 700 }}>{f.name}</td>
                          <td style={{ ...S.td, fontFamily: "monospace", color: "var(--text-muted)" }}>{f.type}</td>
                          <td style={{ ...S.td, fontFamily: "monospace", color: "var(--text-muted)" }}>{f.endian}</td>
                          <td style={{ ...S.td, fontFamily: "monospace" }}>{f.offset}–{f.offset + f.bytes - 1}</td>
                          <td style={{ ...S.td, fontFamily: "monospace", color: f.outOfRange ? "#da4927" : "var(--text-muted)", fontSize: 11 }}>
                            {f.rawBytes ? f.rawBytes.join(" ") : "—"}
                          </td>
                          <td style={{ ...S.td, fontFamily: "monospace", fontWeight: 600, color: f.outOfRange ? "#da4927" : color }}>
                            {f.value}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* ════════════════════ AIS TAB ════════════════════ */}
      {tab === "ais" && <AisDecodeSubTab />}
    </div>
  );
}

// ─── AIS mini-guide (на русском, прямо на странице) ───────────────────────────
//
// По требованию пользователя: убираем ссылку «↗ Документация AIS / ITU-R M.1371»
// и пишем понятную мини-документацию на русском прямо на странице активности.
function AisMiniGuide() {
  const sectionStyle = {
    ...S.card,
    padding: "16px 20px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  };
  const h3 = {
    margin: 0,
    fontSize: 13,
    fontWeight: 700,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: "var(--orange)",
  };
  const p = { margin: 0, fontSize: 13, lineHeight: 1.65, color: "var(--text-dim)" };
  const codeBox = {
    marginTop: 4,
    padding: "10px 12px",
    background: "#130e22",
    borderRadius: 6,
    fontSize: 12,
    color: "var(--accent-2)",
    overflow: "auto",
    border: "1px solid var(--border)",
  };

  const fields = [
    ["MMSI", "9 цифр — уникальный идентификатор судна (страна + борт)."],
    ["Тип сообщения (msg_type)", "1/2/3 — позиционные репорты класса A; 4 — базовая станция; 5 — статичная информация; 18/19 — позиция класса B; 24 — статика класса B."],
    ["Координаты (lat / lon)", "Широта и долгота в градусах. Передаются в 1/10000 минуты дуги — после декодирования сразу получаем привычные градусы (с дробной частью)."],
    ["Скорость (SOG)", "Speed Over Ground — скорость относительно земли, в узлах (knots)."],
    ["Курс (COG)", "Course Over Ground — направление движения относительно севера, 0–360°."],
    ["Курсовой угол (heading)", "В какую сторону «смотрит» нос корабля. 511 — значение «не указано»."],
    ["Статус навигации (status)", "0 — в движении на двигателе, 1 — на якоре, 5 — пришвартован, 7 — рыбалка, 8 — под парусом и т.д."],
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={sectionStyle}>
        <h3 style={h3}>Что такое AIS</h3>
        <p style={p}>
          <b style={{ color: "var(--text)" }}>AIS (Automatic Identification System)</b> — морская система автоматической идентификации.
          Каждое крупное судно с интервалом 2–10 секунд передаёт по радио (УКВ 161,975 / 162,025 МГц)
          короткие пакеты со своим MMSI, координатами, скоростью и курсом. Сигнал принимают
          соседние корабли, береговые станции, а также спутники низкой орбиты —
          именно эти данные мы и декодируем здесь.
        </p>
      </div>

      <div style={sectionStyle}>
        <h3 style={h3}>Формат NMEA-AIVDM (что в файле)</h3>
        <p style={p}>
          AIS-приёмник (RTL-SDR, dAISy, спутниковый трактом) сохраняет пакеты
          в текстовом формате NMEA — одна строка = один пакет. Строка начинается
          с <code>!AIVDM</code> (или <code>!AIVDO</code> для своих передач):
        </p>
        <pre style={codeBox}>
{`!AIVDM,1,1,,A,13lq2>002f0V3scdr8ATr40p8L07,0*6A
  ↑     ↑ ↑ ↑ ↑ ↑                            ↑
  тег   │ │ │ │ полезные данные (6-битный    контрольная
        │ │ │ │ ASCII, payload AIS-пакета)    сумма XOR
        │ │ │ канал A или B (161.975/162.025)
        │ │ номер фрагмента (всё в одном пакете)
        │ всего фрагментов
        количество fragment-ов в сообщении`}
        </pre>
        <p style={p}>
          Длинные сообщения (типы 5, 24) бывают разбиты на 2 фрагмента — тогда
          сначала идёт строка с <code>2,1,…</code>, потом <code>2,2,…</code>.
          Наш декодер сам склеивает их по идентификатору последовательности.
        </p>
      </div>

      <div style={sectionStyle}>
        <h3 style={h3}>Какие поля мы извлекаем</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-dim)", fontSize: 13, lineHeight: 1.75 }}>
          {fields.map(([name, desc]) => (
            <li key={name} style={{ marginBottom: 6 }}>
              <b style={{ color: "var(--accent-2)" }}>{name}</b> — {desc}
            </li>
          ))}
        </ul>
      </div>

      <div style={sectionStyle}>
        <h3 style={h3}>Как пользоваться</h3>
        <ol style={{ margin: 0, paddingLeft: 18, color: "var(--text-dim)", fontSize: 13, lineHeight: 1.75 }}>
          <li>Получите файл AIS — это может быть лог с RTL-AIS, дамп с dAISy USB, выгрузка с MarineTraffic или сырая запись со спутникового приёмника.</li>
          <li>Убедитесь, что в каждой строке есть <code>!AIVDM,…,0*xx</code>. Файлы <code>.log</code>, <code>.txt</code>, <code>.aivdm</code> подходят без переделок.</li>
          <li>Нажмите «↑ Загрузить AIS-файл». Сервер обработает его библиотекой <code>pyais</code> и вернёт таблицу с распакованными полями.</li>
          <li>Корабли с валидными координатами автоматически отрисовываются на карте — кликните по точке для деталей.</li>
          <li>Сравните MMSI с реальными данными MarineTraffic (поиск по номеру), чтобы убедиться, что декодер не врёт.</li>
        </ol>
      </div>

      <div style={sectionStyle}>
        <h3 style={h3}>Подсказки и подводные камни</h3>
        <ul style={{ margin: 0, paddingLeft: 18, color: "var(--text-dim)", fontSize: 13, lineHeight: 1.75 }}>
          <li>В AIS координаты иногда «прячут» как 91°/181° — это означает «координата не валидна», не путайте с реальной позицией.</li>
          <li>Heading=511 означает «не указано» — в норме отображаем «—», а не 511.</li>
          <li>Скорость в узлах. Чтобы перевести в км/ч, умножьте на 1,852.</li>
          <li>Если файл «битый» — счётчик ошибок справа от количества покажет, сколько пакетов сервер не смог распарсить.</li>
          <li>Один и тот же корабль будет повторяться много раз: AIS даёт позицию каждые 2–10 секунд, по этим точкам строится трек.</li>
        </ul>
      </div>
    </div>
  );
}

// ─── Activity 3: AIS decoding ──────────────────────────────────────────────────
function AisDecodeActivity() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      const r = await decodeAisFile(file);
      setResult(r);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.card, padding: 18 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-dim)", marginBottom: 14 }}>
          Загрузите файл <code>.txt</code> с сообщениями NMEA-AIVDM (по строке на пакет).
          Каждая строка должна выглядеть так:
          <pre style={{ marginTop: 8, padding: 10, background: "#130e22", borderRadius: 6, fontSize: 12, color: "var(--accent-2)", overflow: "auto" }}>
{`!AIVDM,1,1,,A,13lq2>002f0V3scdr8ATr40p8L07,0*6A
!AIVDM,1,1,,B,15?dU2h0j710dfifFDumRTHr0<0=,0*33`}
          </pre>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ ...S.btnPrim, cursor: "pointer", display: "inline-block" }}>
            {busy ? "Декодирую…" : "↑ Загрузить AIS-файл"}
            <input type="file" accept=".txt,.aivdm,.log" style={{ display: "none" }} onChange={handle} disabled={busy} />
          </label>
        </div>
        {error && <div style={{ marginTop: 10, color: "var(--orange-2)", fontSize: 13 }}>Ошибка: {error}</div>}
      </div>

      <AisMiniGuide />

      {result && (
        <div style={{ ...S.card, padding: 0 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>Файл: {result.filename}</span>
            <span style={{ color: "var(--accent-2)", fontFamily: "'Space Mono', monospace" }}>
              ✓ {result.count} · ✗ {result.errors}
            </span>
          </div>
          <div style={{ maxHeight: 460, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)" }}>
                <tr>
                  {["MMSI", "msg", "lat", "lon", "speed", "course", "heading", "status"].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.decoded.map((p, i) => (
                  <tr key={i} style={{ background: i % 2 ? "transparent" : "rgba(114,71,150,0.06)" }}>
                    <td style={{ ...S.td, color: "var(--orange)", fontWeight: 600 }}>{p.mmsi}</td>
                    <td style={S.td}>{p.msg_type}</td>
                    <td style={S.td}>{typeof p.lat === "number" ? p.lat.toFixed(4) : "—"}</td>
                    <td style={S.td}>{typeof p.lon === "number" ? p.lon.toFixed(4) : "—"}</td>
                    <td style={S.td}>{p.speed ?? "—"}</td>
                    <td style={S.td}>{p.course ?? "—"}</td>
                    <td style={S.td}>{p.heading ?? "—"}</td>
                    <td style={{ ...S.td, color: "var(--text-muted)" }}>{String(p.status ?? "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Bit-level decoder ─────────────────────────────────────────────────────────
const BIT_ORDERS = [
  { key: "MSB", label: "MSB (big-endian бит)" },
  { key: "LSB", label: "LSB (little-endian бит)" },
];

const BIT_PALETTE = [
  "#f3cb68","#9460b8","#f39768","#da4927","#6cc77b","#cbb98c",
  "#56965b","#8878a4","#b05c24","#5b8ab0","#c2b5d4","#7ac8b0",
];

const DEFAULT_BIT_FIELDS = [
  { id: 1, name: "sync",    bit_offset: 0,  bit_length: 16, signed: false, scale: "1",    bit_order: "MSB" },
  { id: 2, name: "sat_id",  bit_offset: 16, bit_length: 8,  signed: false, scale: "1",    bit_order: "MSB" },
  { id: 3, name: "pkt_type",bit_offset: 24, bit_length: 8,  signed: false, scale: "1",    bit_order: "MSB" },
  { id: 4, name: "temp",    bit_offset: 80, bit_length: 16, signed: true,  scale: "0.01", bit_order: "MSB" },
  { id: 5, name: "volt",    bit_offset: 96, bit_length: 16, signed: false, scale: "0.001",bit_order: "MSB" },
];

function NumStepper({ value, onChange, min = 0, max = 65535, label }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
      {label && <span style={{ fontSize: 10, color: "var(--text-muted)", marginRight: 2 }}>{label}</span>}
      <button
        onClick={() => onChange(Math.max(min, value - 1))}
        style={{ ...S.btnDanger, width: 20, height: 20, fontSize: 13, lineHeight: "18px", flexShrink: 0 }}
      >−</button>
      <input
        type="number"
        value={value}
        min={min} max={max}
        onChange={e => {
          const v = parseInt(e.target.value, 10);
          if (!isNaN(v)) onChange(Math.min(max, Math.max(min, v)));
        }}
        style={{
          ...S.input, width: 58, textAlign: "center", padding: "4px 4px",
          fontSize: 12, fontFamily: "'Space Mono', monospace",
        }}
      />
      <button
        onClick={() => onChange(Math.min(max, value + 1))}
        style={{ ...S.btnAdd, width: 20, height: 20, fontSize: 15, lineHeight: "18px", flexShrink: 0 }}
      >+</button>
    </div>
  );
}

function BitDecoderTab() {
  const [fields, setFields]         = useState(DEFAULT_BIT_FIELDS);
  const [nextId, setNextId]         = useState(DEFAULT_BIT_FIELDS.length + 1);
  const [packetLen, setPacketLen]   = useState(13);
  const [result, setResult]         = useState(null);
  const [busy, setBusy]             = useState(false);
  const [error, setError]           = useState("");
  const [configError, setConfigError] = useState("");

  const addField = () => {
    const last = fields[fields.length - 1];
    const nextOffset = last ? last.bit_offset + last.bit_length : 0;
    setFields(prev => [...prev, {
      id: nextId, name: `field_${nextId}`,
      bit_offset: nextOffset, bit_length: 8,
      signed: false, scale: "1", bit_order: "MSB",
    }]);
    setNextId(n => n + 1);
    setResult(null);
  };

  const removeField = (id) => { setFields(prev => prev.filter(f => f.id !== id)); setResult(null); };

  const updateField = (id, key, val) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: val } : f));
    setResult(null);
  };

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (fields.length === 0) { setConfigError("Добавьте хотя бы одно поле"); return; }
    setBusy(true); setError(""); setConfigError(""); setResult(null);
    try {
      const config = {
        packet_len: packetLen,
        fields: fields.map(f => ({
          name:       f.name || "?",
          bit_offset: f.bit_offset,
          bit_length: f.bit_length,
          signed:     f.signed,
          scale:      parseFloat(f.scale) || 1,
          bit_order:  f.bit_order,
        })),
      };
      const r = await decodeBinaryFile(file, config);
      setResult(r);
      if (r.config_errors?.length) setConfigError(r.config_errors.join(" · "));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  // Визуализация битовой карты одного пакета (первого)
  const firstPkt = result?.packets?.[0];
  const totalBits = packetLen * 8;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

      {/* ── Описание ── */}
      <div style={{ ...S.card, padding: 16 }}>
        <div style={{ fontSize: 13, lineHeight: 1.65, color: "var(--text-dim)" }}>
          <strong style={{ color: "var(--orange)" }}>Бит-декодер.</strong>{" "}
          Загрузите любой бинарный файл и опишите его структуру на уровне битов:
          задайте смещение и длину каждого поля в битах, знаковость, масштаб и порядок битов.
          Сервер разобьёт файл на пакеты и вернёт декодированные значения.
        </div>
      </div>

      {/* ── Настройки пакета ── */}
      <div style={{ ...S.card, padding: "14px 18px" }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.6 }}>
          Размер пакета
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <NumStepper
            value={packetLen}
            onChange={v => { setPacketLen(v); setResult(null); }}
            min={1} max={65535}
            label="байт/пакет"
          />
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
            0 = весь файл как один пакет
          </span>
          <button
            onClick={() => setPacketLen(0)}
            style={{ ...S.btnSec, padding: "4px 10px", fontSize: 11 }}
          >
            Весь файл
          </button>
        </div>
      </div>

      {/* ── Конструктор полей ── */}
      <div style={S.card}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
            Поля пакета{" "}
            <span style={{ color: "var(--text-muted)", fontWeight: 400, fontSize: 11 }}>
              (смещение и длина — в битах)
            </span>
          </span>
          <button onClick={addField} style={{ ...S.btnAdd, width: "auto", padding: "4px 12px", fontSize: 12, lineHeight: 1.4 }}>
            + Добавить поле
          </button>
        </div>

        {/* Заголовок колонок */}
        {fields.length > 0 && (
          <div style={{
            display: "grid",
            gridTemplateColumns: "24px 1fr 120px 120px 80px 80px 160px 24px",
            gap: 6, padding: "8px 16px 4px",
            fontSize: 10, color: "var(--text-muted)", fontWeight: 600,
            textTransform: "uppercase", letterSpacing: 0.6,
          }}>
            <div>#</div>
            <div>Название</div>
            <div>Бит-смещение</div>
            <div>Кол-во бит</div>
            <div>Знак</div>
            <div>Масштаб</div>
            <div>Порядок бит</div>
            <div></div>
          </div>
        )}

        <div style={{ padding: "6px 16px 14px", display: "flex", flexDirection: "column", gap: 6 }}>
          {fields.length === 0 && (
            <div style={{ fontSize: 12, color: "var(--text-muted)", textAlign: "center", padding: "20px 0" }}>
              Нет полей — нажмите «+ Добавить поле»
            </div>
          )}
          {fields.map((f, idx) => {
            const color = BIT_PALETTE[idx % BIT_PALETTE.length];
            return (
              <div key={f.id} style={{
                display: "grid",
                gridTemplateColumns: "24px 1fr 120px 120px 80px 80px 160px 24px",
                gap: 6, alignItems: "center",
                padding: "8px 10px", borderRadius: 8,
                background: `${color}0d`, border: `1px solid ${color}33`,
              }}>
                {/* # */}
                <span style={{ fontFamily: "monospace", fontSize: 11, color: "var(--text-muted)", textAlign: "right" }}>
                  {idx + 1}
                </span>
                {/* Название */}
                <input
                  type="text" value={f.name}
                  onChange={e => updateField(f.id, "name", e.target.value)}
                  placeholder="имя поля"
                  style={{ ...S.input, fontSize: 12, color, padding: "5px 8px" }}
                />
                {/* Бит-смещение */}
                <NumStepper
                  value={f.bit_offset}
                  onChange={v => updateField(f.id, "bit_offset", v)}
                  min={0} max={65535}
                />
                {/* Кол-во бит */}
                <NumStepper
                  value={f.bit_length}
                  onChange={v => updateField(f.id, "bit_length", Math.max(1, v))}
                  min={1} max={64}
                />
                {/* Знак */}
                <label style={{ display: "flex", alignItems: "center", gap: 5, cursor: "pointer", fontSize: 12, color: "var(--text-muted)" }}>
                  <input
                    type="checkbox" checked={f.signed}
                    onChange={e => updateField(f.id, "signed", e.target.checked)}
                    style={{ accentColor: color, width: 14, height: 14, cursor: "pointer" }}
                  />
                  знак.
                </label>
                {/* Масштаб */}
                <input
                  type="text" value={f.scale}
                  onChange={e => updateField(f.id, "scale", e.target.value)}
                  placeholder="1"
                  title="Множитель (raw × scale = value). Напр.: 0.01 чтобы получить °C из значения × 100"
                  style={{ ...S.input, fontSize: 12, padding: "5px 6px", fontFamily: "'Space Mono', monospace" }}
                />
                {/* Порядок бит */}
                <select
                  value={f.bit_order}
                  onChange={e => updateField(f.id, "bit_order", e.target.value)}
                  style={{ ...S.select, fontSize: 11 }}
                >
                  {BIT_ORDERS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                </select>
                {/* Удалить */}
                <button onClick={() => removeField(f.id)} style={S.btnDanger} title="Удалить поле">−</button>
              </div>
            );
          })}
        </div>

        {configError && (
          <div style={{ padding: "0 16px 12px", fontSize: 12, color: "#da4927" }}>
            ⚠ {configError}
          </div>
        )}

        <div style={{ padding: "0 16px 16px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <label style={{ ...S.btnPrim, cursor: "pointer", display: "inline-block" }}>
            {busy ? "Декодирую…" : "↑ Загрузить бинарный файл"}
            <input type="file" accept=".bin,.dat,.tlm,.iq,.cf32" style={{ display: "none" }} onChange={handle} disabled={busy} />
          </label>
          <button
            onClick={() => { setFields(DEFAULT_BIT_FIELDS); setNextId(DEFAULT_BIT_FIELDS.length + 1); setResult(null); setError(""); setConfigError(""); }}
            style={S.btnSec}
          >
            Сброс полей
          </button>
          {error && <span style={{ fontSize: 12, color: "#da4927", flex: "1 0 100%" }}>Ошибка: {error}</span>}
        </div>
      </div>

      {/* ── Результат ── */}
      {result && (
        <>
          {/* Сводка */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {[
              ["Файл", result.filename],
              ["Размер", `${result.size_bytes} B`],
              ["Пакетов", result.count],
              ["Байт/пакет", result.packet_len],
            ].map(([label, val]) => (
              <div key={label} style={{
                background: "var(--surface-1)", border: "1px solid var(--border)",
                borderRadius: 10, padding: "8px 14px", minWidth: 100,
              }}>
                <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "var(--accent)", fontFamily: "'Space Mono', monospace" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Битовая карта первого пакета */}
          {firstPkt && packetLen > 0 && packetLen <= 128 && (
            <div style={{ ...S.card, padding: "14px 18px" }}>
              <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
                Битовая карта пакета #0 ({packetLen} байт = {totalBits} бит)
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 2 }}>
                {Array.from({ length: totalBits }, (_, bitIdx) => {
                  const fi = fields.findIndex(f =>
                    bitIdx >= f.bit_offset && bitIdx < f.bit_offset + f.bit_length
                  );
                  const color = fi >= 0 ? BIT_PALETTE[fi % BIT_PALETTE.length] : "#333";
                  const fieldName = fi >= 0 ? fields[fi].name : null;
                  // Get the actual bit value from the hex dump
                  const byteIdx = Math.floor(bitIdx / 8);
                  const bitInByte = 7 - (bitIdx % 8);
                  const hexBytes = firstPkt.hex?.split(" ") || [];
                  const byteVal = hexBytes[byteIdx] ? parseInt(hexBytes[byteIdx], 16) : 0;
                  const bitVal = (byteVal >> bitInByte) & 1;
                  return (
                    <span
                      key={bitIdx}
                      title={fieldName ? `бит ${bitIdx} · ${fieldName}` : `бит ${bitIdx}`}
                      style={{
                        display: "inline-block", width: 12, height: 20,
                        lineHeight: "20px", textAlign: "center",
                        fontSize: 9, fontFamily: "monospace", fontWeight: 700,
                        borderRadius: 2,
                        background: fi >= 0 ? `${color}25` : "#1a1520",
                        color: fi >= 0 ? color : "#444",
                        border: `1px solid ${fi >= 0 ? color + "44" : "#2a2530"}`,
                        cursor: "default",
                      }}
                    >
                      {bitVal}
                    </span>
                  );
                })}
              </div>
              {/* Легенда */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {fields.map((f, idx) => (
                  <span key={f.id} style={{ fontSize: 10, color: BIT_PALETTE[idx % BIT_PALETTE.length], display: "flex", alignItems: "center", gap: 3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: BIT_PALETTE[idx % BIT_PALETTE.length], display: "inline-block" }}/>
                    {f.name} [{f.bit_offset}:{f.bit_offset + f.bit_length - 1}]
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Таблица пакетов */}
          <div style={{ ...S.card, padding: 0 }}>
            <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text)" }}>
                Декодированные пакеты
              </span>
              <span style={{ fontFamily: "monospace", fontSize: 12, color: "var(--text-muted)" }}>
                {result.count} пакетов
              </span>
            </div>
            <div style={{ overflowX: "auto", maxHeight: 460 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
                <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)" }}>
                  <tr>
                    <th style={S.th}>#</th>
                    <th style={S.th}>offset</th>
                    {fields.map((f, idx) => (
                      <th key={f.id} style={{ ...S.th, color: BIT_PALETTE[idx % BIT_PALETTE.length] }}>
                        {f.name}
                        <div style={{ fontSize: 9, fontWeight: 400, color: "var(--text-muted)" }}>
                          [{f.bit_offset}:{f.bit_offset + f.bit_length - 1}]
                        </div>
                      </th>
                    ))}
                    <th style={S.th}>hex</th>
                  </tr>
                </thead>
                <tbody>
                  {result.packets.map((pkt, i) => (
                    <tr key={i} style={{ background: i % 2 ? "transparent" : "rgba(114,71,150,0.06)" }}>
                      <td style={{ ...S.td, color: "var(--text-muted)" }}>{pkt.index}</td>
                      <td style={{ ...S.td, color: "var(--text-muted)" }}>{pkt.offset}</td>
                      {fields.map((f, idx) => {
                        const v = pkt.fields?.[f.name];
                        return (
                          <td key={f.id} style={{ ...S.td, color: v == null ? "#da4927" : BIT_PALETTE[idx % BIT_PALETTE.length], fontWeight: 600 }}>
                            {v == null ? "—" : typeof v === "number" ? (Number.isInteger(v) ? v : v.toFixed(4)) : String(v)}
                          </td>
                        );
                      })}
                      <td style={{ ...S.td, color: "var(--text-muted)", fontSize: 10, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {pkt.hex}
                      </td>
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

// ─── Activity 4: Telemetry decoding ────────────────────────────────────────────
function TelemetryStandardTab() {
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      const r = await decodeTelemetryFile(file);
      setResult(r);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.card, padding: 18 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-dim)", marginBottom: 12 }}>
          Загрузите бинарный файл с пакетами телеметрии Polytech Universe.
          Формат пакета (32 байта):
        </div>
        <pre style={{ padding: 12, background: "#130e22", borderRadius: 6, fontSize: 11, color: "var(--accent-2)", overflow: "auto", marginBottom: 14 }}>
{`bytes 0..1   sync     0xAA 0x55
bytes 2..3   sat_id   uint16 LE
bytes 4..7   ts       uint32 LE (UNIX seconds)
bytes 8..11  temp     int32  LE (×100, °C)
bytes 12..15 vbus_mv  uint32 LE
bytes 16..19 ibus_ma  int32  LE
bytes 20..21 batt%    uint16 LE (×10)
bytes 22..23 rssi     int16  LE
bytes 24..25 snr      int16  LE
bytes 26..29 uptime   uint32 LE (sec)
bytes 30..31 CRC-16   CCITT-FALSE, big-endian`}
        </pre>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ ...S.btnPrim, cursor: "pointer", display: "inline-block" }}>
            {busy ? "Декодирую…" : "↑ Загрузить .bin/.dat"}
            <input type="file" accept=".bin,.dat,.tlm" style={{ display: "none" }} onChange={handle} disabled={busy} />
          </label>
          <a
            href="https://spacepi.space/satellites/politeh-yunivers-3/"
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 12, color: "var(--orange)", textDecoration: "none", padding: "8px 14px", border: "1px solid var(--orange)", borderRadius: 8 }}
          >
            ↗ Документация по полям телеметрии
          </a>
        </div>
        {error && <div style={{ marginTop: 10, color: "var(--orange-2)", fontSize: 13 }}>Ошибка: {error}</div>}
        <div style={{ marginTop: 8, fontSize: 11, color: "var(--text-muted)" }}>
          Демо-файл доступен в разделе «Хранилище» → Телеметрия.
        </div>
      </div>

      {result && (
        <div style={{ ...S.card, padding: 0 }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", display: "flex", gap: 16, flexWrap: "wrap" }}>
            <span style={{ color: "var(--text)", fontWeight: 600 }}>{result.filename}</span>
            <span style={{ color: "var(--text-muted)", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{result.size_bytes} B</span>
            <span style={{ color: "var(--accent-2)", fontFamily: "'Space Mono', monospace", fontSize: 12 }}>{result.count} пакетов</span>
          </div>
          <div style={{ maxHeight: 460, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'Space Mono', monospace" }}>
              <thead style={{ position: "sticky", top: 0, background: "var(--surface-2)" }}>
                <tr>
                  {["#", "sync", "sat", "ts", "T °C", "Vbus", "Ibus", "bat%", "RSSI", "SNR", "uptime", "CRC"].map(h => (
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.packets.map((p, i) => (
                  <tr key={i} style={{ background: i % 2 ? "transparent" : "rgba(114,71,150,0.06)" }}>
                    <td style={{ ...S.td, color: "var(--text-muted)" }}>{i}</td>
                    <td style={{ ...S.td, color: p.sync_ok ? "var(--accent)" : "var(--orange-2)" }}>{p.sync_ok ? "✓" : "✗"}</td>
                    <td style={{ ...S.td, color: "var(--orange)", fontWeight: 600 }}>{p.sat_id}</td>
                    <td style={S.td}>{p.ts_iso?.slice(11, 19) || p.ts_unix}</td>
                    <td style={{ ...S.td, color: p.temp_c < 0 ? "#9460b8" : p.temp_c > 40 ? "#da4927" : "var(--text)" }}>{p.temp_c}</td>
                    <td style={S.td}>{p.vbus_mv}</td>
                    <td style={S.td}>{p.ibus_ma}</td>
                    <td style={S.td}>{p.battery_pct}</td>
                    <td style={S.td}>{p.rssi_dbm}</td>
                    <td style={S.td}>{p.snr_db}</td>
                    <td style={S.td}>{p.uptime_sec}</td>
                    <td style={{ ...S.td, color: p.crc_ok ? "var(--accent)" : "var(--orange-2)" }}>{p.crc_ok ? "OK" : "FAIL"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TelemetryDecodeActivity() {
  // По запросу пользователя кастомный бит-декодер «вынесен на уровень
  // выше» в виде отдельной верхнеуровневой активности. Эта вкладка
  // теперь оставлена только под стандартный формат PU — без табов.
  return <TelemetryStandardTab />;
}

// ─── Activity 5: IQ demodulation (gm.py) ───────────────────────────────────────
function IqDemodActivity() {
  const [params, setParams] = useState({
    sample_rate: 250000, center_freq: 437845000, bandwidth: 62500,
    spreading_factor: 8, decimation: 40, interpolation: 1,
    cutoff_freq: 35000, transition_width: 10000, freq_shift: 60000,
    sync_word: 18, preamble_len: 8,
  });
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const set = (k) => (e) => setParams(p => ({ ...p, [k]: Number(e.target.value) }));

  const handle = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true); setError("");
    try {
      const r = await demodulateIqFile(file, params);
      setResult(r);
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ ...S.card, padding: 18 }}>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--text-dim)", marginBottom: 14 }}>
          Демодулятор сырой IQ-записи (LoRa).
          Загрузите файл <code>raw.iq</code> (complex float32, с флешки SDR)
          и задайте параметры приёма:
        </div>

        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 10, marginBottom: 14,
        }}>
          {[
            ["sample_rate",      "Sample rate (Гц)"],
            ["center_freq",      "Center freq (Гц)"],
            ["bandwidth",        "Bandwidth (Гц)"],
            ["spreading_factor", "Spreading factor"],
            ["decimation",       "Decimation"],
            ["interpolation",    "Interpolation"],
            ["cutoff_freq",      "Cutoff freq (Гц)"],
            ["transition_width", "Transition (Гц)"],
            ["freq_shift",       "Freq shift (Гц)"],
            ["sync_word",        "Sync word"],
            ["preamble_len",     "Preamble len"],
          ].map(([k, lbl]) => (
            <label key={k} className="form-label">
              <span style={{ color: "var(--text-muted)", fontSize: 11 }}>{lbl}</span>
              <input
                type="number" className="form-input"
                value={params[k]} onChange={set(k)}
                style={{ fontFamily: "'Space Mono', monospace" }}
              />
            </label>
          ))}
        </div>

        <label style={{ ...S.btnPrim, cursor: "pointer", display: "inline-block" }}>
          {busy ? "Демодулирую…" : "↑ Загрузить raw.iq"}
          <input type="file" accept=".iq,.cf32,.dat,.bin" style={{ display: "none" }} onChange={handle} disabled={busy} />
        </label>
        {error && <div style={{ marginTop: 10, color: "var(--orange-2)", fontSize: 13 }}>Ошибка: {error}</div>}
      </div>

      {result && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ ...S.card, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Параметры записи
            </div>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: 12, lineHeight: 1.7 }}>
              <div>Файл: <span style={{ color: "var(--orange)" }}>{result.filename}</span></div>
              <div>Размер: {result.size_bytes} B</div>
              <div>Сэмплов: {result.n_samples}</div>
              <div>Длительность: {result.duration_s} c</div>
              <div>Эффективная частота: {(result.effective_sample_rate / 1000).toFixed(2)} kS/s</div>
              <div style={{ marginTop: 10, color: result.crc_ok ? "var(--accent-2)" : "var(--orange-2)" }}>
                CRC: {result.crc_ok ? "✓ OK" : "✗ FAIL"}
              </div>
            </div>
          </div>

          <div style={{ ...S.card, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
              Пайплайн обработки
            </div>
            <ol style={{ paddingLeft: 18, fontSize: 12, color: "var(--text-dim)", lineHeight: 1.65 }}>
              {result.pipeline.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>

          <div style={{ ...S.card, padding: 16, gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.6 }}>
              data.bin (первые 64 байта)
            </div>
            <pre style={{ padding: 12, background: "#130e22", borderRadius: 6, fontSize: 11, color: "var(--accent-2)", overflow: "auto", margin: 0, fontFamily: "'Space Mono', monospace" }}>
              {result.payload_hex}
            </pre>
            {result.decoded_payload && (
              <div style={{ marginTop: 12, padding: 12, background: "rgba(114,71,150,0.10)", borderRadius: 6, border: "1px solid rgba(114,71,150,0.35)", fontSize: 13, color: "var(--text)" }}>
                <span style={{ color: "var(--orange)", fontWeight: 700, marginRight: 8 }}>Decoded:</span>
                {result.decoded_payload}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Challenge Page ────────────────────────────────────────────────────────
//
// `howto` — пошаговая инструкция, как пользоваться активностью. Выводится
// под кнопкой «Назад» в виде подсказки. По требованию пользователя.
const ACTIVITIES = [
  {
    key: "graph",
    icon: null,
    title: "Построение графиков",
    difficulty: "Легко",
    diffColor: "#724796",
    desc: "Выбери спутник, загрузи пакеты с телеметрией и построй график температуры. Можно подгружать свои файлы AIS / Telemetry с отображением на карте и диаграммах.",
    skills: ["Работа с данными", "Визуализация", "Загрузка файлов"],
    howto: [
      "Выберите спутник (PU-3, PU-4) и нажмите «Загрузить реальную телеметрию» — придут последние 50 пакетов через API.",
      "Можно также нажать «Сгенерировать демо», чтобы поиграть с синтетическим набором данных.",
      "Сверху выберите параметр (температура, заряд, RSSI, напряжение) — карта точек обновится автоматически.",
      "Нажмите «Построить график» — точки соберутся в кривую. Кнопка «Скачать PNG» сохраняет картинку.",
    ],
  },
  {
    key: "decode",
    icon: null,
    title: "Расшифровка пакетов",
    difficulty: "Средне",
    diffColor: "#f39768",
    desc: "Получи сырой двоичный пакет со спутника и декодируй его по протоколу: satellite ID, температуру, напряжение и контрольную сумму.",
    skills: ["Двоичный протокол", "Little-endian", "XOR контрольная сумма"],
    howto: [
      "Кликните «Сгенерировать пакет» — появится hex-строка из 14 байт со случайной телеметрией.",
      "Распакуйте поля по схеме сверху: 2 байта sat_id, температура, напряжение и т.д. — все в little-endian.",
      "Введите ваши значения в поля справа и нажмите «Проверить». Зелёные галочки — поле декодировано верно.",
      "В конце сверьте CRC: первые 13 байт XOR-ом должны давать последний байт.",
    ],
  },
  {
    key: "ais",
    icon: null,
    title: "Декодирование AIS",
    difficulty: "Средне",
    diffColor: "#f39768",
    desc: "Загрузи бинарный или текстовый файл с пакетами AIS (NMEA-AIVDM), декодируй MMSI, координаты, скорость и курс кораблей.",
    skills: ["NMEA-AIVDM", "AIS protocol", "pyais"],
    howto: [
      "Загрузите файл с NMEA-AIVDM строками или сырыми бинарными AIS-пакетами (например, из RTL-AIS).",
      "Сервер распарсит пакеты библиотекой pyais и вернёт таблицу: MMSI, тип, координаты, скорость, курс.",
      "Корабли с валидными координатами автоматически рисуются на карте — кликните по точке для деталей.",
      "Сравните дешифрованные значения с реальными данными MarineTraffic, чтобы убедиться, что декодер не врёт.",
    ],
  },
  {
    key: "telemetry",
    icon: null,
    title: "Декодирование телеметрии",
    difficulty: "Средне",
    diffColor: "#f39768",
    desc: "Загрузи бинарный поток телеметрии Polytech Universe и распарси температуру, напряжение, RSSI/SNR. Проверь CRC-16 каждого пакета.",
    skills: ["Бинарный парсинг", "struct LE/BE", "CRC-16 CCITT"],
    howto: [
      "Возьмите .bin со стандартным форматом Polytech Universe (32-байтные пакеты) — например, из раздела «Хранилище».",
      "Загрузите файл — сервер распакует поля (температуру, vbus, ibus, заряд батареи, RSSI/SNR) для каждого пакета.",
      "Колонка CRC покажет, целостен ли пакет (CRC-16/CCITT). Зелёное ✓ — всё ОК.",
      "Если ваш формат не стандартный — используйте активность «Свой пакет и формат» (на верхнем уровне).",
    ],
  },
  {
    key: "bits",
    icon: null,
    title: "Свой пакет и формат · бит-декодер",
    difficulty: "Продвинуто",
    diffColor: "#9460b8",
    badge: "Pro",
    badgeColor: "#9460b8",
    highlight: true,
    desc:
      "Универсальный конструктор: опишите свою структуру пакета по битам — имена полей, " +
      "смещения, длины, знак, масштаб, MSB/LSB-порядок — и загрузите любой бинарник. " +
      "Сервер разрежет файл на пакеты, распакует каждое поле и покажет битовую карту. " +
      "Под капотом — наш /api/decode/binary эндпоинт.",
    skills: [
      "Произвольный бит-формат", "Signed / unsigned", "Scale & offset",
      "MSB / LSB-порядок", "Большие пакеты (CCSDS, AX.25, USP)",
    ],
    howto: [
      "Укажите размер одного пакета в байтах (например, 32) — сервер аккуратно разрежет файл по этому размеру.",
      "Добавьте поля кнопкой «+ Поле»: имя, смещение в битах, длина в битах, signed/unsigned, scale и порядок битов (MSB/LSB).",
      "Загрузите бинарник — на экране появится «битовая карта» первого пакета (поля подсвечены) и таблица распакованных значений для всех пакетов.",
      "Сохраните конфиг как JSON: его можно использовать повторно или передать через POST /api/decode/binary.",
    ],
  },
  {
    key: "iq",
    icon: null,
    title: "Демодуляция сырой записи",
    difficulty: "Средне",
    diffColor: "#f39768",
    desc: "Загрузи raw.iq запись с SDR, задай параметры приёма (sample rate, freq shift, SF, bandwidth) и пропусти через демодулятор LoRa — до получения data.bin.",
    skills: ["LoRa SDR", "GNU Radio params", "FFT demod"],
    howto: [
      "Возьмите запись raw.iq (complex float32) с SDR-приёмника — например, RTL-SDR или HackRF.",
      "Задайте параметры приёма: sample rate, центральная частота, ширина полосы, spreading factor LoRa.",
      "Параметры decimation/interpolation, фильтра, сдвига и sync-word должны соответствовать вашему передатчику.",
      "Нажмите «↑ Загрузить raw.iq» — сервер прогонит запись через пайплайн и вернёт data.bin + hex первых байт.",
    ],
  },
];

export default function ChallengePage() {
  const [activity, setActivity] = useState(null);
  const act = ACTIVITIES.find(a => a.key === activity);

  if (!activity) {
    // Карточку с key === "bits" выводим первой и крупнее обычных —
    // это «фишковая» активность, её нужно подчеркнуть (запрос пользователя).
    const highlightedActivities = ACTIVITIES.filter((a) => a.highlight);
    const regularActivities = ACTIVITIES.filter((a) => !a.highlight);

    const renderCard = (a, opts = {}) => {
      const { big = false } = opts;
      return (
        <button
          key={a.key}
          onClick={() => setActivity(a.key)}
          style={{
            textAlign: "left",
            background: big
              ? `linear-gradient(135deg, ${a.diffColor}24 0%, var(--surface-1) 65%)`
              : "var(--surface-1)",
            border: `1px solid ${big ? a.diffColor : "var(--border)"}`,
            borderRadius: 16,
            padding: big ? 28 : 24,
            cursor: "pointer",
            transition: "border-color 0.2s, box-shadow 0.2s, transform 0.15s",
            color: "inherit",
            boxShadow: big ? `0 0 28px ${a.diffColor}33` : "none",
            position: "relative",
            overflow: "hidden",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = a.diffColor;
            e.currentTarget.style.boxShadow = `0 0 32px ${a.diffColor}44`;
            e.currentTarget.style.transform = "translateY(-2px)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = big ? a.diffColor : "var(--border)";
            e.currentTarget.style.boxShadow = big ? `0 0 28px ${a.diffColor}33` : "none";
            e.currentTarget.style.transform = "translateY(0)";
          }}
        >
          {a.badge && (
            <span
              style={{
                position: "absolute",
                top: 14,
                right: 14,
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: 1,
                padding: "3px 10px",
                borderRadius: 999,
                color: "#fff",
                background: a.badgeColor || a.diffColor,
                boxShadow: `0 0 14px ${(a.badgeColor || a.diffColor)}88`,
              }}
            >
              ★ {a.badge.toUpperCase()}
            </span>
          )}
          {a.icon && <div style={{ fontSize: 40, marginBottom: 14 }}>{a.icon}</div>}
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: big ? 22 : 18, color: big ? a.diffColor : "var(--text)" }}>
              {a.title}
            </span>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "2px 9px",
                borderRadius: 20,
                background: `${a.diffColor}18`,
                color: a.diffColor,
                border: `1px solid ${a.diffColor}44`,
              }}
            >
              {a.difficulty}
            </span>
          </div>
          <p
            style={{
              fontSize: big ? 14 : 13,
              color: big ? "var(--text-dim)" : "var(--text-muted)",
              lineHeight: 1.65,
              marginBottom: 16,
            }}
          >
            {a.desc}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {a.skills.map((s) => (
              <span
                key={s}
                style={{
                  fontSize: 11,
                  padding: "3px 9px",
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: 20,
                  color: "var(--text-muted)",
                }}
              >
                {s}
              </span>
            ))}
          </div>
        </button>
      );
    };

    return (
      <div className="page-wrap">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">Практические кейсы</h1>
            <p className="page-subtitle">
              Интерактивные задания по работе со спутниковыми данными
            </p>
          </div>
        </div>

        {highlightedActivities.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: 1.4,
                color: "var(--orange)",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              ★ Фишка платформы
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 18,
                maxWidth: 880,
              }}
            >
              {highlightedActivities.map((a) => renderCard(a, { big: true }))}
            </div>
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 20,
            maxWidth: 880,
          }}
        >
          {regularActivities.map((a) => renderCard(a))}
        </div>
      </div>
    );
  }

  return (
    <div className="page-wrap">
      <div className="page-header-row" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <button onClick={() => setActivity(null)} style={S.btnSec}>← Назад</button>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 className="page-title" style={{ fontSize: 20, margin: 0 }}>
                {act.icon} {act.title}
              </h1>
              <span style={{
                fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20,
                background: `${act.diffColor}18`, color: act.diffColor, border: `1px solid ${act.diffColor}44`,
              }}>
                {act.difficulty}
              </span>
            </div>
            <p className="page-subtitle" style={{ marginTop: 4 }}>{act.desc}</p>
          </div>
        </div>
      </div>

      {act?.howto?.length > 0 && (
        <details
          style={{
            ...S.card,
            padding: "14px 18px",
            marginBottom: 18,
            borderColor: act.diffColor + "55",
            background: `linear-gradient(135deg, ${act.diffColor}10 0%, var(--surface-1) 80%)`,
          }}
          open
        >
          <summary
            style={{
              cursor: "pointer",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              color: act.diffColor,
              userSelect: "none",
              outline: "none",
            }}
          >
            Как пользоваться этой активностью
          </summary>
          <ol
            style={{
              paddingLeft: 22,
              marginTop: 10,
              marginBottom: 0,
              fontSize: 13,
              color: "var(--text-dim)",
              lineHeight: 1.7,
            }}
          >
            {act.howto.map((step, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                {step}
              </li>
            ))}
          </ol>
        </details>
      )}

      {activity === "graph"     && <GraphActivity />}
      {activity === "decode"    && <PacketDecodeActivity />}
      {activity === "ais"       && <AisDecodeActivity />}
      {activity === "telemetry" && <TelemetryDecodeActivity />}
      {activity === "bits"      && <BitDecoderTab />}
      {activity === "iq"        && <IqDemodActivity />}
    </div>
  );
}
