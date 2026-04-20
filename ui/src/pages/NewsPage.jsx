import React, { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { fetchNews, createNews, deleteNews } from "../api";

function formatDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${mon}.${year}`;
}

export default function NewsPage() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setNews(await fetchNews());
    } catch {
      setNews([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleImageChange = (e) => {
    const file = e.target.files?.[0];
    setImage(file || null);
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setImagePreview(ev.target.result);
      reader.readAsDataURL(file);
    } else {
      setImagePreview(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);
    try {
      await createNews({ title: title.trim(), description: description.trim(), content: content.trim(), image });
      setTitle("");
      setDescription("");
      setContent("");
      setImage(null);
      setImagePreview(null);
      setShowForm(false);
      await load();
    } catch (err) {
      alert("Ошибка: " + (err?.message || err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm("Удалить эту новость?")) return;
    try {
      await deleteNews(id);
      await load();
    } catch {}
  };

  return (
    <div className="app-body">
      <div className="news-header-row">
        <div>
          <h1 className="page-title">Новости PolySpace</h1>
          <p className="page-subtitle">Последние события и обновления наземной станции</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? "Отмена" : "+ Добавить новость"}
        </button>
      </div>

      {showForm && (
        <form className="news-form card" onSubmit={handleSubmit}>
          <div className="news-form-grid">
            <div className="news-form-fields">
              <label className="form-label">
                Заголовок *
                <input
                  type="text"
                  className="form-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Заголовок новости"
                  required
                />
              </label>
              <label className="form-label">
                Краткое описание *
                <textarea
                  className="form-textarea"
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Краткое описание для карточки"
                  required
                />
              </label>
              <label className="form-label">
                Полный текст
                <textarea
                  className="form-textarea"
                  rows={5}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Полный текст новости (отображается на странице новости)"
                />
              </label>
            </div>
            <div className="news-form-image-col">
              <label className="form-label">Изображение</label>
              <label className="image-upload-area">
                {imagePreview ? (
                  <img src={imagePreview} alt="Preview" className="image-preview" />
                ) : (
                  <div className="image-upload-placeholder">
                    <span style={{ fontSize: 28 }}>📷</span>
                    <span>Нажмите для выбора</span>
                  </div>
                )}
                <input type="file" accept="image/*" onChange={handleImageChange} style={{ display: "none" }} />
              </label>
              {image && (
                <button type="button" className="btn btn-sm" onClick={() => { setImage(null); setImagePreview(null); }} style={{ marginTop: 8 }}>
                  Убрать фото
                </button>
              )}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <button type="submit" className="btn btn-success" disabled={submitting || !title.trim() || !description.trim()}>
              {submitting ? "Публикация..." : "Опубликовать"}
            </button>
            <button type="button" className="btn" onClick={() => setShowForm(false)}>Отмена</button>
          </div>
        </form>
      )}

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          <span className="spinner" style={{ width: 24, height: 24 }} /> Загрузка...
        </div>
      ) : news.length === 0 ? (
        <div style={{ textAlign: "center", padding: 60, color: "var(--text-muted)" }}>
          Новостей пока нет. Добавьте первую!
        </div>
      ) : (
        <div className="news-grid">
          {news.map((item) => (
            <article key={item.id} className="news-card card">
              {item.image_url && (
                <div className="news-card-image">
                  <img
                    src={item.image_url}
                    alt={item.title}
                    onError={(e) => { e.currentTarget.parentElement.style.display = "none"; }}
                  />
                </div>
              )}
              <div className="news-card-body">
                <div className="news-card-date">{formatDate(item.created_at)}</div>
                <h2 className="news-card-title">{item.title}</h2>
                <p className="news-card-desc">{item.description}</p>
                <div className="news-card-actions">
                  <Link to={`/news/${item.id}`} className="btn btn-sm btn-primary">Читать далее</Link>
                  <button className="btn btn-sm" onClick={() => handleDelete(item.id)} title="Удалить">🗑</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
