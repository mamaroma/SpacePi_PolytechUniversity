import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchNews, createNews, updateNews, deleteNews } from "../api";
import { useAuth } from "../AuthContext";
import NewsCarousel from "../components/NewsCarousel";
import { GuideBanner } from "../components/Hint";
import SpaceBackground from "../components/SpaceBackground";

const CALENDAR_START = { year: 2025, month: 5 }; // June 2025 (0-based month)

const MONTH_NAMES_RU = [
  "Январь","Февраль","Март","Апрель","Май","Июнь",
  "Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь",
];
const DOW_SHORT = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

function isoDay(iso) {
  if (!iso) return null;
  return iso.slice(0, 10); // "YYYY-MM-DD"
}

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
}

function formatDateLong(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getDate()} ${MONTH_NAMES_RU[d.getMonth()].toLowerCase()} ${d.getFullYear()}`;
}

/* ─── Calendar ──────────────────────────────────────────────────────────── */
function NewsCalendar({ news, selectedDate, onSelectDate }) {
  const navigate = useNavigate();
  const today = new Date();
  const maxYear  = today.getFullYear();
  const maxMonth = today.getMonth();

  // index current month view
  const [viewYear,  setViewYear]  = useState(maxYear);
  const [viewMonth, setViewMonth] = useState(maxMonth);

  // Build a map: "YYYY-MM-DD" → { thumb, count, firstId }
  const dayMap = useMemo(() => {
    const m = {};
    for (const item of news) {
      const day = isoDay(item.created_at);
      if (!day) continue;
      if (!m[day]) {
        m[day] = {
          thumb:   item.images?.[0] ?? null,
          count:   1,
          firstId: item.id,
        };
      } else {
        m[day].count += 1;
      }
    }
    return m;
  }, [news]);

  // navigation limits
  const canPrev = viewYear > CALENDAR_START.year || viewMonth > CALENDAR_START.month;
  const canNext = viewYear < maxYear || viewMonth < maxMonth;

  const goPrev = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  // grid: first weekday of month (Mon=0)
  const firstDay = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
  const offset   = (firstDay + 6) % 7; // shift to Mon=0
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  // list of news for currently-selected date (for tooltip popup)
  const [popup, setPopup] = useState(null); // dayKey string or null
  const popupRef = useRef(null);

  useEffect(() => {
    if (!popup) return;
    const h = (e) => { if (popupRef.current && !popupRef.current.contains(e.target)) setPopup(null); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [popup]);

  const newsForDay = (dayKey) => news.filter(n => isoDay(n.created_at) === dayKey);

  const handleDayClick = (dayKey) => {
    const entry = dayMap[dayKey];
    if (!entry) return;
    // Если за день одна новость — сразу открываем её (как на et.spbstu.ru).
    // Несколько новостей — показываем компактный поп-ап с миниатюрами для
    // выбора. Дополнительно проставляем дату в фильтре ленты.
    onSelectDate(dayKey);
    if (entry.count === 1 && entry.firstId) {
      setPopup(null);
      navigate(`/news/${entry.firstId}`);
      return;
    }
    setPopup(popup === dayKey ? null : dayKey);
  };

  return (
    <div className="news-calendar">
      {/* Header nav */}
      <div className="nc-nav">
        <button className="nc-nav-btn" onClick={goPrev} disabled={!canPrev}>‹</button>
        <span className="nc-month-label">
          {MONTH_NAMES_RU[viewMonth]} {viewYear}
        </span>
        <button className="nc-nav-btn" onClick={goNext} disabled={!canNext}>›</button>
      </div>

      {/* DOW header */}
      <div className="nc-dow-row">
        {DOW_SHORT.map(d => <span key={d} className="nc-dow">{d}</span>)}
      </div>

      {/* Day grid */}
      <div className="nc-grid">
        {/* empty leading cells */}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`e${i}`} className="nc-cell nc-cell--empty" />
        ))}

        {Array.from({ length: daysInMonth }, (_, i) => {
          const day    = i + 1;
          const dayKey = `${viewYear}-${String(viewMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
          const entry  = dayMap[dayKey];
          const hasNews = !!entry;
          const thumb  = entry?.thumb;
          const isToday = day === today.getDate() && viewMonth === today.getMonth() && viewYear === today.getFullYear();
          const isSelected = selectedDate === dayKey;

          return (
            <button
              key={dayKey}
              className={`nc-cell${hasNews ? " nc-cell--has-news" : ""}${isToday ? " nc-cell--today" : ""}${isSelected ? " nc-cell--selected" : ""}`}
              onClick={() => handleDayClick(dayKey)}
              title={hasNews ? `${entry.count} новость(ей) — нажмите, чтобы открыть` : undefined}
              disabled={!hasNews}
            >
              {thumb && (
                <span
                  className="nc-thumb"
                  style={{ backgroundImage: `url(${thumb})` }}
                />
              )}
              <span className="nc-day-num">{day}</span>
              {hasNews && entry.count > 1 && (
                <span className="nc-cell-count">{entry.count}</span>
              )}
              {hasNews && entry.count === 1 && <span className="nc-dot" />}

              {/* Popup mini-list */}
              {popup === dayKey && (
                <div className="nc-popup" ref={popupRef} onClick={e => e.stopPropagation()}>
                  <div className="nc-popup-date">{formatDateLong(dayKey + "T00:00:00Z")}</div>
                  {newsForDay(dayKey).map(n => (
                    <Link key={n.id} to={`/news/${n.id}`} className="nc-popup-item" onClick={() => setPopup(null)}>
                      {n.images?.[0] && (
                        <img src={n.images[0]} alt="" className="nc-popup-thumb" />
                      )}
                      <span className="nc-popup-title">{n.title}</span>
                    </Link>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedDate && (
        <button className="nc-clear-btn" onClick={() => { onSelectDate(null); setPopup(null); }}>
          × Снять фильтр по дате
        </button>
      )}
    </div>
  );
}

/* ─── Single Feed Card ───────────────────────────────────────────────────── */
function NewsFeedCard({ item, isEditor, onDelete, onEdit }) {
  const hasImages = item.images?.length > 0;

  return (
    <article className="nf-card news-card-reveal">
      <div className="nf-card-inner">
        {/* Image strip (left on wide, top on narrow) */}
        {hasImages && (
          <div className="nf-card-media">
            <NewsCarousel images={item.images} />
          </div>
        )}

        {/* Text body */}
        <div className="nf-card-body">
          <div className="nf-card-meta">
            <span className="nf-date">{formatDateLong(item.created_at)}</span>
            <span className="nf-views" title={`${item.views ?? 0} просмотров`}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              {item.views ?? 0}
            </span>
            {isEditor && (
              <>
                <button
                  className="nf-edit-btn"
                  onClick={() => onEdit(item)}
                  title="Редактировать новость"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>
                  </svg>
                </button>
                <button
                  className="nf-delete-btn"
                  onClick={() => onDelete(item.id)}
                  title="Удалить новость"
                >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                  <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                </svg>
              </button>
              </>
            )}
          </div>

          <h2 className="nf-title">{item.title}</h2>
          <p className="nf-desc">{item.description}</p>

          <div className="nf-actions">
            <Link to={`/news/${item.id}`} className="btn btn-sm btn-primary">Читать далее →</Link>
          </div>
        </div>
      </div>
    </article>
  );
}

/* ─── Main Page ─────────────────────────────────────────────────────────── */
export default function NewsPage() {
  const { isEditor, authHeader } = useAuth();
  const [news,       setNews]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [editingId,  setEditingId]  = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);

  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [content,     setContent]     = useState("");
  const [images,      setImages]      = useState([]);
  const [previews,    setPreviews]    = useState([]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setNews(await fetchNews()); }
    catch { setNews([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleImagesChange = (e) => {
    const files = Array.from(e.target.files || []);
    setImages(files);
    setPreviews([]);
    files.forEach(file => {
      const reader = new FileReader();
      reader.onload = ev => setPreviews(prev => [...prev, ev.target.result]);
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (i) => {
    setImages(prev => prev.filter((_, idx) => idx !== i));
    setPreviews(prev => prev.filter((_, idx) => idx !== i));
  };

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setContent("");
    setImages([]);
    setPreviews([]);
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    setTitle(item.title || "");
    setDescription(item.description || "");
    setContent(item.content || item.description || "");
    setImages([]);
    setPreviews([]);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await updateNews(
          editingId,
          { title: title.trim(), description: description.trim(), content: content.trim(), images },
          authHeader,
        );
      } else {
        await createNews(
          { title: title.trim(), description: description.trim(), content: content.trim(), images },
          authHeader,
        );
      }
      resetForm();
      await load();
    } catch (err) {
      alert("Ошибка: " + (err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить эту новость?")) return;
    try { await deleteNews(id, authHeader); await load(); } catch {}
  };

  // Sort newest first, then filter by selected date
  const sortedNews = useMemo(() => {
    const sorted = [...news].sort((a, b) =>
      new Date(b.created_at) - new Date(a.created_at)
    );
    if (!selectedDate) return sorted;
    return sorted.filter(n => isoDay(n.created_at) === selectedDate);
  }, [news, selectedDate]);

  return (
    <div className="app-body news-page-body">
      <SpaceBackground />

      <GuideBanner id="news-intro" icon={null}>
        <strong>Новости проекта.</strong> Обновления наземной станции, запуски спутников,
        активности образовательной программы. Нажмите на дату в календаре, чтобы
        отфильтровать новости за этот день.
      </GuideBanner>

      {/* ── Top row: title + add button ── */}
      <div className="news-header-row">
        <div>
          <h1 className="page-title">Новости PolySpace</h1>
          <p className="page-subtitle">Последние события и обновления наземной станции</p>
        </div>
        {isEditor && (
          <button
            className="btn btn-primary"
            onClick={() => (showForm ? resetForm() : (resetForm(), setShowForm(true)))}
          >
            {showForm ? "Отмена" : "+ Добавить новость"}
          </button>
        )}
      </div>

      {/* ── Add-news form ── */}
      {showForm && (
        <form className="news-form card" onSubmit={handleSubmit}>
          <h2 className="news-form-title">{editingId ? "Редактирование новости" : "Новая новость"}</h2>
          <div className="news-form-grid">
            <div className="news-form-fields">
              <label className="form-label">
                Заголовок *
                <input type="text" className="form-input" value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="Заголовок новости" required />
              </label>
              <label className="form-label">
                Краткое описание *
                <textarea className="form-textarea" rows={2} value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="Краткое описание для карточки" required />
              </label>
              <label className="form-label">
                Полный текст
                <textarea className="form-textarea" rows={5} value={content}
                  onChange={e => setContent(e.target.value)}
                  placeholder="Полный текст новости" />
              </label>
            </div>

            <div className="news-form-image-col">
              <label className="form-label">
                {editingId ? "Новые фотографии (необязательно)" : "Фотографии"}
              </label>
              <label className="image-upload-area image-upload-area--multi">
                <div className="image-upload-placeholder">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M8 5l1-2h6l1 2"/>
                  </svg>
                  <span>{images.length > 0 ? "Добавить ещё" : "Нажмите для выбора"}</span>
                  {images.length > 0 && <span className="image-upload-count">{images.length} фото</span>}
                </div>
                <input type="file" accept="image/*" multiple onChange={handleImagesChange} style={{ display: "none" }} />
              </label>
              {previews.length > 0 && (
                <div className="image-previews-grid">
                  {previews.map((src, i) => (
                    <div key={i} className="image-preview-thumb">
                      <img src={src} alt={`Preview ${i+1}`} />
                      <button type="button" className="image-preview-remove" onClick={() => removeImage(i)}>×</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-success"
              disabled={submitting || !title.trim() || !description.trim()}>
              {submitting ? "Сохранение..." : editingId ? "Сохранить изменения" : "Опубликовать"}
            </button>
            <button type="button" className="btn" onClick={resetForm}>Отмена</button>
          </div>
        </form>
      )}

      {/* ── Main two-column layout ── */}
      <div className="news-layout">
        {/* Left: feed */}
        <div className="news-feed-col">
          {loading ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
              <span className="spinner" style={{ width: 24, height: 24 }} /> Загрузка…
            </div>
          ) : sortedNews.length === 0 ? (
            <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
              {selectedDate
                ? `Новостей за ${selectedDate} нет. `
                : "Новостей пока нет. Добавьте первую!"}
              {selectedDate && (
                <button className="btn btn-sm" style={{ marginLeft: 8 }} onClick={() => setSelectedDate(null)}>
                  Показать все
                </button>
              )}
            </div>
          ) : (
            <div className="news-feed">
              {sortedNews.map((item, idx) => (
                <NewsFeedCard
                  key={item.id}
                  item={item}
                  isEditor={isEditor}
                  onDelete={handleDelete}
                  onEdit={startEdit}
                  style={{ animationDelay: `${Math.min(idx, 6) * 0.08}s` }}
                />
              ))}
            </div>
          )}
        </div>

        {/* Right: calendar (sticky) */}
        <div className="news-calendar-col">
          <NewsCalendar
            news={news}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
          />
        </div>
      </div>
    </div>
  );
}
