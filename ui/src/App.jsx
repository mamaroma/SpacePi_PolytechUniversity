import React, { useEffect, useState, useRef } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import NewsPage from "./pages/NewsPage";
import NewsDetailPage from "./pages/NewsDetailPage";
import SatellitesPage from "./pages/SatellitesPage";
import ShipsPage from "./pages/ShipsPage";
import EmiPage from "./pages/EmiPage";
import SdrPage from "./pages/SdrPage";
import DocsPage from "./pages/DocsPage";
import CreatorsPage from "./pages/CreatorsPage";

const MENU_ITEMS = [
  { to: "/",           label: "Главная",       icon: "🏠" },
  { to: "/telemetry",  label: "Телеметрия",    icon: "🛰" },
  { to: "/ais",        label: "AIS",           icon: "🚢" },
  { to: "/emi",        label: "ЭМИ",           icon: "⚡" },
  { to: "/sdr",        label: "ИСШ",           icon: "📡" },
  { to: "/docs",       label: "Документация",  icon: "📚" },
  { to: "/creators",   label: "Создатели",     icon: "👨‍🚀" },
];

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

function useCurrentLabel(pathname) {
  for (const item of MENU_ITEMS) {
    if (item.to === "/" && pathname === "/") return item;
    if (item.to !== "/" && pathname.startsWith(item.to)) return item;
  }
  return MENU_ITEMS[0];
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const location = useLocation();
  const current = useCurrentLabel(location.pathname);

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  return (
    <>
      <header className="header">
        <a className="header-logo" href="/">
          <span className="header-logo-icon">🛰</span>
          PolySpace
          <span className="header-badge">GS</span>
        </a>

        <div className="header-sep" />

        <div className="menu-container" ref={menuRef}>
          <button
            className={`menu-trigger ${menuOpen ? "open" : ""}`}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className="menu-hamburger">
              <span /><span /><span />
            </span>
            <span className="menu-current-label">{current.icon} {current.label}</span>
            <span className="menu-chevron">▾</span>
          </button>

          {menuOpen && (
            <nav className="menu-dropdown">
              {MENU_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
                >
                  <span className="menu-item-icon">{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        <div className="header-spacer" />
        <UtcClock />
      </header>

      <Routes>
        <Route path="/" element={<NewsPage />} />
        <Route path="/news/:id" element={<NewsDetailPage />} />
        <Route path="/telemetry" element={<SatellitesPage />} />
        <Route path="/ais" element={<ShipsPage />} />
        <Route path="/emi" element={<EmiPage />} />
        <Route path="/sdr" element={<SdrPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/creators" element={<CreatorsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <footer className="footer">
        <span>PolySpace Ground Station · Polytech University</span>
        <span>API: <a href="/docs" target="_blank" rel="noreferrer">/docs</a></span>
      </footer>
    </>
  );
}
