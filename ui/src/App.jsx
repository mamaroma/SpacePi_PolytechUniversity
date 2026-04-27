import React, { useEffect, useState, useRef } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import NewsPage from "./pages/NewsPage";
import NewsDetailPage from "./pages/NewsDetailPage";
import SatellitesPage from "./pages/SatellitesPage";
import ShipsPage from "./pages/ShipsPage";
import EmiPage from "./pages/EmiPage";
import DocsPage from "./pages/DocsPage";
import CreatorsPage from "./pages/CreatorsPage";
import AuthPage from "./pages/AuthPage";
import AdminPage from "./pages/AdminPage";
import ChallengePage from "./pages/ChallengePage";
import Footer from "./components/Footer";
import { API_BASE } from "./api";

const SDR_URL = `${API_BASE}/sdr`;

const MENU_ITEMS = [
  { to: "/",           label: "Главная",       icon: "🏠" },
  { to: "/telemetry",  label: "Телеметрия",    icon: "🛰" },
  { to: "/ais",        label: "AIS",           icon: "🚢" },
  { to: "/emi",        label: "ЭМИ",           icon: "⚡" },
  { to: SDR_URL,       label: "SDR",           icon: "📡", external: true },
  { to: "/challenge",  label: "Challenge",     icon: "🏆" },
  { to: "/docs",       label: "Документация",  icon: "📚" },
  { to: "/creators",   label: "Создатели",     icon: "👨‍🚀" },
];

const ROLE_COLORS = { admin: "var(--orange)", moderator: "var(--accent)", reader: "var(--text-muted)" };

function UtcClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  const s = `${pad(t.getUTCDate())}.${pad(t.getUTCMonth()+1)}.${t.getUTCFullYear()} ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())} UTC`;
  return (
    <span
      className="mono"
      style={{ fontSize: 14, color: "var(--text-dim)", padding: "8px 14px",
               border: "1px solid var(--border)", borderRadius: 10,
               background: "rgba(36,65,40,0.55)" }}
    >
      {s}
    </span>
  );
}

function useCurrentLabel(pathname) {
  for (const item of MENU_ITEMS) {
    if (item.external) continue;
    if (item.to === "/" && pathname === "/") return item;
    if (item.to !== "/" && pathname.startsWith(item.to)) return item;
  }
  return MENU_ITEMS[0];
}

function AppInner() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef(null);
  const userMenuRef = useRef(null);
  const location = useLocation();
  const current = useCurrentLabel(location.pathname);
  const { user, logout, isAdmin } = useAuth();

  useEffect(() => { setMenuOpen(false); setUserMenuOpen(false); }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return;
    const h = (e) => { if (userMenuRef.current && !userMenuRef.current.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [userMenuOpen]);

  return (
    <>
      <header className="header">
        <a className="header-logo" href="/">
          <span className="header-logo-icon">🛰</span>
          PolySpace
          <span className="header-badge">Ground Station</span>
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
                item.external ? (
                  <a
                    key={item.to}
                    href={item.to}
                    target="_blank"
                    rel="noreferrer"
                    className="menu-item"
                    onClick={() => setMenuOpen(false)}
                  >
                    <span className="menu-item-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>↗</span>
                  </a>
                ) : (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}
                  >
                    <span className="menu-item-icon">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                )
              ))}
              {isAdmin && (
                <NavLink to="/admin" className={({ isActive }) => `menu-item ${isActive ? "active" : ""}`}>
                  <span className="menu-item-icon">⚙️</span>
                  <span>Управление</span>
                </NavLink>
              )}
            </nav>
          )}
        </div>

        <div className="header-spacer" />
        <UtcClock />

        {/* User section */}
        {user ? (
          <div style={{ position: "relative", marginLeft: 14 }} ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "12px 16px",
                background: "var(--surface-2)", border: "1px solid var(--border-hi)",
                borderRadius: 12, cursor: "pointer", color: "var(--text)", fontSize: 14,
                fontWeight: 500,
              }}
            >
              <span style={{
                width: 10, height: 10, borderRadius: "50%",
                background: ROLE_COLORS[user.role], flexShrink: 0,
                boxShadow: `0 0 8px ${ROLE_COLORS[user.role]}`
              }} />
              <span style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </span>
              <span style={{ fontSize: 12, color: "var(--orange)" }}>▾</span>
            </button>
            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 8px)", background: "var(--surface-1)",
                border: "1px solid var(--border-hi)", borderRadius: 12, padding: 8,
                minWidth: 200, zIndex: 10000, boxShadow: "0 12px 32px rgba(0,0,0,.7)"
              }}>
                <div style={{ padding: "8px 12px 10px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Роль</div>
                  <div style={{ fontWeight: 700, color: ROLE_COLORS[user.role], fontSize: 14, textTransform: "capitalize" }}>
                    {user.role}
                  </div>
                </div>
                {isAdmin && (
                  <NavLink to="/admin" style={{ display: "block", padding: "8px 12px", borderRadius: 8, color: "var(--text)", fontSize: 13, textDecoration: "none" }}>
                    ⚙️ Управление
                  </NavLink>
                )}
                <button
                  onClick={logout}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8,
                    background: "transparent", border: "none", color: "var(--orange-2)",
                    fontSize: 13, cursor: "pointer", fontWeight: 600,
                  }}
                >
                  Выйти
                </button>
              </div>
            )}
          </div>
        ) : (
          <NavLink
            to="/login"
            style={{
              marginLeft: 14, padding: "12px 22px", borderRadius: 12, fontSize: 14,
              background: "linear-gradient(135deg, var(--orange) 0%, var(--orange-2) 100%)",
              color: "#1a3220", textDecoration: "none", fontWeight: 700,
              boxShadow: "0 4px 14px rgba(218,73,39,0.30)",
            }}
          >
            Войти
          </NavLink>
        )}
      </header>

      <Routes>
        <Route path="/" element={<NewsPage />} />
        <Route path="/news/:id" element={<NewsDetailPage />} />
        <Route path="/telemetry" element={<SatellitesPage />} />
        <Route path="/ais" element={<ShipsPage />} />
        <Route path="/emi" element={<EmiPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/creators" element={<CreatorsPage />} />
        <Route path="/challenge" element={<ChallengePage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <Footer />
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppInner />
    </AuthProvider>
  );
}
