import React, { useEffect, useState, useRef } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import NewsPage from "./pages/NewsPage";
import NewsDetailPage from "./pages/NewsDetailPage";
import SatellitesPage from "./pages/SatellitesPage";
import ShipsPage from "./pages/ShipsPage";
import EmiPage from "./pages/EmiPage";
import SdrPage from "./pages/SdrPage";
import DocsPage from "./pages/DocsPage";
import CreatorsPage from "./pages/CreatorsPage";
import AuthPage from "./pages/AuthPage";
import AdminPage from "./pages/AdminPage";

const MENU_ITEMS = [
  { to: "/",           label: "Главная",       icon: "🏠" },
  { to: "/telemetry",  label: "Телеметрия",    icon: "🛰" },
  { to: "/ais",        label: "AIS",           icon: "🚢" },
  { to: "/emi",        label: "ЭМИ",           icon: "⚡" },
  { to: "/sdr",        label: "ИСШ",           icon: "📡" },
  { to: "/docs",       label: "Документация",  icon: "📚" },
  { to: "/creators",   label: "Создатели",     icon: "👨‍🚀" },
];

const ROLE_COLORS = { admin: "var(--accent)", moderator: "var(--yellow)", reader: "var(--text-muted)" };

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
          <div style={{ position: "relative", marginLeft: 12 }} ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(v => !v)}
              style={{
                display: "flex", alignItems: "center", gap: 8, padding: "6px 12px",
                background: "var(--surface-2)", border: "1px solid var(--border)",
                borderRadius: 8, cursor: "pointer", color: "var(--text)", fontSize: 13
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%",
                background: ROLE_COLORS[user.role], flexShrink: 0
              }} />
              <span style={{ maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.email}
              </span>
              <span style={{ fontSize: 10, color: "var(--text-muted)" }}>▾</span>
            </button>
            {userMenuOpen && (
              <div style={{
                position: "absolute", right: 0, top: "calc(100% + 6px)", background: "var(--surface)",
                border: "1px solid var(--border)", borderRadius: 10, padding: 8,
                minWidth: 180, zIndex: 1000, boxShadow: "0 8px 24px rgba(0,0,0,.4)"
              }}>
                <div style={{ padding: "6px 12px 10px", borderBottom: "1px solid var(--border)", marginBottom: 4 }}>
                  <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Роль</div>
                  <div style={{ fontWeight: 600, color: ROLE_COLORS[user.role], fontSize: 13, textTransform: "capitalize" }}>
                    {user.role}
                  </div>
                </div>
                {isAdmin && (
                  <NavLink to="/admin" style={{ display: "block", padding: "8px 12px", borderRadius: 6, color: "var(--text)", fontSize: 13, textDecoration: "none" }}>
                    ⚙️ Управление
                  </NavLink>
                )}
                <button
                  onClick={logout}
                  style={{
                    width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 6,
                    background: "transparent", border: "none", color: "#f87171",
                    fontSize: 13, cursor: "pointer"
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
              marginLeft: 12, padding: "6px 14px", borderRadius: 8, fontSize: 13,
              background: "var(--accent)", color: "#fff", textDecoration: "none", fontWeight: 500
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
        <Route path="/sdr" element={<SdrPage />} />
        <Route path="/docs" element={<DocsPage />} />
        <Route path="/creators" element={<CreatorsPage />} />
        <Route path="/login" element={<AuthPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <footer className="footer">
        <span>PolySpace Ground Station · Polytech University</span>
        <span>API: <a href="/docs" target="_blank" rel="noreferrer">/docs</a></span>
      </footer>
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
