import React from "react";

function RssiBars({ dbm }) {
  if (dbm === null || dbm === undefined) return null;
  const v = Number(dbm);
  // -50+ = great (4), -70 = good (3), -90 = fair (2), -110 = weak (1)
  const level = v > -60 ? 4 : v > -80 ? 3 : v > -100 ? 2 : v > -120 ? 1 : 0;
  const cls = level >= 3 ? "on" : level >= 2 ? "warn" : level >= 1 ? "bad" : "";
  const heights = [4, 7, 10, 14];
  return (
    <span className="rssi-bars" title={`RSSI ${dbm} dBm`}>
      {heights.map((h, i) => (
        <span
          key={i}
          className={`rssi-bar${i < level ? " " + cls : ""}`}
          style={{ height: h }}
        />
      ))}
    </span>
  );
}

function formatVal(v, decimals = 1) {
  if (v === null || v === undefined) return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return "—";
  return n.toFixed(decimals);
}

export default function MetricCard({ icon, label, value, unit, color = "col-cyan", decimals = 1, sub, rssi }) {
  const colorMap = {
    "col-green":  "c-green",
    "col-cyan":   "c-cyan",
    "col-red":    "c-red",
    "col-yellow": "c-yellow",
    "col-purple": "c-purple",
  };
  const valColor = colorMap[color] || "c-cyan";

  return (
    <div className={`metric-card ${color}`}>
      <div className="metric-label">{icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}</div>
      <div className="metric-value-row">
        <span className={`metric-value ${valColor}`}>{formatVal(value, decimals)}</span>
        {unit && <span className="metric-unit">{unit}</span>}
        {rssi !== undefined && rssi !== null && <RssiBars dbm={rssi} />}
      </div>
      {sub && <div className="metric-sub">{sub}</div>}
    </div>
  );
}
