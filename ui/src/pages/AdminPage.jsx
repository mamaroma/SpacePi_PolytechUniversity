import React, { useEffect, useState } from "react";
import { useAuth } from "../AuthContext";
import { useNavigate } from "react-router-dom";
import { fetchStorageSecretKey } from "../api";

const BASE = import.meta.env.VITE_API_BASE || "";
const ROLE_COLORS = { admin: "var(--accent)", moderator: "var(--yellow)", reader: "var(--text-muted)" };
const ROLE_LABELS = { admin: "Admin", moderator: "Moderator", reader: "Reader" };

function SecretKeyCard({ authHeader }) {
  const [shown, setShown] = useState(false);
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const reveal = async () => {
    if (shown) { setShown(false); return; }
    setBusy(true); setErr("");
    try {
      const r = await fetchStorageSecretKey(authHeader);
      setKey(r.secret_key);
      setShown(true);
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!key) return;
    try { await navigator.clipboard.writeText(key); } catch {}
  };

  return (
    <div className="card" style={{ marginBottom: 20, borderColor: "rgba(218,73,39,0.45)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "var(--orange-2)", marginBottom: 6 }}>
            Secret Key для Хранилища
          </div>
          <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.55 }}>
            Этот ключ выдают пользователям с ролью <strong>Reader</strong>, чтобы
            они могли получить доступ к разделу <em>«Хранилище»</em>. Ключ
            фиксированный — он никогда не меняется.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-primary" onClick={reveal} disabled={busy}>
            {busy ? "…" : shown ? "Скрыть" : "Показать ключ"}
          </button>
          {shown && (
            <button className="btn" onClick={copy}>Копировать</button>
          )}
        </div>
      </div>

      {err && (
        <div style={{ marginTop: 10, color: "var(--orange-2)", fontSize: 13 }}>{err}</div>
      )}

      {shown && (
        <div style={{
          marginTop: 14, padding: "12px 14px", borderRadius: 10,
          background: "#130e22", border: "1px solid rgba(218,73,39,0.55)",
          fontFamily: "'Space Mono', monospace", fontSize: 13,
          color: "var(--orange)", letterSpacing: "0.5px",
          wordBreak: "break-all", lineHeight: 1.5,
        }}>
          {key}
        </div>
      )}
    </div>
  );
}

export default function AdminPage() {
  const { user, authHeader, isAdmin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isAdmin) { navigate("/"); return; }
    fetch(BASE + "/api/auth/users", { headers: authHeader })
      .then(r => r.json())
      .then(setUsers)
      .catch(() => setError("Не удалось загрузить список пользователей"))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  const changeRole = async (userId, newRole) => {
    setUpdating(userId);
    try {
      const res = await fetch(BASE + `/api/auth/users/${userId}/role`, {
        method: "PATCH",
        headers: { ...authHeader, "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      setUsers(prev => prev.map(u => u.id === userId ? updated : u));
    } catch {
      setError("Не удалось изменить роль");
    } finally {
      setUpdating(null);
    }
  };

  if (!isAdmin) return null;

  return (
    <div className="app-body">
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Управление пользователями</h1>
          <p className="page-subtitle">Назначение ролей · только для администратора</p>
        </div>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>Вы: <strong style={{ color: "var(--accent)" }}>{user?.email}</strong></span>
        </div>
      </div>

      {error && (
        <div style={{ background: "rgba(218,73,39,0.14)", border: "1px solid rgba(218,73,39,0.4)", borderRadius: 8, padding: "10px 16px", color: "#da4927", fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      <SecretKeyCard authHeader={authHeader} />

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <div key={role} className="metric-card" style={{ flex: 1 }}>
            <div className="metric-body">
              <div className="metric-label" style={{ color: ROLE_COLORS[role] }}>{label}</div>
              <div className="metric-value">{users.filter(u => u.role === role).length}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Пользователи</span>
          <span className="card-meta">{users.length} всего</span>
        </div>
        {loading ? (
          <div style={{ padding: 32, textAlign: "center", color: "var(--text-muted)" }}>Загрузка…</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Email</th>
                  <th>Роль</th>
                  <th>Зарегистрирован</th>
                  <th>Изменить роль</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id}>
                    <td style={{ color: "var(--text-muted)", fontFamily: "monospace" }}>#{u.id}</td>
                    <td>{u.email}</td>
                    <td>
                      <span style={{
                        color: ROLE_COLORS[u.role], fontWeight: 600, fontSize: 12,
                        background: `${ROLE_COLORS[u.role]}20`, padding: "2px 10px",
                        borderRadius: 20, border: `1px solid ${ROLE_COLORS[u.role]}40`
                      }}>
                        {ROLE_LABELS[u.role]}
                      </span>
                    </td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12 }}>
                      {new Date(u.created_at).toLocaleString("ru")}
                    </td>
                    <td>
                      {u.id === user?.id ? (
                        <span style={{ color: "var(--text-muted)", fontSize: 12 }}>— вы</span>
                      ) : (
                        <div style={{ display: "flex", gap: 6 }}>
                          {["reader", "moderator", "admin"].map(role => (
                            <button
                              key={role}
                              disabled={u.role === role || updating === u.id}
                              onClick={() => changeRole(u.id, role)}
                              style={{
                                padding: "4px 10px", borderRadius: 6, fontSize: 11, cursor: "pointer",
                                border: `1px solid ${ROLE_COLORS[role]}`,
                                background: u.role === role ? `${ROLE_COLORS[role]}25` : "transparent",
                                color: ROLE_COLORS[role],
                                opacity: u.role === role || updating === u.id ? 0.5 : 1,
                              }}
                            >
                              {ROLE_LABELS[role]}
                            </button>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
