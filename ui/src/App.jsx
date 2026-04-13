import React, { useEffect, useState } from "react";
import { Routes, Route, NavLink, Navigate } from "react-router-dom";
import SatellitesPage from "./pages/SatellitesPage";
import ShipsPage from "./pages/ShipsPage";
import EmiPage from "./pages/EmiPage";

function UtcClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const s = `${pad(t.getUTCDate())}.${pad(t.getUTCMonth()+1)}.${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
  return <span className="mono" style={{ fontSize: 12, color: "var(--text-dim)" }}>{s}</span>;
}

export default function App() {
  return (
    <>
      <header className="header">
        <a className="header-logo" href="/">
          <span className="header-logo-icon">🛰</span>
          PolySpace
          <span className="header-badge">GS</span>
        </a>

        <div className="header-sep" />

        <nav className="header-nav">
          <NavLink to="/satellites" className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}>
            🛰 Satellites
          </NavLink>
          <NavLink to="/ships" className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}>
            🚢 Ships (AIS)
          </NavLink>
          <NavLink to="/emi" className={({ isActive }) => `nav-tab ${isActive ? "active" : ""}`}>
            ⚡ EMI
          </NavLink>
        </nav>

        <div className="header-spacer" />
        <UtcClock />
      </header>

      <Routes>
        <Route path="/satellites" element={<SatellitesPage />} />
        <Route path="/ships" element={<ShipsPage />} />
        <Route path="/emi" element={<EmiPage />} />
        <Route path="*" element={<Navigate to="/satellites" replace />} />
      </Routes>

      <footer className="footer">
        <span>PolySpace Ground Station · Polytech University</span>
        <span>API: <a href="/docs" target="_blank" rel="noreferrer">/docs</a></span>
      </footer>
    </>
  );
}
