import React, { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "../AuthContext";
import { fetchGallery, uploadGalleryPhoto, deleteGalleryPhoto } from "../api";

// ── Lightbox ───────────────────────────────────────────────────────────────────
function Lightbox({ photos, index, onClose }) {
  const [cur, setCur] = useState(index);

  const prev = useCallback(() => setCur(i => (i - 1 + photos.length) % photos.length), [photos.length]);
  const next = useCallback(() => setCur(i => (i + 1) % photos.length), [photos.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, prev, next]);

  useEffect(() => { document.body.style.overflow = "hidden"; return () => { document.body.style.overflow = ""; }; }, []);

  const photo = photos[cur];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(5,3,14,0.96)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      {/* Prev */}
      <button
        onClick={e => { e.stopPropagation(); prev(); }}
        style={{
          position: "absolute", left: 20, top: "50%", transform: "translateY(-50%)",
          background: "rgba(114,71,150,0.25)", border: "1px solid rgba(114,71,150,0.5)",
          borderRadius: 8, color: "#e0d8f4", fontSize: 22, width: 44, height: 44,
          cursor: "pointer", display: photos.length < 2 ? "none" : "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >‹</button>

      {/* Image */}
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", display: "flex", flexDirection: "column", gap: 10 }}>
        <img
          src={photo.url}
          alt=""
          style={{
            maxWidth: "90vw", maxHeight: "85vh",
            objectFit: "contain", borderRadius: 8,
            boxShadow: "0 8px 48px rgba(0,0,0,0.8)",
          }}
        />
        <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
          {photos.map((_, i) => (
            <span
              key={i}
              onClick={() => setCur(i)}
              style={{
                width: i === cur ? 18 : 8, height: 8, borderRadius: 4, cursor: "pointer",
                background: i === cur ? "var(--accent, #9460b8)" : "rgba(114,71,150,0.35)",
                transition: "all 0.15s",
              }}
            />
          ))}
        </div>
      </div>

      {/* Next */}
      <button
        onClick={e => { e.stopPropagation(); next(); }}
        style={{
          position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)",
          background: "rgba(114,71,150,0.25)", border: "1px solid rgba(114,71,150,0.5)",
          borderRadius: 8, color: "#e0d8f4", fontSize: 22, width: 44, height: 44,
          cursor: "pointer", display: photos.length < 2 ? "none" : "flex",
          alignItems: "center", justifyContent: "center",
        }}
      >›</button>

      {/* Close */}
      <button
        onClick={onClose}
        style={{
          position: "absolute", top: 18, right: 18,
          background: "rgba(218,73,39,0.18)", border: "1px solid rgba(218,73,39,0.4)",
          borderRadius: 8, color: "#f39768", fontSize: 18, width: 36, height: 36,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >✕</button>
    </div>
  );
}

// ── Gallery grid ───────────────────────────────────────────────────────────────
export default function IdentificationPage() {
  const { user, token, isAdmin } = useAuth();
  const isEditor = user && (user.role === "admin" || user.role === "moderator");

  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const fileRef = useRef(null);

  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await fetchGallery();
      setPhotos(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setUploading(true); setUploadError("");
    try {
      for (const file of files) {
        await uploadGalleryPhoto(file, authHeader);
      }
      await load();
    } catch (err) {
      setUploadError(err?.message || String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo) => {
    if (!window.confirm(`Удалить фото ${photo.filename}?`)) return;
    setDeleteId(photo.key);
    try {
      await deleteGalleryPhoto(photo.filename, authHeader);
      setPhotos(prev => prev.filter(p => p.key !== photo.key));
    } catch (err) {
      alert("Ошибка удаления: " + (err?.message || err));
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="page-wrap">
      {/* ── Header ── */}
      <div className="page-header-row">
        <div>
          <h1 className="page-title">Идентификация</h1>
          <p className="page-subtitle">
            CNN-галерея — снимки и результаты работы нейросети
          </p>
        </div>
        {isEditor && (
          <label style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "9px 18px", borderRadius: 10, cursor: "pointer",
            background: "var(--grad-warm, linear-gradient(135deg,#f39768,#da4927))",
            border: "1px solid var(--orange, #f39768)",
            color: "#1a3220", fontWeight: 700, fontSize: 13,
            boxShadow: "0 4px 14px rgba(243,151,104,0.22)",
            opacity: uploading ? 0.6 : 1,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
            </svg>
            {uploading ? "Загрузка…" : "Загрузить фото"}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              multiple
              style={{ display: "none" }}
              onChange={handleUpload}
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {uploadError && (
        <div style={{
          marginBottom: 16, padding: "10px 16px", borderRadius: 8,
          background: "rgba(218,73,39,0.12)", border: "1px solid rgba(218,73,39,0.4)",
          color: "#f39768", fontSize: 13,
        }}>
          {uploadError}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 260, gap: 12, color: "var(--text-muted)" }}>
          <span className="spinner" />
          Загрузка галереи…
        </div>
      )}

      {/* ── Error ── */}
      {!loading && error && (
        <div style={{
          padding: 24, borderRadius: 12, textAlign: "center",
          background: "rgba(218,73,39,0.08)", border: "1px solid rgba(218,73,39,0.3)",
          color: "#f39768", fontSize: 14,
        }}>
          <div style={{ marginBottom: 8, fontSize: 16, fontWeight: 600 }}>Не удалось загрузить галерею</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>{error}</div>
          <button onClick={load} style={{
            padding: "7px 18px", borderRadius: 8, cursor: "pointer",
            background: "rgba(243,151,104,0.15)", border: "1px solid rgba(243,151,104,0.4)",
            color: "#f39768", fontSize: 13,
          }}>Повторить</button>
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && !error && photos.length === 0 && (
        <div style={{
          minHeight: 320, display: "flex", alignItems: "center", justifyContent: "center",
          borderRadius: 14, border: "1px dashed var(--border)",
          background: "var(--surface-1)",
        }}>
          <div style={{ textAlign: "center", color: "var(--text-muted)", maxWidth: 380 }}>
            <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="var(--accent-2, #9460b8)" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" style={{ margin: "0 auto 16px", opacity: 0.5 }}>
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
            <p style={{ fontSize: 14 }}>
              {isEditor ? "Нет фотографий — нажмите «Загрузить фото»" : "Галерея пуста"}
            </p>
          </div>
        </div>
      )}

      {/* ── Grid ── */}
      {!loading && !error && photos.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
          gap: 12,
        }}>
          {photos.map((photo, idx) => (
            <div
              key={photo.key}
              style={{
                position: "relative", borderRadius: 10, overflow: "hidden",
                background: "var(--surface-1)", border: "1px solid var(--border)",
                aspectRatio: "1 / 1", cursor: "pointer",
                transition: "border-color 0.18s, box-shadow 0.18s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(114,71,150,0.7)"; e.currentTarget.style.boxShadow = "0 0 16px rgba(114,71,150,0.22)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              onClick={() => setLightboxIdx(idx)}
            >
              <img
                src={photo.url}
                alt=""
                loading="lazy"
                style={{
                  width: "100%", height: "100%",
                  objectFit: "cover", display: "block",
                  transition: "transform 0.2s",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; }}
              />
              {isEditor && (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(photo); }}
                  disabled={deleteId === photo.key}
                  title="Удалить фото"
                  style={{
                    position: "absolute", top: 7, right: 7,
                    width: 28, height: 28, borderRadius: 6, cursor: "pointer",
                    background: "rgba(10,5,20,0.75)", border: "1px solid rgba(218,73,39,0.5)",
                    color: "#f39768", fontSize: 14, display: "flex",
                    alignItems: "center", justifyContent: "center",
                    opacity: deleteId === photo.key ? 0.5 : 1,
                  }}
                >
                  {deleteId === photo.key ? "…" : "✕"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={photos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
