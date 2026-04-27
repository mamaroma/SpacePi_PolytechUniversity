import React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

const DARK_TOOLTIP = {
  contentStyle: {
    background: "#244128",
    border: "1px solid #56965b",
    borderRadius: 8,
    boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
    color: "#f1ead2",
    fontSize: 12,
    fontFamily: "'Space Mono', monospace",
  },
  labelStyle: { color: "#cbb98c", marginBottom: 4 },
  itemStyle: { color: "#f1ead2" },
};

export default function ChartCard({ title, data, lines, xKey = "x" }) {
  return (
    <div className="chart-card">
      <div className="card-header">
        <span className="card-title">{title}</span>
        <span className="card-meta">{data.length} pts</span>
      </div>

      <div className="chart-inner">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 4, right: 8, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#2e5234"
              vertical={false}
            />
            <XAxis
              dataKey={xKey}
              tick={{ fill: "#8aa090", fontSize: 10, fontFamily: "'Space Mono', monospace" }}
              axisLine={{ stroke: "#2e5234" }}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: "#8aa090", fontSize: 10, fontFamily: "'Space Mono', monospace" }}
              axisLine={false}
              tickLine={false}
              width={44}
            />
            <Tooltip
              contentStyle={DARK_TOOLTIP.contentStyle}
              labelStyle={DARK_TOOLTIP.labelStyle}
              itemStyle={DARK_TOOLTIP.itemStyle}
              cursor={{ stroke: "#56965b", strokeWidth: 1 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 11, fontFamily: "'Inter', sans-serif", paddingTop: 4 }}
            />
            {lines.map((l) => (
              <Line
                key={l.key}
                type="monotone"
                dataKey={l.key}
                name={l.name ?? l.key}
                stroke={l.color ?? "#37b34a"}
                strokeWidth={1.8}
                dot={false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
