import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useAuth } from "../AuthContext";
import { fetchGallery, uploadGalleryPhoto, deleteGalleryPhoto } from "../api";
import { GuideBanner } from "../components/Hint";

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

/* Категории распознавания: зачем класс нужен станции / Space-π. */
const PHOTO_CATEGORIES = [
  {
    key: "icebergs",
    folder: "icebergs",
    title: "Айсберги",
    label: "Iceberg",
    accent: "#5ad6ff",
    demoScore: 0.92,
    description: "Дрейф и отделение айсбергов в полярных океанах.",
    why: "Для Севморпути и полярных миссий: отличить лёд от судна на снимке с КА и предупредить об опасности на маршруте.",
    uses: ["навигация СМП", "ледовая обстановка", "стыковка с AIS"],
  },
  {
    key: "ships",
    folder: "ships",
    title: "Корабли",
    label: "Ship",
    accent: "#f39768",
    demoScore: 0.81,
    description: "Суда в море и портах по силуэту и кильватеру.",
    why: "Дополняет спутниковый AIS: найти «молчащие» суда и сверить визуальный контакт с радиопакетами.",
    uses: ["AIS + оптика", "поиск «тёмных» судов", "портовый мониторинг"],
  },
  {
    key: "blooming",
    folder: "bloom_water",
    title: "Цветущие воды",
    label: "Bloom",
    accent: "#6cc77b",
    demoScore: 0.95,
    description: "Цветение фитопланктона — окраска поверхности воды.",
    why: "Экология и рыболовство: ранний сигнал о bloom-событиях, которые видны с орбиты раньше береговых станций.",
    uses: ["экология", "рыбный промысел", "цвет океана"],
  },
  {
    key: "oil",
    folder: "fuel",
    title: "Разливы нефти",
    label: "Oil",
    accent: "#b765e3",
    demoScore: 0.88,
    description: "Нефтяные плёнки — радужные пятна на воде.",
    why: "Экстренный мониторинг разливов: локализовать пятно и связать с судовым трафиком / зоной интереса.",
    uses: ["экология", "ЧС на море", "контроль акваторий"],
  },
];

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
        label: c.label,
        accent: c.accent,
        demoScore: c.demoScore,
      })),
    };
  });
  const extras = photos || [];
  return { buckets, extras };
}

/** Схема: снимок → CNN → классы → применение на станции. */
function PipelineViz() {
  const steps = [
    { t: "Снимок с КА", d: "кадр бортовой камеры / архив" },
    { t: "CNN", d: "детектор объектов на воде и льду" },
    { t: "Классы", d: "айсберг · судно · bloom · разлив" },
    { t: "Станция", d: "сверка с AIS, картой, кейсами" },
  ];
  return (
    <div className="id-pipeline">
      {steps.map((s, i) => (
        <React.Fragment key={s.t}>
          <div className="id-pipeline-step">
            <div className="id-pipeline-n">{String(i + 1).padStart(2, "0")}</div>
            <div className="id-pipeline-t">{s.t}</div>
            <div className="id-pipeline-d">{s.d}</div>
          </div>
          {i < steps.length - 1 && <div className="id-pipeline-arrow" aria-hidden>→</div>}
        </React.Fragment>
      ))}
    </div>
  );
}

/** Мини-визуализация детекции: рамка + score, как в выдаче модели. */
function DetectionPreview({ accent, label, score, url }) {
  return (
    <div className="id-det-preview" style={{ "--id-accent": accent }}>
      <div className="id-det-frame">
        {url ? (
          <img src={url} alt="" loading="lazy" />
        ) : (
          <div className="id-det-placeholder" />
        )}
        <div className="id-det-box">
          <span className="id-det-tag">{label}: {score.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

function ClassWhyCards({ buckets }) {
  const max = Math.max(1, ...buckets.map((b) => b.photos.length));
  return (
    <div className="id-class-grid">
      {buckets.map((b) => (
        <article key={b.key} className="id-class-card" style={{ "--id-accent": b.accent }}>
          <div className="id-class-top">
            <DetectionPreview
              accent={b.accent}
              label={b.label}
              score={b.demoScore}
              url={b.photos[0]?.url}
            />
            <div className="id-class-meta">
              <div className="id-class-title">{b.title}</div>
              <div className="id-class-count">{b.photos.length} снимков в галерее</div>
              <div className="id-class-bar">
                <i style={{ width: `${Math.round((b.photos.length / max) * 100)}%` }} />
              </div>
            </div>
          </div>
          <p className="id-class-why"><strong>Зачем:</strong> {b.why}</p>
          <div className="id-class-uses">
            {b.uses.map((u) => (
              <span key={u} className="id-class-use">{u}</span>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
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
      <GuideBanner id="identification-intro-v1">
        <strong>Зачем «Идентификация».</strong> Это витрина работы нейросети (CNN)
        по снимкам с орбиты и полярных архивов: модель ищет на кадре объекты
        (айсберг, судно, цветение, разлив) и показывает результат рамкой.
        Раздел нужен, чтобы связать <em>картинку с КА</em> с задачами станции —
        AIS, ледовая обстановка, экология — до запуска своих кейсов.
      </GuideBanner>

      <div className="page-header-row">
        <div>
          <h1 className="page-title">Идентификация</h1>
          <p className="page-subtitle">
            Галерея распознавания: что видит CNN на снимке и зачем эти классы
            нужны наземной станции Space-π / Polytech Universe
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

      <div className="id-overview">
        <div className="id-overview-title">Как это устроено</div>
        <PipelineViz />
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

      {loading && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 260, gap: 12, color: "var(--text-muted)" }}>
          <span className="spinner" />
          Загрузка галереи…
        </div>
      )}

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

      {!loading && !error && (() => {
        const { buckets, extras } = groupPhotos(photos, snimkiManifest);

        const renderPhotoCell = (photo) => {
          const idx = allPhotos.indexOf(photo);
          const isBuiltin = !!photo.isBuiltin;
          const accent = photo.accent || "#9460b8";
          const score = photo.demoScore != null
            ? photo.demoScore
            : (0.75 + ((String(photo.key).length * 17) % 20) / 100);
          return (
            <div
              key={photo.key}
              className="id-photo-cell"
              style={{ "--id-accent": accent }}
              onClick={() => setLightboxIdx(idx)}
            >
              <img src={photo.url} alt="" loading="lazy" />
              {isBuiltin && (
                <div className="id-photo-det">
                  <span>{photo.label || "Object"}: {Number(score).toFixed(2)}</span>
                </div>
              )}
              {isEditor && !isBuiltin && (
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(photo); }}
                  disabled={deleteId === photo.key}
                  title="Удалить фото"
                  className="id-photo-del"
                >
                  {deleteId === photo.key ? "…" : "✕"}
                </button>
              )}
            </div>
          );
        };

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <section>
              <div className="id-overview-title" style={{ marginBottom: 12 }}>
                Подразделы распознавания — зачем каждый класс
              </div>
              <ClassWhyCards buckets={buckets} />
            </section>

            {buckets.map((bucket) => (
              <section key={bucket.key} className="id-gallery-section" style={{ "--id-accent": bucket.accent }}>
                <header className="id-gallery-head">
                  <div className="id-gallery-head-main">
                    <span className="id-gallery-dot" />
                    <h2>{bucket.title}</h2>
                    <span className="id-gallery-n">{bucket.photos.length}</span>
                  </div>
                  <p className="id-gallery-why">{bucket.why}</p>
                  <div className="id-class-uses">
                    {bucket.uses.map((u) => (
                      <span key={u} className="id-class-use">{u}</span>
                    ))}
                  </div>
                </header>

                {bucket.photos.length === 0 ? (
                  <div className="id-gallery-empty">
                    Снимки этой категории пока не загружены.
                  </div>
                ) : (
                  <div className="id-gallery-grid">
                    {bucket.photos.map(renderPhotoCell)}
                  </div>
                )}
              </section>
            ))}

            {extras.length > 0 && (
              <section className="id-gallery-section">
                <header className="id-gallery-head">
                  <div className="id-gallery-head-main">
                    <span className="id-gallery-dot" style={{ background: "var(--text-muted)", boxShadow: "none" }} />
                    <h2>Дополнительные снимки</h2>
                    <span className="id-gallery-n">{extras.length}</span>
                  </div>
                  <p className="id-gallery-why">
                    Загрузки пользователей для расширения набора. Их можно разобрать
                    вручную или позже прогнать через тот же пайплайн CNN.
                  </p>
                </header>
                <div className="id-gallery-grid">
                  {extras.map(renderPhotoCell)}
                </div>
              </section>
            )}
          </div>
        );
      })()}

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
