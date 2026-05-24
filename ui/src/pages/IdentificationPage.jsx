import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
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

/* Категории тренировочного набора.
 *
 * Сам набор снимков лежит в /ui/public/snimki/{ships,icebergs,bloom_water,fuel}.
 * Это снимки, которые загрузил автор проекта (см. /ui/public/snimki/manifest.json).
 *
 * Пользователь может также через UI загрузить свои фотографии — они попадают
 * в общую «галерею» (`photos`) и отображаются в разделе «Дополнительные снимки».
 */
const PHOTO_CATEGORIES = [
  {
    key: "icebergs",
    folder: "icebergs",
    title: "Айсберги",
    accent: "#5ad6ff",
    description:
      "Снимки полярных областей — отделение и дрейф айсбергов в Северном и Южном океанах.",
  },
  {
    key: "ships",
    folder: "ships",
    title: "Корабли",
    accent: "#f39768",
    description:
      "Детектирование морских судов в открытом море и портах по форме и кильватерному следу.",
  },
  {
    key: "blooming",
    folder: "bloom_water",
    title: "Цветущие воды",
    accent: "#6cc77b",
    description:
      "Цветение фитопланктона — окраска поверхности воды вследствие массового роста микроорганизмов.",
  },
  {
    key: "oil",
    folder: "fuel",
    title: "Разливы нефти",
    accent: "#b765e3",
    description:
      "Обнаружение нефтяных плёнок: характерные радужные пятна на поверхности воды.",
  },
];

/* Группировка по локальным папкам snimki/*.
 * `snimkiManifest` — { ships: ['01.png', ...], icebergs: [...], ... }
 *  Если манифеста нет (например при build без snimki) — категории просто пустые.
 *  Все фотографии, загруженные пользователем через UI, идут в «Дополнительные». */
function groupPhotos(photos, snimkiManifest) {
  const buckets = PHOTO_CATEGORIES.map((c) => {
    const files = (snimkiManifest && snimkiManifest[c.folder]) || [];
    return {
      ...c,
      photos: files.map((name) => ({
        key: `snimki-${c.folder}-${name}`,
        url: `/snimki/${c.folder}/${name}`,
        filename: name,
        isBuiltin: true,
      })),
    };
  });
  const extras = photos || [];
  return { buckets, extras };
}

// ── Gallery grid ───────────────────────────────────────────────────────────────
export default function IdentificationPage() {
  const { user, token, isAdmin } = useAuth();
  const isEditor = user && (user.role === "admin" || user.role === "moderator");

  const [photos, setPhotos] = useState([]);
  const [snimkiManifest, setSnimkiManifest] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [lightboxIdx, setLightboxIdx] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [deleteId, setDeleteId] = useState(null);
  const fileRef = useRef(null);

  // Полный список фото (встроенные snimki + загруженные пользователем) —
  // нужен для корректной работы лайтбокса по индексу.
  const allPhotos = useMemo(() => {
    const { buckets, extras } = groupPhotos(photos, snimkiManifest);
    return [...buckets.flatMap((b) => b.photos), ...extras];
  }, [photos, snimkiManifest]);

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

  // Один раз загружаем manifest со списком встроенных снимков.
  useEffect(() => {
    let cancelled = false;
    fetch("/snimki/manifest.json")
      .then((r) => (r.ok ? r.json() : {}))
      .then((m) => { if (!cancelled) setSnimkiManifest(m); })
      .catch(() => { if (!cancelled) setSnimkiManifest({}); });
    return () => { cancelled = true; };
  }, []);

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

      {/* ── Grid ── */}
      {!loading && !error && (() => {
        const { buckets, extras } = groupPhotos(photos, snimkiManifest);

        const renderPhotoCell = (photo) => {
          const idx = allPhotos.indexOf(photo);
          const isBuiltin = !!photo.isBuiltin;
          return (
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
                  transition: "transform 0.2s, filter 0.2s",
                  imageRendering: "auto",
                  filter: "saturate(1.05) contrast(1.04) brightness(1.02)",
                }}
                onMouseEnter={e => { e.currentTarget.style.transform = "scale(1.04)"; e.currentTarget.style.filter = "saturate(1.12) contrast(1.08) brightness(1.04)"; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "scale(1)"; e.currentTarget.style.filter = "saturate(1.05) contrast(1.04) brightness(1.02)"; }}
              />
              {isEditor && !isBuiltin && (
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
          );
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            {buckets.map((bucket) => (
              <section key={bucket.key}>
                <header
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: `1px solid ${bucket.accent}33`,
                  }}
                >
                  <span
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      background: bucket.accent,
                      boxShadow: `0 0 12px ${bucket.accent}99`,
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 700,
                      color: "var(--text)",
                      letterSpacing: 0.2,
                    }}
                  >
                    {bucket.title}
                  </h2>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {bucket.photos.length}
                  </span>
                  <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                    {bucket.description}
                  </span>
                </header>

                {bucket.photos.length === 0 ? (
                  <div
                    style={{
                      padding: 24,
                      border: "1px dashed var(--border)",
                      borderRadius: 10,
                      textAlign: "center",
                      color: "var(--text-muted)",
                      fontSize: 13,
                    }}
                  >
                    Снимки этой категории пока не загружены.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {bucket.photos.map(renderPhotoCell)}
                  </div>
                )}
              </section>
            ))}

            {extras.length > 0 && (
              <section>
                <header
                  style={{
                    display: "flex",
                    alignItems: "baseline",
                    gap: 10,
                    marginBottom: 10,
                    paddingBottom: 8,
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span
                    style={{
                      width: 10, height: 10, borderRadius: "50%",
                      background: "var(--text-muted)", display: "inline-block", flexShrink: 0,
                    }}
                  />
                  <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
                    Дополнительные снимки
                  </h2>
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                    {extras.length}
                  </span>
                </header>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 12,
                  }}
                >
                  {extras.map(renderPhotoCell)}
                </div>
              </section>
            )}
          </div>
        );
      })()}

      {/* ── Lightbox ── */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={allPhotos}
          index={lightboxIdx}
          onClose={() => setLightboxIdx(null)}
        />
      )}
    </div>
  );
}
