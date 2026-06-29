import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { fetchNewsById, trackNewsView, updateNews } from "../api";
import { useAuth } from "../AuthContext";
import NewsCarousel from "../components/NewsCarousel";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const months = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

export default function NewsDetailPage() {
  const { id } = useParams();
  const { isEditor, authHeader } = useAuth();
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");

  useEffect(() => {
    setLoading(true);
    setError("");
    fetchNewsById(id)
      .then((data) => {
        setItem(data);
        setTitle(data.title || "");
        setDescription(data.description || "");
        setContent(data.content || data.description || "");
        try {
          const key = `news-viewed:${id}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            trackNewsView(id)
              .then((res) => {
                if (res && typeof res.views === "number") {
                  setItem((prev) => (prev ? { ...prev, views: res.views } : prev));
                }
              })
              .catch(() => {});
          }
        } catch {
          trackNewsView(id).catch(() => {});
        }
      })
      .catch((e) => setError(e?.message || "Новость не найдена"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSaving(true);
    try {
      const updated = await updateNews(
        id,
        { title: title.trim(), description: description.trim(), content: content.trim() },
        authHeader,
      );
      setItem(updated);
      setEditing(false);
    } catch (err) {
      alert("Ошибка: " + (err?.message || err));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="app-body" style={{ textAlign: "center", padding: 80 }}>
        <span className="spinner" style={{ width: 24, height: 24 }} />
      </div>
    );
  }

  if (error || !item) {
    return (
      <div className="app-body">
        <div className="card" style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📰</div>
          <h2 style={{ color: "var(--text-dim)", marginBottom: 8 }}>Новость не найдена</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: 20 }}>{error}</p>
          <Link to="/" className="btn btn-primary">На главную</Link>
        </div>
      </div>
    );
  }

  const images = item.images?.length ? item.images : (item.image_url ? [item.image_url] : []);

  return (
    <div className="app-body">
      <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
        <Link to="/" className="btn btn-sm" style={{ display: "inline-flex" }}>
          ← Назад к новостям
        </Link>
        {isEditor && !editing && (
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setEditing(true)}>
            Редактировать
          </button>
        )}
      </div>

      {editing ? (
        <form className="news-form card" onSubmit={handleSave}>
          <h2 className="news-form-title">Редактирование новости</h2>
          <label className="form-label">
            Заголовок *
            <input type="text" className="form-input" value={title}
              onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label className="form-label">
            Краткое описание *
            <textarea className="form-textarea" rows={2} value={description}
              onChange={(e) => setDescription(e.target.value)} required />
          </label>
          <label className="form-label">
            Полный текст
            <textarea className="form-textarea" rows={12} value={content}
              onChange={(e) => setContent(e.target.value)} />
          </label>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-success" disabled={saving}>
              {saving ? "Сохранение..." : "Сохранить"}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setEditing(false);
                setTitle(item.title || "");
                setDescription(item.description || "");
                setContent(item.content || item.description || "");
              }}
            >
              Отмена
            </button>
          </div>
        </form>
      ) : (
        <article className="news-detail card">
          {images.length > 0 && (
            <div className="news-detail-media">
              <NewsCarousel images={images} compact={false} />
            </div>
          )}
          <div className="news-detail-body">
            <div className="news-detail-meta">
              <span className="news-card-date">{formatDate(item.created_at)}</span>
              <span className="news-views">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                {item.views ?? 0}
              </span>
            </div>
            <h1 className="news-detail-title">{item.title}</h1>
            <div className="news-detail-content">
              {(item.content || item.description).split("\n").map((para, i) => (
                para.trim() ? <p key={i}>{para}</p> : null
              ))}
            </div>
          </div>
        </article>
      )}
    </div>
  );
}
