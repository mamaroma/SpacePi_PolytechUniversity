import React, { useEffect, useState, useRef, Suspense, lazy } from "react";
import { Routes, Route, NavLink, Navigate, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./AuthContext";
import NewsPage from "./pages/NewsPage";
import Footer from "./components/Footer";
import { API_BASE } from "./api";

/* Code-splitting: тяжёлые страницы (Leaflet/three/recharts/zip) грузим
 * только когда пользователь действительно перешёл в раздел.
 * Это разгружает первый bundle и заметно ускоряет загрузку «Главной». */
const NewsDetailPage    = lazy(() => import("./pages/NewsDetailPage"));
const SatellitesPage    = lazy(() => import("./pages/SatellitesPage"));
const ShipsPage         = lazy(() => import("./pages/ShipsPage"));
const EmiPage           = lazy(() => import("./pages/EmiPage"));
const DocsPage          = lazy(() => import("./pages/DocsPage"));
const CreatorsPage      = lazy(() => import("./pages/CreatorsPage"));
const AuthPage          = lazy(() => import("./pages/AuthPage"));
const AdminPage         = lazy(() => import("./pages/AdminPage"));
const ChallengePage     = lazy(() => import("./pages/ChallengePage"));
const StoragePage       = lazy(() => import("./pages/StoragePage"));
const SnapshotsPage     = lazy(() => import("./pages/SnapshotsPage"));
const IdentificationPage = lazy(() => import("./pages/IdentificationPage"));
const DocumentationPage  = lazy(() => import("./pages/DocumentationPage"));

const SDR_URL = `${API_BASE}/sdr`;

/* SVG-иконки меню — без эмодзи, геометрический стиль */
const MenuIcons = {
  home: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 9 12 2 21 9"/><path d="M9 22V12h6v10"/><rect x="3" y="9" width="18" height="13" rx="1"/>
    </svg>
  ),
  telemetry: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="2"/><path d="M12 2a10 10 0 0 1 7.07 17.07"/><path d="M12 2a10 10 0 0 0-7.07 17.07"/>
      <path d="M12 6a6 6 0 0 1 4.24 10.24"/><path d="M12 6a6 6 0 0 0-4.24 10.24"/>
    </svg>
  ),
  ais: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 20h20"/><path d="M5 20V8l7-5 7 5v12"/><path d="M9 20v-6h6v6"/>
    </svg>
  ),
  emi: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  ),
  sdr: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="7" strokeDasharray="3 3"/><line x1="12" y1="2" x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/><line x1="2" y1="12" x2="5" y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>
    </svg>
  ),
  challenge: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  ),
  docs: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>
    </svg>
  ),
  creators: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
    </svg>
  ),
  admin: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
    </svg>
  ),
  storage: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v6c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 11v6c0 1.66 4 3 9 3s9-1.34 9-3v-6"/>
    </svg>
  ),
  snapshots: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="14" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 6l1-2h6l1 2"/>
    </svg>
  ),
  identification: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  ),
  documentation: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h13a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3V4z"/>
      <line x1="8" y1="9" x2="16" y2="9"/>
      <line x1="8" y1="13" x2="16" y2="13"/>
      <line x1="8" y1="17" x2="13" y2="17"/>
    </svg>
  ),
};

const MENU_ITEMS = [
  { to: "/",           label: "Главная",      icon: MenuIcons.home },
  { to: "/telemetry",  label: "Телеметрия",   icon: MenuIcons.telemetry },
  { to: "/ais",        label: "AIS",          icon: MenuIcons.ais },
  { to: "/emi",        label: "ЭМИ",          icon: MenuIcons.emi },
  { to: SDR_URL,       label: "SDR",          icon: MenuIcons.sdr, external: true },
  { to: "/challenge",  label: "Challenge",    icon: MenuIcons.challenge },
  { to: "/storage",       label: "Хранилище",     icon: MenuIcons.storage },
  { to: "/snapshots",     label: "Снимки",        icon: MenuIcons.snapshots },
  { to: "/identification", label: "Идентификация", icon: MenuIcons.identification },
  { to: "/docs",          label: "История проекта", icon: MenuIcons.docs },
  { to: "/documentation", label: "Документация",  icon: MenuIcons.documentation },
  { to: "/creators",      label: "Создатели",     icon: MenuIcons.creators },
];

const ROLE_COLORS = { admin: "var(--orange)", moderator: "var(--accent)", reader: "var(--text-muted)" };

function MskClock() {
  const [t, setT] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setT(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const pad = (n) => String(n).padStart(2, "0");
  // MSK = UTC+3
  const msk = new Date(t.getTime() + 3 * 3600 * 1000);
  const s = `${pad(msk.getUTCDate())}.${pad(msk.getUTCMonth()+1)}.${msk.getUTCFullYear()} ${pad(msk.getUTCHours())}:${pad(msk.getUTCMinutes())}:${pad(msk.getUTCSeconds())} МСК`;
  return (
    <span
      className="mono"
      style={{ fontSize: 13, color: "var(--text-dim)", padding: "7px 14px",
               border: "1px solid var(--border)", borderRadius: 8,
               background: "rgba(36,65,40,0.55)", letterSpacing: "0.5px" }}
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
          <img
            src="/polyspace-logo.png"
            alt="PolySpace"
            className="header-logo-img"
          />
          <span className="header-logo-text">
            Poly<span className="header-logo-space">Space</span>
          </span>
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
            <span className="menu-current-label">
          <span className="menu-item-icon">{current.icon}</span>{current.label}
        </span>
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
                  <span className="menu-item-icon">{MenuIcons.admin}</span>
                  <span>Управление</span>
                </NavLink>
              )}
            </nav>
          )}
        </div>

        <div className="header-spacer" />
        <MskClock />

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
                  <NavLink to="/admin" style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderRadius: 8, color: "var(--text)", fontSize: 13, textDecoration: "none" }}>
                    {MenuIcons.admin} Управление
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
            className="header-extras-btn"
          >
            Доп. возможности
          </NavLink>
        )}
      </header>

      <Suspense fallback={
        <div style={{
          minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--text-muted)", fontSize: 14, gap: 10,
        }}>
          <span className="spinner" /> Загрузка раздела…
        </div>
      }>
        <Routes>
          <Route path="/" element={<NewsPage />} />
          <Route path="/news/:id" element={<NewsDetailPage />} />
          <Route path="/telemetry" element={<SatellitesPage />} />
          <Route path="/ais" element={<ShipsPage />} />
          <Route path="/emi" element={<EmiPage />} />
          <Route path="/docs" element={<DocsPage />} />
          <Route path="/creators" element={<CreatorsPage />} />
          <Route path="/challenge" element={<ChallengePage />} />
          <Route path="/storage" element={<StoragePage />} />
          <Route path="/snapshots" element={<SnapshotsPage />} />
          <Route path="/identification" element={<IdentificationPage />} />
          <Route path="/documentation" element={<DocumentationPage />} />
          <Route path="/login" element={<AuthPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>

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
