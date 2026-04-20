import React, { useState, useRef, useCallback } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { fetchTelemetry, isoDaysAgo } from "../api";

// ─── Shared styles ─────────────────────────────────────────────────────────────
const S = {
  select: {
    background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 12px", color: "var(--text)", fontSize: 13, cursor: "pointer",
  },
  btnPrim: {
    background: "var(--accent)", border: "none", borderRadius: 8,
    padding: "8px 18px", color: "#000", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },
  btnSec: {
    background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8,
    padding: "7px 14px", color: "var(--text)", fontSize: 13, cursor: "pointer",
  },
  btnDanger: {
    background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.3)",
    borderRadius: 6, width: 24, height: 24, cursor: "pointer",
    color: "#f87171", fontWeight: 700, fontSize: 14, lineHeight: "22px", textAlign: "center",
  },
  btnAdd: {
    background: "rgba(0,212,255,0.12)", border: "1px solid rgba(0,212,255,0.3)",
    borderRadius: 6, width: 24, height: 24, cursor: "pointer",
    color: "#00d4ff", fontWeight: 700, fontSize: 16, lineHeight: "22px", textAlign: "center",
  },
  th: {
    padding: "8px 10px", fontSize: 10, color: "var(--text-muted)", fontWeight: 600,
    textTransform: "uppercase", letterSpacing: "0.6px", textAlign: "left",
    borderBottom: "1px solid var(--border)",
  },
  td: { padding: "5px 10px", borderBottom: "1px solid rgba(255,255,255,0.04)", color: "var(--text)", fontSize: 12 },
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
  return Array.from({ length: 50 }, (_, i) => {
    const ts_ms = now - (49 - i) * 15 * 60 * 1000;
    temp += (rng(i + 1) - 0.48) * 6;
    temp = Math.max(-25, Math.min(55, temp));
    const d = new Date(ts_ms);
    return {
      id: i, ts_ms,
      label: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
      date: d.toLocaleDateString("ru-RU"),
      temp: +temp.toFixed(2),
      volt: +(3.5 + rng(i + 100) * 0.9).toFixed(3),
    };
  });
}

// ─── Activity 1: Graph Builder ─────────────────────────────────────────────────
function GraphActivity() {
  const [selectedSat, setSelectedSat] = useState(DEMO_SATS[0]);
  const [allPoints, setAllPoints] = useState(() => genDemo(DEMO_SATS[0]));
  const [plotted, setPlotted] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const chartRef = useRef(null);

  const loadReal = useCallback(async () => {
    setLoading(true); setNotice("");
    try {
      const { from, to } = isoDaysAgo(7);
      const data = await fetchTelemetry({ sat: selectedSat, from, to, limit: 100 });
      const pts = (data.points || data || []).filter(p => p.temp_c != null).slice(0, 50).map((p, i) => {
        const d = new Date(p.ts_ms || p.ts * 1000);
        return {
          id: i, ts_ms: d.getTime(),
          label: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
          date: d.toLocaleDateString("ru-RU"),
          temp: +Number(p.temp_c).toFixed(2),
          volt: +Number(p.volt || 3.7).toFixed(3),
        };
      });
      if (pts.length > 0) { setAllPoints(pts); setPlotted([]); setNotice(`Загружено ${pts.length} реальных точек`); }
      else { setNotice("Реальных данных нет — используются демо-данные"); }
    } catch { setNotice("Нет подключения к API — используются демо-данные"); }
    setLoading(false);
  }, [selectedSat]);

  const addPoint = (pt) => {
    if (plotted.find(p => p.id === pt.id)) return;
    setPlotted(prev => [...prev, pt].sort((a, b) => a.ts_ms - b.ts_ms));
  };
  const removePoint = (id) => setPlotted(prev => prev.filter(p => p.id !== id));
  const addAll = () => setPlotted([...allPoints]);
  const clearAll = () => setPlotted([]);

  const downloadCSV = () => {
    const rows = ["Время,Дата,Температура (°C),Напряжение (В)",
      ...plotted.map(p => `${p.label},${p.date},${p.temp},${p.volt}`)];
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" }));
    a.download = `temp_${selectedSat.replace(/\s/g, "_")}.csv`;
    a.click();
  };

  const downloadPNG = () => {
    const svg = chartRef.current?.querySelector("svg");
    if (!svg || plotted.length === 0) return;
    const clone = svg.cloneNode(true);
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("width", "100%"); bg.setAttribute("height", "100%"); bg.setAttribute("fill", "#0d0d1a");
    clone.insertBefore(bg, clone.firstChild);
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = svg.clientWidth || 700; c.height = svg.clientHeight || 300;
      const ctx = c.getContext("2d");
      ctx.fillStyle = "#0d0d1a"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      c.toBlob(b => { const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = `temp_${selectedSat.replace(/\s/g,"_")}.png`; a.click(); }, "image/png");
    };
    img.src = url;
  };

  const stats = plotted.length > 0 ? {
    count: plotted.length,
    min: Math.min(...plotted.map(p => p.temp)),
    max: Math.max(...plotted.map(p => p.temp)),
    avg: +(plotted.reduce((s, p) => s + p.temp, 0) / plotted.length).toFixed(2),
  } : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Controls row */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select
          value={selectedSat}
          onChange={e => { setSelectedSat(e.target.value); setAllPoints(genDemo(e.target.value)); setPlotted([]); setNotice(""); }}
          style={S.select}
        >
          {DEMO_SATS.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <button onClick={loadReal} disabled={loading} style={S.btnSec}>
          {loading ? "⏳ Загрузка..." : "📡 Загрузить реальные данные"}
        </button>
        {notice && <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{notice}</span>}
      </div>

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
                  <th style={S.th}>°C</th>
                  <th style={S.th}>В</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {allPoints.map(pt => {
                  const added = !!plotted.find(p => p.id === pt.id);
                  return (
                    <tr key={pt.id} style={{ background: added ? "rgba(0,212,255,0.06)" : "transparent", transition: "background 0.15s" }}>
                      <td style={S.td}>{pt.label}</td>
                      <td style={{ ...S.td, color: pt.temp < 0 ? "#93c5fd" : pt.temp > 40 ? "#f87171" : "var(--text)", fontWeight: 600 }}>
                        {pt.temp}
                      </td>
                      <td style={{ ...S.td, color: "var(--text-muted)" }}>{pt.volt}</td>
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
              {[["Точек", stats.count], ["Мин °C", stats.min], ["Макс °C", stats.max], ["Среднее °C", stats.avg]].map(([label, val]) => (
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
                <span style={{ fontSize: 32 }}>📈</span>
                <span style={{ color: "var(--text-muted)", fontSize: 13 }}>
                  Нажимай <strong style={{ color: "var(--accent)" }}>+</strong> рядом с точками, чтобы построить график
                </span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={plotted} margin={{ top: 5, right: 8, left: -22, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#6b7280" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} unit="°" />
                  <Tooltip
                    contentStyle={{ background: "#131326", border: "1px solid #2a2a4a", borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [`${v} °C`, "Температура"]}
                  />
                  <ReferenceLine y={0} stroke="#4b5563" strokeDasharray="4 2" />
                  <Line
                    type="monotone" dataKey="temp" stroke="#00d4ff" strokeWidth={2}
                    dot={{ fill: "#00d4ff", r: 3, strokeWidth: 0 }}
                    activeDot={{ r: 5 }} animationDuration={250}
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
  sync: "#fbbf24", sat: "#a78bfa", type: "#6ee7b7",
  ts: "#60a5fa", temp: "#f87171", volt: "#fb923c", cs: "#94a3b8",
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
const DECODE_FIELDS = [
  { key: "sat_id",  label: "ID спутника",            field: "sat",  hint: "Число 1 или 2",           placeholder: "1" },
  { key: "temp",    label: "Температура (°C)",        field: "temp", hint: "Пример: 23.45 или -12.30", placeholder: "0.00" },
  { key: "volt",    label: "Напряжение (В)",          field: "volt", hint: "Пример: 3.750",            placeholder: "0.000" },
  { key: "cs",      label: "Контрольная сумма (hex)", field: "cs",   hint: "Пример: A3 или 0xa3",      placeholder: "XX" },
];

function fieldOk(key, form, pkt) {
  if (key === "sat_id") return Number(form.sat_id) === pkt.satId;
  if (key === "temp") return Math.abs(parseFloat(form.temp) - pkt.tempC) < 0.01;
  if (key === "volt") return Math.abs(parseFloat(form.volt) - pkt.voltV) < 0.005;
  if (key === "cs") {
    const expected = pkt.bytes[12].toString(16).toUpperCase().padStart(2, "0");
    return form.cs.trim().toUpperCase().replace(/^0X/, "") === expected;
  }
  return false;
}

function PacketDecodeActivity() {
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
    ? { sat_id: fieldOk("sat_id", form, pkt), temp: fieldOk("temp", form, pkt), volt: fieldOk("volt", form, pkt), cs: fieldOk("cs", form, pkt) }
    : null;
  const score = results ? Object.values(results).filter(Boolean).length : 0;

  const tsDate = new Date(pkt.unixTs * 1000).toUTCString();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Packet selector */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <select value={packetId} onChange={e => changePacket(e.target.value)} style={S.select}>
          {PACKETS.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button onClick={() => setShowFormat(v => !v)} style={S.btnSec}>
          {showFormat ? "Скрыть" : "Показать"} формат пакета
        </button>
      </div>

      {/* Format reference */}
      {showFormat && (
        <div style={S.card}>
          <div style={{ padding: "10px 16px", borderBottom: "1px solid var(--border)", fontSize: 13, fontWeight: 600 }}>
            📐 Формат телеметрического пакета · 13 байт
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
                  <tr
                    key={row.field}
                    style={{ background: highlightField === row.field ? `${FIELD_COLOR[row.field]}18` : "transparent", transition: "background 0.15s" }}
                    onMouseEnter={() => setHighlightField(row.field)}
                    onMouseLeave={() => setHighlightField(null)}
                  >
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

      {/* Hex dump */}
      <div style={{ background: "#09090f", borderRadius: 12, border: "1px solid var(--border)", padding: "14px 18px" }}>
        <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 10, letterSpacing: "0.5px" }}>
          HEX DUMP &nbsp;·&nbsp; {hexArr.length} байт &nbsp;·&nbsp; наведи мышь на байт, чтобы узнать поле
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {hexArr.map((hex, i) => {
            const f = byteField(i);
            const isHl = highlightField === f;
            return (
              <span
                key={i}
                title={`[${i}] ${f.toUpperCase()}`}
                onMouseEnter={() => setHighlightField(f)}
                onMouseLeave={() => setHighlightField(null)}
                style={{
                  fontFamily: "monospace", fontSize: 14, fontWeight: 600,
                  padding: "3px 8px", borderRadius: 6,
                  background: isHl ? `${FIELD_COLOR[f]}33` : `${FIELD_COLOR[f]}16`,
                  color: FIELD_COLOR[f],
                  border: `1px solid ${isHl ? FIELD_COLOR[f] : FIELD_COLOR[f] + "44"}`,
                  transition: "all 0.12s", cursor: "default",
                  boxShadow: isHl ? `0 0 8px ${FIELD_COLOR[f]}55` : "none",
                }}
              >
                {hex}
              </span>
            );
          })}
        </div>
        <div style={{ marginTop: 12, fontSize: 11, color: "#4b5563" }}>
          TS (справка): {tsDate}
        </div>
      </div>

      {/* Decode form */}
      <div style={{ ...S.card, padding: 18 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 16 }}>🔬 Декодируй поля пакета</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          {DECODE_FIELDS.map(f => {
            const ok = results ? results[f.key] : null;
            return (
              <div key={f.key} onMouseEnter={() => setHighlightField(f.field)} onMouseLeave={() => setHighlightField(null)}>
                <label style={{ display: "block", fontSize: 12, color: "var(--text-muted)", marginBottom: 6 }}>
                  <span style={{ color: FIELD_COLOR[f.field], marginRight: 5 }}>■</span>
                  {f.label}
                </label>
                <input
                  type="text"
                  value={form[f.key]}
                  onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder}
                  disabled={submitted}
                  style={{
                    ...S.input,
                    borderColor: ok === true ? "#22c55e" : ok === false ? "#ef4444" : "var(--border)",
                  }}
                />
                <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>{f.hint}</div>
              </div>
            );
          })}
        </div>

        {!submitted ? (
          <button
            onClick={() => setSubmitted(true)}
            style={{ ...S.btnPrim, marginTop: 18, padding: "10px 24px" }}
          >
            ✅ Проверить
          </button>
        ) : (
          <div style={{
            marginTop: 18, padding: 16, borderRadius: 12,
            background: score === 4 ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${score === 4 ? "#22c55e55" : "#ef444455"}`,
          }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 12, color: score === 4 ? "#22c55e" : "#fb923c" }}>
              {score === 4 ? "🎉 Отлично! Пакет полностью декодирован!" : `⚠ Верно ${score} из 4 полей`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ fontSize: 13 }}>
                {results.sat_id ? "✅" : "❌"} ID спутника:&nbsp;
                <span style={{ color: FIELD_COLOR.sat, fontWeight: 600 }}>{pkt.satId} ({pkt.sat})</span>
              </div>
              <div style={{ fontSize: 13 }}>
                {results.temp ? "✅" : "❌"} Температура:&nbsp;
                <span style={{ color: FIELD_COLOR.temp, fontWeight: 600 }}>{pkt.tempC.toFixed(2)} °C</span>
                {!results.temp && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                    Подсказка: байты 8–9 = {toHexArr(pkt.bytes).slice(8,10).join(" ")} → int16 LE = {Math.round(pkt.tempC * 100)} → делим на 100
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13 }}>
                {results.volt ? "✅" : "❌"} Напряжение:&nbsp;
                <span style={{ color: FIELD_COLOR.volt, fontWeight: 600 }}>{pkt.voltV.toFixed(3)} В</span>
                {!results.volt && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                    Подсказка: байты 10–11 = {toHexArr(pkt.bytes).slice(10,12).join(" ")} → uint16 LE = {Math.round(pkt.voltV * 1000)} → делим на 1000
                  </span>
                )}
              </div>
              <div style={{ fontSize: 13 }}>
                {results.cs ? "✅" : "❌"} Контрольная сумма:&nbsp;
                <span style={{ color: FIELD_COLOR.cs, fontWeight: 600 }}>
                  {pkt.bytes[12].toString(16).toUpperCase().padStart(2, "0")}
                </span>
                {!results.cs && (
                  <span style={{ fontSize: 11, color: "var(--text-muted)", marginLeft: 8 }}>
                    Подсказка: XOR всех 12 байт = {pkt.bytes[12].toString(16).toUpperCase().padStart(2,"0")}
                  </span>
                )}
              </div>
            </div>
            <button
              onClick={() => { setSubmitted(false); setForm({ sat_id: "", temp: "", volt: "", cs: "" }); }}
              style={{ ...S.btnSec, marginTop: 14 }}
            >
              Попробовать снова
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Challenge Page ────────────────────────────────────────────────────────
const ACTIVITIES = [
  {
    key: "graph",
    icon: "📈",
    title: "Построение графиков",
    difficulty: "Легко",
    diffColor: "#22c55e",
    desc: "Выбери спутник, загрузи пакеты с телеметрией и построй график температуры по точкам. Сохраняй результат как CSV или PNG.",
    skills: ["Работа с данными", "Визуализация", "CSV / PNG экспорт"],
  },
  {
    key: "decode",
    icon: "🔐",
    title: "Расшифровка пакетов",
    difficulty: "Средне",
    diffColor: "#f59e0b",
    desc: "Получи сырой двоичный пакет со спутника и декодируй его по протоколу: satellite ID, температуру, напряжение и контрольную сумму.",
    skills: ["Двоичный протокол", "Little-endian", "XOR контрольная сумма"],
  },
];

export default function ChallengePage() {
  const [activity, setActivity] = useState(null);
  const act = ACTIVITIES.find(a => a.key === activity);

  if (!activity) {
    return (
      <div className="page-wrap">
        <div className="page-header-row">
          <div>
            <h1 className="page-title">🏆 Challenge</h1>
            <p className="page-subtitle">Интерактивные задания по работе со спутниковыми данными</p>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 20, maxWidth: 720 }}>
          {ACTIVITIES.map(a => (
            <button
              key={a.key}
              onClick={() => setActivity(a.key)}
              style={{
                textAlign: "left", background: "var(--surface-1)", border: "1px solid var(--border)",
                borderRadius: 16, padding: 24, cursor: "pointer", transition: "border-color 0.2s, box-shadow 0.2s",
                color: "inherit",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = a.diffColor; e.currentTarget.style.boxShadow = `0 0 20px ${a.diffColor}22`; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            >
              <div style={{ fontSize: 40, marginBottom: 14 }}>{a.icon}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 18 }}>{a.title}</span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 9px", borderRadius: 20,
                  background: `${a.diffColor}18`, color: a.diffColor, border: `1px solid ${a.diffColor}44`,
                }}>
                  {a.difficulty}
                </span>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-muted)", lineHeight: 1.65, marginBottom: 16 }}>{a.desc}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {a.skills.map(s => (
                  <span key={s} style={{
                    fontSize: 11, padding: "3px 9px",
                    background: "var(--surface-2)", border: "1px solid var(--border)",
                    borderRadius: 20, color: "var(--text-muted)",
                  }}>{s}</span>
                ))}
              </div>
            </button>
          ))}
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

      {activity === "graph" ? <GraphActivity /> : <PacketDecodeActivity />}
    </div>
  );
}
